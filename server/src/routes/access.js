import { Router } from "express";
import bcrypt from "bcryptjs";
import { query, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { fallbackLevel, levelDefinition } from "../authorization.js";
import {
  lockActiveUserAuthorization,
  lockEffectiveAuthorization,
  passwordResetAuthority,
} from "../password-reset-policy.js";
import { requireAdmin } from "../session.js";
import { asyncHandler, badRequest, conflict, forbidden, notFound, numericCode } from "../util.js";

export const accessRouter = Router();

const CODE_TTL_HOURS = 24;
const RESET_CODE_TTL_MINUTES = 30;

function boundedInteger(value, { fallback, min, max, label }) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw badRequest(`${label} inválido`);
  return parsed;
}

function listedTargetAuthorization(row) {
  if (!row.account_id) return null;
  const code = row.level_code || fallbackLevel({
    legacyAdmin: Number(row.legacy_admin || 0) > 0,
    legacyInspector: row.access_profile === "Inspetor",
  });
  const level = levelDefinition(code);
  return { code: level.code, label: level.label, rank: level.rank, permissions: [] };
}

accessRouter.get(
  "/activation-codes",
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Retorna os colaboradores ativos com o estado de primeiro acesso e, quando
    // a conta já existe, o estado do código de recuperação de senha. Nenhum
    // endpoint administrativo devolve hashes ou códigos antigos.
    const rows = await query(
      `SELECT e.id AS employee_id, e.full_name, e.matricula, e.sector, e.access_profile,
              r.expires_at, r.used_at, r.created_at,
              (r.used_at IS NULL AND r.expires_at IS NOT NULL AND r.expires_at < UTC_TIMESTAMP(3)) AS expired,
              u.id AS account_id, u.status AS account_status,
              ual.level_code,
              (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS legacy_admin,
              pr.expires_at AS reset_expires_at, pr.used_at AS reset_used_at,
              pr.created_at AS reset_created_at, pr.locked_at AS reset_locked_at,
              pr.failed_attempts AS reset_failed_attempts,
              (pr.used_at IS NULL AND pr.expires_at IS NOT NULL AND pr.expires_at < UTC_TIMESTAMP(3)) AS reset_expired
         FROM employees e
         LEFT JOIN registration_activation_codes r ON r.employee_id = e.id
         LEFT JOIN app_users u ON LOWER(TRIM(u.matricula)) = LOWER(TRIM(e.matricula))
         LEFT JOIN user_access_levels ual ON ual.user_id = u.id
         LEFT JOIN password_reset_codes pr ON pr.user_id = u.id
        WHERE e.status = 'Ativo'
        ORDER BY e.full_name ASC`,
    );
    res.json(
      rows.map((row) => {
        const targetAuthorization = listedTargetAuthorization(row);
        const authority = !row.account_id
          ? { allowed: false, reason: null }
          : row.account_status !== "Ativo"
            ? { allowed: false, reason: "A conta de acesso está inativa." }
            : passwordResetAuthority(req.user, targetAuthorization);

        return {
          employee_id: row.employee_id,
          employee_name: row.full_name,
          matricula: row.matricula,
          sector: row.sector,
          expires_at: row.expires_at ?? null,
          used_at: row.used_at ?? null,
          created_at: row.created_at ?? null,
          has_account: Boolean(row.account_id),
          account_active: row.account_status === "Ativo",
          access_level: targetAuthorization?.code ?? null,
          access_level_label: targetAuthorization?.label ?? null,
          password_reset_allowed: Boolean(authority.allowed),
          password_reset_block_reason: authority.reason ?? null,
          expired: Number(row.expired) > 0,
          reset_expires_at: row.reset_expires_at ?? null,
          reset_used_at: row.reset_used_at ?? null,
          reset_created_at: row.reset_created_at ?? null,
          reset_locked_at: row.reset_locked_at ?? null,
          reset_failed_attempts: Number(row.reset_failed_attempts ?? 0),
          reset_expired: Number(row.reset_expired) > 0,
        };
      }),
    );
  }),
);

accessRouter.post(
  "/activation-codes/:employeeId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || "").trim();
    if (!employeeId) throw badRequest("Colaborador não informado");

    const code = numericCode(8);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 3600_000);

    const issued = await withTransaction(async (connection) => {
      // O colaborador é bloqueado e revalidado dentro da mesma transação da emissão.
      // Assim matrícula/status não podem mudar entre a validação e a gravação do convite.
      const [employees] = await connection.execute(
        `SELECT id, full_name, matricula, sector, status
           FROM employees
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [employeeId],
      );
      const employee = employees[0];
      if (!employee || employee.status !== "Ativo") throw notFound("Colaborador ativo não encontrado");

      const [accounts] = await connection.execute(
        `SELECT id
           FROM app_users
          WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?))
          LIMIT 1
          FOR UPDATE`,
        [employee.matricula],
      );
      if (accounts.length) throw conflict("Esta matrícula já possui acesso cadastrado");

      await connection.execute(
        `INSERT INTO registration_activation_codes (employee_id, code_hash, expires_at, used_at, created_by, created_at)
         VALUES (?, ?, ?, NULL, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at),
                                 used_at = NULL, created_by = VALUES(created_by), created_at = UTC_TIMESTAMP(3)`,
        [employee.id, codeHash, expiresAt, req.user.id],
      );
      await audit(req.user.id, "ISSUE_ACTIVATION_CODE", "registration_activation_codes", employee.id, {
        matricula: employee.matricula,
        employee_status_revalidated: true,
        employee_locked: true,
        atomic: true,
      }, connection);

      return {
        employee_id: employee.id,
        employee_name: employee.full_name,
        matricula: employee.matricula,
      };
    });

    // Código puro devolvido uma única vez; o banco guarda apenas o hash.
    res.status(201).json({
      code,
      ...issued,
      expires_at: expiresAt.toISOString(),
    });
  }),
);

accessRouter.delete(
  "/activation-codes/:employeeId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || "").trim();
    if (!employeeId) throw badRequest("Colaborador não informado");

    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT employee_id FROM registration_activation_codes WHERE employee_id = ? FOR UPDATE`,
        [employeeId],
      );
      if (!rows.length) throw notFound("Código de ativação não encontrado");
      await connection.execute(`DELETE FROM registration_activation_codes WHERE employee_id = ?`, [employeeId]);
      await audit(req.user.id, "REVOKE_ACTIVATION_CODE", "registration_activation_codes", employeeId, { atomic: true }, connection);
    });
    res.status(204).end();
  }),
);

accessRouter.post(
  "/password-resets/:employeeId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || "").trim();
    if (!employeeId) throw badRequest("Colaborador não informado");

    const code = numericCode(8);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000);

    const issued = await withTransaction(async (connection) => {
      const [employees] = await connection.execute(
        `SELECT id, full_name, matricula, sector, status, access_profile
           FROM employees
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [employeeId],
      );
      const employee = employees[0];
      if (!employee || employee.status !== "Ativo") throw notFound("Colaborador ativo não encontrado");

      const [accounts] = await connection.execute(
        `SELECT id, status
           FROM app_users
          WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?))
          LIMIT 1
          FOR UPDATE`,
        [employee.matricula],
      );
      const account = accounts[0];
      if (!account) throw conflict("Esta matrícula ainda não possui acesso cadastrado");
      if (account.status !== "Ativo") throw conflict("A conta de acesso está inativa");

      const targetAuthorization = await lockEffectiveAuthorization(connection, account.id, {
        legacyInspector: employee.access_profile === "Inspetor",
      });
      const actorAuthorization = await lockActiveUserAuthorization(connection, req.user.id);
      if (!actorAuthorization) throw forbidden("Conta administrativa emissora não está mais ativa");

      const authority = passwordResetAuthority(actorAuthorization, targetAuthorization);
      if (!authority.allowed) throw forbidden(authority.reason);

      await connection.execute(
        `INSERT INTO password_reset_codes
           (user_id, code_hash, expires_at, used_at, failed_attempts, locked_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 0, NULL, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at),
                                 used_at = NULL, failed_attempts = 0, locked_at = NULL,
                                 created_by = VALUES(created_by), created_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)`,
        [account.id, codeHash, expiresAt, req.user.id],
      );
      await audit(req.user.id, "ISSUE_PASSWORD_RESET_CODE", "password_reset_codes", account.id, {
        matricula: employee.matricula,
        employee_id: employee.id,
        ttl_minutes: RESET_CODE_TTL_MINUTES,
        actor_access_level: authority.actor.code,
        target_access_level: authority.target.code,
        strict_hierarchy: true,
        master_recovery_ti_only: true,
        atomic: true,
      }, connection);

      return {
        employee_id: employee.id,
        employee_name: employee.full_name,
        matricula: employee.matricula,
      };
    });

    // Assim como no primeiro acesso, o código puro só existe nesta resposta.
    res.status(201).json({
      code,
      ...issued,
      expires_at: expiresAt.toISOString(),
    });
  }),
);

accessRouter.delete(
  "/password-resets/:employeeId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeId = String(req.params.employeeId || "").trim();
    if (!employeeId) throw badRequest("Colaborador não informado");

    await withTransaction(async (connection) => {
      const [employees] = await connection.execute(
        `SELECT matricula, access_profile FROM employees WHERE id = ? LIMIT 1 FOR UPDATE`,
        [employeeId],
      );
      const employee = employees[0];
      if (!employee) throw notFound("Colaborador não encontrado");

      const [accounts] = await connection.execute(
        `SELECT id FROM app_users WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?)) LIMIT 1 FOR UPDATE`,
        [employee.matricula],
      );
      const account = accounts[0];
      if (!account) throw notFound("Conta de acesso não encontrada");

      const targetAuthorization = await lockEffectiveAuthorization(connection, account.id, {
        legacyInspector: employee.access_profile === "Inspetor",
      });
      const actorAuthorization = await lockActiveUserAuthorization(connection, req.user.id);
      if (!actorAuthorization) throw forbidden("Conta administrativa emissora não está mais ativa");

      const authority = passwordResetAuthority(actorAuthorization, targetAuthorization);
      if (!authority.allowed) throw forbidden(authority.reason);

      const [rows] = await connection.execute(
        `SELECT user_id FROM password_reset_codes WHERE user_id = ? FOR UPDATE`,
        [account.id],
      );
      if (!rows.length) throw notFound("Código de recuperação não encontrado");

      await connection.execute(`DELETE FROM password_reset_codes WHERE user_id = ?`, [account.id]);
      await audit(req.user.id, "REVOKE_PASSWORD_RESET_CODE", "password_reset_codes", account.id, {
        employee_id: employeeId,
        actor_access_level: authority.actor.code,
        target_access_level: authority.target.code,
        strict_hierarchy: true,
        master_recovery_ti_only: true,
        atomic: true,
      }, connection);
    });
    res.status(204).end();
  }),
);

accessRouter.get(
  "/audit",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = boundedInteger(req.query["limit"], { fallback: 100, min: 1, max: 500, label: "Limite" });
    const offset = boundedInteger(req.query["offset"], { fallback: 0, min: 0, max: 1_000_000, label: "Offset" });
    const rows = await query(
      `SELECT a.id, a.actor_id, p.nome AS actor_name, a.action, a.entity, a.entity_id, a.created_at
         FROM audit_logs a
         LEFT JOIN profiles p ON p.id = a.actor_id
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    res.json({ items: rows, nextOffset: rows.length === limit ? offset + limit : null });
  }),
);
