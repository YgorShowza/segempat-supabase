import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAuth } from "../session.js";
import {
  ACCESS_LEVELS,
  ACCESS_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  defaultPermissionsFor,
  effectivePermissions,
  isMasterOnlyPermission,
  isValidPermission,
  levelDefinition,
  requirePermission,
} from "../authorization.js";
import { badRequest, conflict, forbidden, notFound, uuid } from "../util.js";

export const authorizationRouter = Router();

const MANAGE_PERMISSION = "access.permissions.manage";
const LEVEL_CODES = new Set(ACCESS_LEVELS.map((level) => level.code));

function normalizePermissionList(value) {
  if (!Array.isArray(value)) throw badRequest("Permissões devem ser enviadas como lista");
  const unique = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  for (const permission of unique) {
    if (!isValidPermission(permission)) throw badRequest(`Permissão desconhecida: ${permission}`);
  }
  return unique;
}

function normalizeLevel(value) {
  const level = String(value || "").trim().toLowerCase();
  if (!LEVEL_CODES.has(level)) throw badRequest("Nível de acesso inválido");
  return level;
}

function buildAuthorizationSnapshot(row, overrideRows = []) {
  const levelCode = row.level_code || (row.access_profile === "Inspetor" ? "inspector" : "operator");
  const level = levelDefinition(levelCode);
  return {
    user_id: row.user_id,
    employee_id: row.employee_id ?? null,
    name: row.full_name || row.profile_name || row.matricula,
    matricula: row.matricula,
    sector: row.sector ?? null,
    account_status: row.account_status,
    employee_status: row.employee_status ?? null,
    access_profile: row.access_profile ?? null,
    level: level.code,
    level_label: level.label,
    permissions: effectivePermissions(level.code, overrideRows),
  };
}

authorizationRouter.use(requireAuth, requirePermission(MANAGE_PERMISSION));

authorizationRouter.get("/catalog", (_req, res) => {
  res.json({
    levels: ACCESS_LEVELS,
    permissions: ACCESS_PERMISSIONS,
    default_permissions: DEFAULT_PERMISSIONS,
  });
});

authorizationRouter.get("/users", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT u.id AS user_id, u.matricula, u.status AS account_status,
              p.nome AS profile_name,
              e.id AS employee_id, e.full_name, e.sector, e.access_profile, e.status AS employee_status,
              ual.level_code
         FROM app_users u
         LEFT JOIN profiles p ON p.id = u.id
         LEFT JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
         LEFT JOIN user_access_levels ual ON ual.user_id = u.id
        ORDER BY COALESCE(e.full_name, p.nome, u.matricula) ASC`,
    );
    const overrideRows = await query(
      `SELECT user_id, permission_code, allowed FROM user_permission_overrides ORDER BY user_id, permission_code`,
    );
    const overridesByUser = new Map();
    for (const row of overrideRows) {
      const list = overridesByUser.get(row.user_id) ?? [];
      list.push(row);
      overridesByUser.set(row.user_id, list);
    }
    res.json(rows.map((row) => ({
      ...buildAuthorizationSnapshot(row, overridesByUser.get(row.user_id) ?? []),
      is_self: row.user_id === req.user.id,
    })));
  } catch (error) {
    next(error);
  }
});

authorizationRouter.patch("/users/:userId", async (req, res, next) => {
  try {
    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) throw badRequest("Usuário não informado");
    if (targetUserId === req.user.id) {
      throw forbidden("O Administrador Master não pode alterar o próprio nível por esta tela. Isso evita bloqueio acidental do último acesso privilegiado.");
    }

    const requestedLevel = normalizeLevel(req.body?.level);
    let selectedPermissions = normalizePermissionList(req.body?.permissions ?? []);

    if (requestedLevel === "operator" && selectedPermissions.length > 0) {
      throw badRequest("O nível Operador não recebe permissões administrativas");
    }
    if (requestedLevel !== "master" && selectedPermissions.some((code) => isMasterOnlyPermission(code))) {
      throw forbidden("Permissões exclusivas do Administrador Master não podem ser delegadas");
    }
    if (requestedLevel === "master") {
      selectedPermissions = ACCESS_PERMISSIONS.map((permission) => permission.code);
    }

    const result = await withTransaction(async (connection) => {
      // Primeiro bloqueia somente a conta-alvo. Evitamos SELECT com LEFT JOIN ... FOR UPDATE,
      // que pode ter comportamento diferente entre versões/configurações do MySQL 8.
      const [accountRows] = await connection.execute(
        `SELECT id AS user_id, matricula, status AS account_status
           FROM app_users
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [targetUserId],
      );
      const account = accountRows[0];
      if (!account) throw notFound("Conta de acesso não encontrada");
      if (account.account_status !== "Ativo") throw conflict("A conta selecionada está inativa");

      const [metadataRows] = await connection.execute(
        `SELECT p.nome AS profile_name,
                e.id AS employee_id, e.full_name, e.sector, e.access_profile, e.status AS employee_status
           FROM app_users u
           LEFT JOIN profiles p ON p.id = u.id
           LEFT JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
          WHERE u.id = ?
          LIMIT 1`,
        [targetUserId],
      );
      const metadata = metadataRows[0] ?? {};
      if (metadata.employee_status && metadata.employee_status !== "Ativo") {
        throw conflict("O cadastro funcional selecionado está inativo");
      }

      const [levelRows] = await connection.execute(
        `SELECT level_code FROM user_access_levels WHERE user_id = ? LIMIT 1 FOR UPDATE`,
        [targetUserId],
      );
      const currentLevel = levelRows[0]?.level_code || (metadata.access_profile === "Inspetor" ? "inspector" : "operator");

      if (currentLevel === "master" && requestedLevel !== "master") {
        // Conta e cadastro funcional precisam estar ativos para um Master ser realmente
        // utilizável. O lock conjunto impede que rebaixamento e inativação concorrentes
        // deixem o SEGEMPAT sem uma conta Master capaz de autenticar.
        const [activeMasterRows] = await connection.execute(
          `SELECT ual.user_id
             FROM user_access_levels ual
             JOIN app_users u ON u.id = ual.user_id
             JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
            WHERE ual.level_code = 'master'
              AND u.status = 'Ativo'
              AND e.status = 'Ativo'
            ORDER BY ual.user_id
            FOR UPDATE`,
        );
        if (activeMasterRows.length <= 1) {
          throw conflict("Não é permitido remover o último Administrador Master do SEGEMPAT");
        }
      }

      const [oldOverrideRows] = await connection.execute(
        `SELECT permission_code, allowed FROM user_permission_overrides WHERE user_id = ? FOR UPDATE`,
        [targetUserId],
      );
      const oldSnapshot = {
        level: currentLevel,
        permissions: effectivePermissions(currentLevel, oldOverrideRows),
      };

      await connection.execute(
        `INSERT INTO user_access_levels (user_id, level_code, updated_by, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE level_code = VALUES(level_code), updated_by = VALUES(updated_by), updated_at = UTC_TIMESTAMP(3)`,
        [targetUserId, requestedLevel, req.user.id],
      );

      await connection.execute(`DELETE FROM user_permission_overrides WHERE user_id = ?`, [targetUserId]);
      if (requestedLevel !== "master" && requestedLevel !== "operator") {
        const defaults = defaultPermissionsFor(requestedLevel);
        const selected = new Set(selectedPermissions);
        for (const permission of ACCESS_PERMISSIONS) {
          if (isMasterOnlyPermission(permission.code)) continue;
          const shouldAllow = selected.has(permission.code);
          const defaultAllows = defaults.has(permission.code);
          if (shouldAllow === defaultAllows) continue;
          await connection.execute(
            `INSERT INTO user_permission_overrides (user_id, permission_code, allowed, updated_by, updated_at)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))`,
            [targetUserId, permission.code, shouldAllow ? 1 : 0, req.user.id],
          );
        }
      }

      if (requestedLevel === "operator") {
        await connection.execute(`DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'`, [targetUserId]);
      } else {
        await connection.execute(
          `INSERT IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')`,
          [uuid(), targetUserId],
        );
      }

      await connection.execute(
        `UPDATE app_users
            SET session_epoch = session_epoch + 1, updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?`,
        [targetUserId],
      );

      const newSnapshot = {
        level: requestedLevel,
        permissions: requestedLevel === "master"
          ? ACCESS_PERMISSIONS.map((permission) => permission.code)
          : requestedLevel === "operator"
            ? []
            : selectedPermissions,
      };

      await audit(req.user.id, "UPDATE_ACCESS_CONTROL", "app_users", targetUserId, {
        target_matricula: account.matricula,
        old: oldSnapshot,
        new: newSnapshot,
        sessions_revoked: true,
        self_change_blocked: true,
        last_master_guard: true,
        master_only_not_delegable: true,
        atomic: true,
      }, connection);

      const target = {
        ...account,
        ...metadata,
        level_code: requestedLevel,
      };
      return {
        ...buildAuthorizationSnapshot(target,
          requestedLevel === "master" || requestedLevel === "operator"
            ? []
            : ACCESS_PERMISSIONS
                .filter((permission) => !isMasterOnlyPermission(permission.code))
                .map((permission) => ({
                  permission_code: permission.code,
                  allowed: selectedPermissions.includes(permission.code) ? 1 : 0,
                }))),
        is_self: false,
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});
