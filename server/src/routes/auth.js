import { Router } from "express";
import bcrypt from "bcryptjs";
import { queryOne, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import {
  lockActiveUserAuthorization,
  lockEffectiveAuthorization,
  passwordResetAuthority,
} from "../password-reset-policy.js";
import { clearSessionCookie, loadAuthContext, requireAuth, setSessionCookie, toSessionUser } from "../session.js";
import { HttpError, asyncHandler, badRequest, forbidden, requireText, unauthorized, uuid } from "../util.js";

export const authRouter = Router();

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MAX_MATRICULA = 80;
const AUTH_WINDOW_MS = 15 * 60_000;
const AUTH_BUCKET_LIMIT = 5_000;
const MAX_RESET_CODE_ATTEMPTS = 5;
const authAttempts = new Map();
let lastAuthSweepAt = 0;

function normalizeMatricula(value) {
  const matricula = requireText(value, "Matrícula").trim().toLowerCase();
  if (matricula.length > MAX_MATRICULA) throw badRequest("Matrícula inválida");
  return matricula;
}

function passwordText(value, label = "Senha") {
  const text = String(value ?? "");
  if (text.length > MAX_PASSWORD) throw badRequest(`${label} excede o limite permitido`);
  return text;
}

function assertStrongPassword(password) {
  const text = passwordText(password, "Senha");
  if (text.length < MIN_PASSWORD) throw badRequest(`A senha deve ter ao menos ${MIN_PASSWORD} caracteres`);
  return text;
}

function sweepAuthAttempts(now) {
  if (now - lastAuthSweepAt < 60_000 && authAttempts.size < AUTH_BUCKET_LIMIT) return;
  lastAuthSweepAt = now;
  for (const [key, bucket] of authAttempts) {
    if (bucket.resetAt <= now) authAttempts.delete(key);
  }
  while (authAttempts.size > AUTH_BUCKET_LIMIT) {
    const firstKey = authAttempts.keys().next().value;
    if (!firstKey) break;
    authAttempts.delete(firstKey);
  }
}

function authAttemptKey(req, action, matricula) {
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 120);
  return `${action}:${ip}:${matricula}`;
}

function consumeAuthAttempt(req, action, matricula, maxAttempts) {
  const now = Date.now();
  sweepAuthAttempts(now);
  const key = authAttemptKey(req, action, matricula);
  const current = authAttempts.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + AUTH_WINDOW_MS }
    : current;

  bucket.count += 1;
  authAttempts.set(key, bucket);
  if (bucket.count > maxAttempts) {
    throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.", "RATE_LIMITED");
  }
  return key;
}

function clearAuthAttempts(key) {
  if (key) authAttempts.delete(key);
}

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const matricula = normalizeMatricula(req.body?.matricula);
    const password = passwordText(req.body?.password);
    const rateKey = consumeAuthAttempt(req, "login", matricula, 12);

    const account = await queryOne(
      `SELECT id, password_hash FROM app_users
        WHERE LOWER(TRIM(matricula)) = ? AND status = 'Ativo' LIMIT 1`,
      [matricula],
    );

    const genericFailure = unauthorized("Matrícula ou senha inválida");
    if (!account) {
      await bcrypt.hash(password || "segempat-invalid-login", 12);
      throw genericFailure;
    }
    if (!(await bcrypt.compare(password, account.password_hash))) throw genericFailure;

    const context = await loadAuthContext(account.id);
    if (!context) throw forbidden("Cadastro funcional inativo. Procure a Inspetoria.");

    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id FROM app_users WHERE id = ? AND status = 'Ativo' LIMIT 1 FOR UPDATE`,
        [context.id],
      );
      if (!rows[0]) throw forbidden("Conta de acesso inativa");

      await connection.execute(`UPDATE app_users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?`, [context.id]);
      await audit(context.id, "LOGIN", "app_users", context.id, { atomic: true }, connection);
    });

    clearAuthAttempts(rateKey);
    setSessionCookie(res, context);
    res.json(toSessionUser(context));
  }),
);

authRouter.post(
  "/activate",
  asyncHandler(async (req, res) => {
    const matricula = normalizeMatricula(req.body?.matricula);
    const activationCode = requireText(req.body?.activationCode, "Código de ativação");
    const password = assertStrongPassword(req.body?.password);
    const rateKey = consumeAuthAttempt(req, "activate", matricula, 8);

    if (!/^[0-9]{8}$/.test(activationCode)) throw badRequest("Código de ativação inválido");

    const userId = await withTransaction(async (connection) => {
      const [employees] = await connection.execute(
        `SELECT id, full_name, matricula, access_profile FROM employees
          WHERE LOWER(TRIM(matricula)) = ? AND status = 'Ativo' LIMIT 1 FOR UPDATE`,
        [matricula],
      );
      const employee = employees[0];
      if (!employee) throw forbidden("Matrícula não autorizada para cadastro");

      const [existing] = await connection.execute(
        `SELECT id FROM app_users WHERE LOWER(TRIM(matricula)) = ? LIMIT 1 FOR UPDATE`,
        [matricula],
      );
      if (existing[0]) throw badRequest("Esta matrícula já possui acesso cadastrado");

      const [tokens] = await connection.execute(
        `SELECT employee_id, code_hash FROM registration_activation_codes
          WHERE employee_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)
          FOR UPDATE`,
        [employee.id],
      );
      const token = tokens[0];
      if (!token || !(await bcrypt.compare(activationCode, token.code_hash))) {
        throw badRequest("Código de ativação inválido ou expirado");
      }

      const id = uuid();
      const passwordHash = await bcrypt.hash(password, 12);
      const initialAccessLevel = employee.access_profile === "Inspetor" ? "inspector" : "operator";

      await connection.execute(
        `INSERT INTO app_users (id, matricula, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Ativo', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [id, employee.matricula, passwordHash],
      );
      await connection.execute(
        `INSERT INTO profiles (id, matricula, nome, created_at, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [id, employee.matricula, employee.full_name],
      );
      await connection.execute(
        `INSERT INTO user_access_levels (user_id, level_code, updated_by, updated_at)
         VALUES (?, ?, NULL, UTC_TIMESTAMP(3))`,
        [id, initialAccessLevel],
      );
      if (employee.access_profile === "Inspetor") {
        // Mantém a role legada somente para compatibilidade de scripts antigos.
        // O poder efetivo passa a vir de user_access_levels + permissões.
        await connection.execute(
          `INSERT IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')`,
          [uuid(), id],
        );
      }
      await connection.execute(
        `UPDATE registration_activation_codes SET used_at = UTC_TIMESTAMP(3) WHERE employee_id = ?`,
        [employee.id],
      );
      await audit(id, "ACTIVATE", "app_users", id, {
        matricula: employee.matricula,
        initial_access_level: initialAccessLevel,
        least_privilege: true,
        atomic: true,
      }, connection);
      return id;
    });

    const context = await loadAuthContext(userId);
    if (!context) throw forbidden("Cadastro funcional inativo");
    clearAuthAttempts(rateKey);
    setSessionCookie(res, context);
    res.status(201).json(toSessionUser(context));
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const matricula = normalizeMatricula(req.body?.matricula);
    const resetCode = requireText(req.body?.resetCode, "Código de recuperação").trim();
    const next = assertStrongPassword(req.body?.newPassword);
    const rateKey = consumeAuthAttempt(req, "reset-password", matricula, 8);

    if (!/^[0-9]{8}$/.test(resetCode)) {
      throw badRequest("Código de recuperação inválido, expirado ou bloqueado");
    }

    const nextHash = await bcrypt.hash(next, 12);
    const result = await withTransaction(async (connection) => {
      const [accounts] = await connection.execute(
        `SELECT id, matricula, password_hash, status AS account_status
           FROM app_users
          WHERE LOWER(TRIM(matricula)) = ?
          LIMIT 1
          FOR UPDATE`,
        [matricula],
      );
      const account = accounts[0];
      if (!account || account.account_status !== "Ativo") return { ok: false };

      const [employees] = await connection.execute(
        `SELECT status AS employee_status, access_profile
           FROM employees
          WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?))
          LIMIT 1
          FOR UPDATE`,
        [account.matricula],
      );
      const employee = employees[0];
      if (!employee || employee.employee_status !== "Ativo") return { ok: false };

      const targetAuthorization = await lockEffectiveAuthorization(connection, account.id, {
        legacyInspector: employee.access_profile === "Inspetor",
      });

      const [tokens] = await connection.execute(
        `SELECT code_hash, failed_attempts, created_by
           FROM password_reset_codes
          WHERE user_id = ?
            AND used_at IS NULL
            AND locked_at IS NULL
            AND expires_at > UTC_TIMESTAMP(3)
          FOR UPDATE`,
        [account.id],
      );
      const token = tokens[0];
      if (!token) return { ok: false };

      const issuerAuthorization = token.created_by
        ? await lockActiveUserAuthorization(connection, token.created_by)
        : null;
      const authority = issuerAuthorization
        ? passwordResetAuthority(issuerAuthorization, targetAuthorization)
        : { allowed: false };

      if (!authority.allowed) {
        // Um código antigo não volta a valer caso o emissor recupere permissões depois.
        // Promoção do alvo, demissão/inativação do emissor ou perda da permissão
        // tornam o código definitivamente inutilizável.
        await connection.execute(
          `UPDATE password_reset_codes
              SET locked_at = COALESCE(locked_at, UTC_TIMESTAMP(3)), updated_at = UTC_TIMESTAMP(3)
            WHERE user_id = ?`,
          [account.id],
        );
        return { ok: false };
      }

      const matches = await bcrypt.compare(resetCode, token.code_hash);
      if (!matches) {
        const failedAttempts = Math.min(MAX_RESET_CODE_ATTEMPTS, Number(token.failed_attempts || 0) + 1);
        await connection.execute(
          `UPDATE password_reset_codes
              SET failed_attempts = ?,
                  locked_at = CASE WHEN ? >= ? THEN UTC_TIMESTAMP(3) ELSE locked_at END,
                  updated_at = UTC_TIMESTAMP(3)
            WHERE user_id = ?`,
          [failedAttempts, failedAttempts, MAX_RESET_CODE_ATTEMPTS, account.id],
        );
        return { ok: false };
      }

      if (await bcrypt.compare(next, account.password_hash)) {
        return { ok: false, samePassword: true };
      }

      await connection.execute(
        `UPDATE app_users
            SET password_hash = ?,
                session_epoch = session_epoch + 1,
                updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?`,
        [nextHash, account.id],
      );
      await connection.execute(
        `UPDATE password_reset_codes
            SET used_at = UTC_TIMESTAMP(3), failed_attempts = 0, updated_at = UTC_TIMESTAMP(3)
          WHERE user_id = ?`,
        [account.id],
      );
      await audit(account.id, "PASSWORD_RESET", "app_users", account.id, {
        atomic: true,
        recovery_code_used: true,
        sessions_rotated: true,
        authorized_by: token.created_by,
        issuer_access_level: authority.actor.code,
        target_access_level: authority.target.code,
        strict_hierarchy_revalidated: true,
        master_recovery_ti_only: true,
      }, connection);
      return { ok: true };
    });

    if (!result.ok) {
      if (result.samePassword) throw badRequest("A nova senha deve ser diferente da senha atual");
      throw badRequest("Código de recuperação inválido, expirado ou bloqueado");
    }

    clearAuthAttempts(rateKey);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json(toSessionUser(req.user));
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = passwordText(req.body?.currentPassword, "Senha atual");
    const next = assertStrongPassword(req.body?.newPassword);
    const nextHash = await bcrypt.hash(next, 12);

    await withTransaction(async (connection) => {
      const [accounts] = await connection.execute(
        `SELECT password_hash FROM app_users WHERE id = ? AND status = 'Ativo' LIMIT 1 FOR UPDATE`,
        [req.user.id],
      );
      const account = accounts[0];
      if (!account || !(await bcrypt.compare(current, account.password_hash))) {
        throw badRequest("Senha atual incorreta");
      }
      if (await bcrypt.compare(next, account.password_hash)) {
        throw badRequest("A nova senha deve ser diferente da senha atual");
      }

      await connection.execute(
        `UPDATE app_users SET password_hash = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
        [nextHash, req.user.id],
      );
      await connection.execute(`DELETE FROM password_reset_codes WHERE user_id = ?`, [req.user.id]);
      await audit(req.user.id, "PASSWORD_CHANGE", "app_users", req.user.id, { atomic: true, sessions_rotated: true }, connection);
    });

    const refreshed = await loadAuthContext(req.user.id);
    if (!refreshed) throw unauthorized();
    setSessionCookie(res, refreshed);
    res.status(204).end();
  }),
);

authRouter.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});
