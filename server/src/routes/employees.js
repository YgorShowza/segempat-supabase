import { Router } from "express";
import { query, queryOne, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin, requireAuth } from "../session.js";
import { asBool, asyncHandler, badRequest, conflict, forbidden, notFound, requireOneOf, requireText, uuid } from "../util.js";

export const employeesRouter = Router();

const SECTORS = ["CFTV", "Vigilância", "Portaria", "Ronda", "Operações", "Administrativo"];
const PROFILES = ["Inspetor", "Operacional"];
const STATUSES = ["Ativo", "Inativo"];

function mapEmployee(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    matricula: row.matricula,
    sector: row.sector,
    access_profile: row.access_profile,
    status: row.status,
    level: Number(row.level ?? 1),
    points: Number(row.points ?? 0),
    first_access: asBool(row.first_access),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

employeesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = req.user.isAdmin
      ? await query(`SELECT * FROM employees ORDER BY full_name ASC`)
      : await query(
          `SELECT * FROM employees WHERE status = 'Ativo' AND (sector = ? OR sector = 'Todos') ORDER BY full_name ASC`,
          [req.user.setor ?? ""],
        );
    res.json(rows.map(mapEmployee));
  }),
);

employeesRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const employee = await queryOne(
      `SELECT * FROM employees WHERE id = ? AND status = 'Ativo' LIMIT 1`,
      [req.user.employeeId],
    );
    if (!employee) throw notFound("Colaborador não encontrado");
    res.json(mapEmployee(employee));
  }),
);

function readEmployeeInput(body, { partial = false } = {}) {
  const input = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);

  if (!partial || has("full_name")) input.full_name = requireText(body?.full_name, "Nome completo");
  if (!partial || has("matricula")) input.matricula = requireText(body?.matricula, "Matrícula");
  if (!partial || has("sector")) input.sector = requireOneOf(body?.sector, SECTORS, "Setor");
  if (!partial || has("access_profile")) input.access_profile = requireOneOf(body?.access_profile, PROFILES, "Perfil de acesso", "Operacional");
  if (!partial || has("status")) input.status = requireOneOf(body?.status, STATUSES, "Situação", "Ativo");

  if (partial && Object.keys(input).length === 0) throw badRequest("Nenhum campo para atualizar");
  return input;
}

function assertOperationalPrivilegeBoundary(input, lockedEmployee = null) {
  if (!lockedEmployee && input.access_profile === "Inspetor") {
    throw forbidden("Perfil Inspetor é administrado exclusivamente pela TI");
  }

  if (!lockedEmployee) return;

  const isCurrentInspector = lockedEmployee.access_profile === "Inspetor";
  const changesProfile = Object.prototype.hasOwnProperty.call(input, "access_profile") && input.access_profile !== lockedEmployee.access_profile;
  const changesStatus = Object.prototype.hasOwnProperty.call(input, "status") && input.status !== lockedEmployee.status;
  const changesMatricula = Object.prototype.hasOwnProperty.call(input, "matricula")
    && String(input.matricula).trim().toLowerCase() !== String(lockedEmployee.matricula).trim().toLowerCase();
  const promotesToInspector = input.access_profile === "Inspetor" && !isCurrentInspector;

  if (promotesToInspector || (isCurrentInspector && (changesProfile || changesStatus || changesMatricula))) {
    throw forbidden("Privilégio de Inspetor, status e identidade privilegiada são administrados exclusivamente pela TI");
  }
}

async function hasAccountOrHistory(connection, employee) {
  const [rows] = await connection.execute(
    `SELECT
       (SELECT COUNT(*) FROM app_users u WHERE LOWER(TRIM(u.matricula)) = LOWER(TRIM(?))) AS accounts,
       (SELECT COUNT(*) FROM cronograma_entries WHERE employee_id = ?) AS cronograma,
       (SELECT COUNT(*) FROM occurrences WHERE employee_id = ?) AS occurrences,
       (SELECT COUNT(*) FROM practical_evaluations WHERE employee_id = ?) AS practical,
       (SELECT COUNT(*) FROM training_activity_attempts WHERE employee_id = ?) AS training,
       (SELECT COUNT(*) FROM exam_attempts WHERE LOWER(TRIM(COALESCE(matricula,''))) = LOWER(TRIM(?))) AS attempts`,
    [employee.matricula, employee.id, employee.id, employee.id, employee.id, employee.matricula],
  );
  return Object.values(rows[0] ?? {}).some((value) => Number(value) > 0);
}

async function lockLinkedAccessAccount(connection, matricula) {
  const [accounts] = await connection.execute(
    `SELECT id, status
       FROM app_users
      WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?))
      LIMIT 1
      FOR UPDATE`,
    [matricula],
  );
  const account = accounts[0] ?? null;
  if (!account) return { account: null, level: null };

  const [levels] = await connection.execute(
    `SELECT level_code
       FROM user_access_levels
      WHERE user_id = ?
      LIMIT 1
      FOR UPDATE`,
    [account.id],
  );
  return { account, level: levels[0]?.level_code ?? null };
}

employeesRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = readEmployeeInput(req.body);
    assertOperationalPrivilegeBoundary(input);
    const id = uuid();
    await withTransaction(async (connection) => {
      const [duplicates] = await connection.execute(
        `SELECT id FROM employees WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?)) LIMIT 1 FOR UPDATE`,
        [input.matricula],
      );
      if (duplicates.length) throw conflict("Já existe colaborador com esta matrícula");
      await connection.execute(
        `INSERT INTO employees (id, full_name, matricula, sector, access_profile, status, level, points, first_access, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [id, input.full_name, input.matricula, input.sector, input.access_profile, input.status],
      );
      await audit(req.user.id, "INSERT", "employees", id, { new: { ...input, id }, atomic: true, privilege_boundary: "operational" }, connection);
    });
    res.status(201).json({ id });
  }),
);

employeesRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = readEmployeeInput(req.body, { partial: true });
    const fields = Object.keys(input);
    await withTransaction(async (connection) => {
      const [lockedRows] = await connection.execute(`SELECT * FROM employees WHERE id = ? FOR UPDATE`, [req.params.id]);
      const lockedEmployee = lockedRows[0];
      if (!lockedEmployee) throw notFound("Colaborador não encontrado");

      assertOperationalPrivilegeBoundary(input, lockedEmployee);

      const statusChanged = Object.prototype.hasOwnProperty.call(input, "status") && input.status !== lockedEmployee.status;
      const linkedAccess = input.access_profile || input.status
        ? await lockLinkedAccessAccount(connection, lockedEmployee.matricula)
        : { account: null, level: null };
      const linkedAccount = linkedAccess.account;
      const linkedLevel = linkedAccess.level;

      if (statusChanged && input.status === "Inativo" && linkedLevel === "master") {
        throw conflict(
          "Cadastro vinculado a Administrador Master não pode ser inativado pela Gestão de Equipe. Primeiro transfira ou remova o nível Master em Acessos.",
        );
      }

      if (input.matricula && input.matricula.trim().toLowerCase() !== String(lockedEmployee.matricula).trim().toLowerCase()) {
        if (await hasAccountOrHistory(connection, lockedEmployee)) {
          throw conflict("Matrícula de colaborador com conta ou histórico não pode ser alterada. Inative o cadastro.");
        }
        const [duplicates] = await connection.execute(
          `SELECT id FROM employees WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1 FOR UPDATE`,
          [input.matricula, lockedEmployee.id],
        );
        if (duplicates.length) throw conflict("Já existe colaborador com esta matrícula");
      }

      await connection.execute(
        `UPDATE employees SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
        [...fields.map((field) => input[field]), lockedEmployee.id],
      );

      let sessionsRevoked = false;
      if ((input.access_profile || input.status) && linkedAccount) {
        const profile = input.access_profile ?? lockedEmployee.access_profile;
        const status = input.status ?? lockedEmployee.status;

        // O nível granular é a fonte de verdade. Um Master mantém a role administrativa
        // legada mesmo se o perfil funcional não for Inspetor.
        if (linkedLevel === "master" || (profile === "Inspetor" && status === "Ativo")) {
          await connection.execute(`INSERT IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')`, [uuid(), linkedAccount.id]);
        } else {
          await connection.execute(`DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'`, [linkedAccount.id]);
        }

        if (statusChanged) {
          await connection.execute(
            `UPDATE app_users
                SET session_epoch = session_epoch + 1, updated_at = UTC_TIMESTAMP(3)
              WHERE id = ?`,
            [linkedAccount.id],
          );
          sessionsRevoked = true;
        }
      }

      await audit(req.user.id, "UPDATE", "employees", lockedEmployee.id, {
        old: lockedEmployee,
        new: input,
        role_sync_atomic: true,
        privilege_boundary: "operational",
        sessions_revoked: sessionsRevoked,
        master_status_guard: linkedLevel === "master",
      }, connection);
    });
    res.status(204).end();
  }),
);

employeesRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      const [lockedRows] = await connection.execute(`SELECT * FROM employees WHERE id = ? FOR UPDATE`, [req.params.id]);
      const lockedEmployee = lockedRows[0];
      if (!lockedEmployee) throw notFound("Colaborador não encontrado");
      if (lockedEmployee.access_profile === "Inspetor") {
        throw forbidden("Cadastro de Inspetor é administrado exclusivamente pela TI");
      }
      if (await hasAccountOrHistory(connection, lockedEmployee)) {
        throw conflict("Colaborador possui conta ou histórico operacional. Inative o cadastro em vez de excluir.");
      }
      await connection.execute(`DELETE FROM employees WHERE id = ?`, [lockedEmployee.id]);
      await audit(req.user.id, "DELETE", "employees", lockedEmployee.id, { old: lockedEmployee, history_guard_atomic: true, privilege_boundary: "operational" }, connection);
    });
    res.status(204).end();
  }),
);
