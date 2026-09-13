import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { queryOne, query } from "./db.js";
import { loadAuthorization } from "./authorization.js";
import { forbidden, unauthorized } from "./util.js";

const MAX_SESSION_TOKEN_LENGTH = 2048;

function sign(payload) {
  return createHmac("sha256", config.session.secret).update(payload).digest("base64url");
}

function credentialVersion(passwordHash, sessionEpoch = 0) {
  // Não envia o bcrypt nem o contador de sessão ao navegador. A versão é derivada
  // por HMAC e muda quando a credencial muda OU quando a TI/API incrementa
  // session_epoch por alteração de privilégio/status. Updates comuns, como
  // last_login_at, não invalidam a sessão.
  return createHmac("sha256", config.session.secret)
    .update(`credential-version:${passwordHash}:epoch:${Number(sessionEpoch) || 0}`)
    .digest()
    .readUIntBE(0, 6);
}

/** Sessão stateless assinada: payload base64url + HMAC-SHA256. */
export function createSessionToken(user) {
  const expiresAt = Date.now() + config.session.ttlHours * 3600_000;
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    exp: expiresAt,
    ver: user.sessionVersion,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token) {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_SESSION_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.sub || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    if (!Number.isSafeInteger(data.ver) || data.ver < 0) return null;
    return data;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, user) {
  res.cookie(config.session.cookieName, createSessionToken(user), {
    httpOnly: true,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    maxAge: config.session.ttlHours * 3600_000,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, {
    httpOnly: true,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    path: "/",
  });
}

/**
 * Reconstrói o contexto de autorização a cada requisição. Conta e colaborador
 * precisam permanecer ativos mesmo quando o cookie de sessão ainda é válido.
 * Nível e permissões também são recarregados do MySQL; alterações administrativas
 * incrementam session_epoch e derrubam imediatamente as sessões anteriores.
 */
export async function loadAuthContext(userId) {
  const row = await queryOne(
    `SELECT u.id, u.matricula, u.password_hash, u.session_epoch, u.status AS account_status, p.nome,
            e.id AS employee_id, e.full_name, e.sector, e.access_profile,
            e.status AS employee_status
       FROM app_users u
       LEFT JOIN profiles p ON p.id = u.id
       LEFT JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
      WHERE u.id = ?
      LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  if (row.account_status !== "Ativo" || row.employee_status !== "Ativo") return null;

  const roles = await query(`SELECT role FROM user_roles WHERE user_id = ?`, [userId]);
  const legacyAdmin = roles.some((entry) => entry.role === "admin");
  const authorization = await loadAuthorization(userId, {
    legacyAdmin,
    legacyInspector: row.access_profile === "Inspetor",
  });
  const sessionVersion = credentialVersion(row.password_hash, row.session_epoch);

  return {
    id: row.id,
    matricula: row.matricula,
    nome: row.full_name || row.nome || row.matricula,
    setor: row.sector ?? null,
    employeeId: row.employee_id ?? null,
    accessProfile: row.access_profile ?? null,
    isAdmin: authorization.isPrivileged,
    isMaster: authorization.isMaster,
    accessLevel: authorization.accessLevel,
    accessLevelLabel: authorization.accessLevelLabel,
    accessRank: authorization.accessRank,
    permissions: authorization.permissions,
    sessionVersion,
  };
}

export async function attachUser(req, _res, next) {
  try {
    const session = readSessionToken(req.cookies?.[config.session.cookieName]);
    if (!session) {
      req.user = null;
      return next();
    }

    const user = await loadAuthContext(session.sub);
    req.user = user && user.sessionVersion === session.ver ? user : null;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.isAdmin) return next(forbidden("Acesso restrito a contas administrativas autorizadas"));
  next();
}

export function toSessionUser(user) {
  return {
    id: user.id,
    matricula: user.matricula,
    nome: user.nome,
    setor: user.setor,
    isAdmin: user.isAdmin,
    isMaster: Boolean(user.isMaster),
    accessLevel: user.accessLevel ?? (user.isAdmin ? "inspector" : "operator"),
    accessLevelLabel: user.accessLevelLabel ?? (user.isAdmin ? "Inspetor" : "Operador"),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}
