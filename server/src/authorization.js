import { query, queryOne } from "./db.js";
import { forbidden } from "./util.js";

export const ACCESS_LEVELS = [
  { code: "master", label: "Administrador Master", rank: 100 },
  { code: "admin", label: "Administrador", rank: 80 },
  { code: "inspector", label: "Inspetor", rank: 60 },
  { code: "operator", label: "Operador", rank: 10 },
];

export const ACCESS_PERMISSIONS = [
  { code: "dashboard.view", label: "Visualizar dashboard administrativo", group: "Comando Operacional", sortOrder: 10 },
  { code: "attention.view", label: "Visualizar Central de Atenção", group: "Comando Operacional", sortOrder: 20 },
  { code: "team.view", label: "Visualizar equipe completa", group: "Equipe & Desempenho", sortOrder: 30 },
  { code: "team.manage", label: "Cadastrar e editar colaboradores", group: "Equipe & Desempenho", sortOrder: 40 },
  { code: "risk.view", label: "Visualizar Zona de Risco", group: "Equipe & Desempenho", sortOrder: 50 },
  { code: "schedule.manage", label: "Gerenciar cronograma", group: "Operação", sortOrder: 60 },
  { code: "occurrences.manage", label: "Gerenciar ocorrências", group: "Operação", sortOrder: 70 },
  { code: "practical.manage", label: "Gerenciar avaliações práticas", group: "Operação", sortOrder: 80 },
  { code: "exams.manage", label: "Criar e gerenciar provas", group: "Capacitação", sortOrder: 90 },
  { code: "question_bank.manage", label: "Gerenciar banco de questões", group: "Capacitação", sortOrder: 100 },
  { code: "training.manage", label: "Gerenciar treinamentos, módulos e ciclos", group: "Capacitação", sortOrder: 110 },
  { code: "knowledge.manage", label: "Gerenciar conteúdos e base de conhecimento", group: "Capacitação", sortOrder: 120 },
  { code: "certificates.manage", label: "Gerenciar certificados e assinaturas", group: "Capacitação", sortOrder: 130 },
  { code: "analytics.view", label: "Visualizar Analytics e análise individual", group: "Relatórios & Inteligência", sortOrder: 140 },
  { code: "reports.view", label: "Visualizar relatórios gerenciais", group: "Relatórios & Inteligência", sortOrder: 150 },
  { code: "ai.view", label: "Acessar IA Base", group: "Relatórios & Inteligência", sortOrder: 160 },
  { code: "access.identity.manage", label: "Gerenciar primeiro acesso", group: "Governança", sortOrder: 170 },
  { code: "access.password_reset", label: "Autorizar recuperação de senha", group: "Governança", sortOrder: 180 },
  { code: "audit.view", label: "Visualizar trilha de auditoria", group: "Governança", sortOrder: 190 },
  { code: "security.document.view", label: "Visualizar documento de segurança", group: "Governança", sortOrder: 200 },
  { code: "access.permissions.manage", label: "Gerenciar níveis e permissões", group: "Segurança", sortOrder: 210, masterOnly: true },
];

const ALL_PERMISSION_CODES = ACCESS_PERMISSIONS.map((permission) => permission.code);
const MASTER_ONLY = new Set(ACCESS_PERMISSIONS.filter((permission) => permission.masterOnly).map((permission) => permission.code));

export const DEFAULT_PERMISSIONS = {
  master: [...ALL_PERMISSION_CODES],
  admin: ALL_PERMISSION_CODES.filter((code) => !MASTER_ONLY.has(code) && code !== "audit.view"),
  inspector: ALL_PERMISSION_CODES.filter((code) => !MASTER_ONLY.has(code) && !["audit.view", "security.document.view"].includes(code)),
  operator: [],
};

const LEVEL_BY_CODE = new Map(ACCESS_LEVELS.map((level) => [level.code, level]));
const VALID_PERMISSIONS = new Set(ALL_PERMISSION_CODES);

export function levelDefinition(code) {
  return LEVEL_BY_CODE.get(code) ?? LEVEL_BY_CODE.get("operator");
}

export function isValidPermission(code) {
  return VALID_PERMISSIONS.has(code);
}

export function isMasterOnlyPermission(code) {
  return MASTER_ONLY.has(code);
}

export function defaultPermissionsFor(levelCode) {
  return new Set(DEFAULT_PERMISSIONS[levelCode] ?? []);
}

export function effectivePermissions(levelCode, overrides = []) {
  if (levelCode === "master") return [...ALL_PERMISSION_CODES];
  const selected = defaultPermissionsFor(levelCode);
  for (const row of overrides) {
    const code = String(row.permission_code || row.code || "");
    if (!VALID_PERMISSIONS.has(code) || MASTER_ONLY.has(code)) continue;
    if (Number(row.allowed) === 1 || row.allowed === true) selected.add(code);
    else selected.delete(code);
  }
  if (levelCode === "operator") selected.clear();
  return [...selected].sort((a, b) => ALL_PERMISSION_CODES.indexOf(a) - ALL_PERMISSION_CODES.indexOf(b));
}

export function fallbackLevel({ legacyAdmin = false, legacyInspector = false } = {}) {
  if (legacyInspector) return "inspector";
  if (legacyAdmin) return "admin";
  return "operator";
}

export async function loadAuthorization(userId, legacy = {}) {
  const assignment = await queryOne(
    `SELECT level_code FROM user_access_levels WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  const levelCode = assignment?.level_code || fallbackLevel(legacy);
  const level = levelDefinition(levelCode);
  const overrides = assignment
    ? await query(`SELECT permission_code, allowed FROM user_permission_overrides WHERE user_id = ?`, [userId])
    : [];
  const permissions = effectivePermissions(level.code, overrides);
  return {
    accessLevel: level.code,
    accessLevelLabel: level.label,
    accessRank: level.rank,
    isMaster: level.code === "master",
    isPrivileged: level.code !== "operator",
    permissions,
  };
}

export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.isMaster) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function hasAnyPermission(user, permissions) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return next();
    if (!hasPermission(req.user, permission)) {
      return next(forbidden("Seu nível de acesso não possui permissão para esta operação"));
    }
    return next();
  };
}

function apiPath(req) {
  try {
    return new URL(req.originalUrl || req.url || "/", "http://segempat.local").pathname;
  } catch {
    return String(req.path || req.url || "");
  }
}

function requireForRequest(req, next, permission) {
  if (hasPermission(req.user, permission)) return next();
  return next(forbidden("Seu nível de acesso não possui permissão para esta operação"));
}

function requireAnyForRequest(req, next, permissions) {
  if (hasAnyPermission(req.user, permissions)) return next();
  return next(forbidden("Seu nível de acesso não possui permissão para consultar estes dados"));
}

const ADMIN_READ_PERMISSIONS = [
  "dashboard.view",
  "attention.view",
  "team.view",
  "risk.view",
  "analytics.view",
  "reports.view",
];

/**
 * Camada central de menor privilégio. Os routers continuam validando autenticação
 * e regras de negócio; esta camada impede que um usuário privilegiado acesse uma
 * área administrativa que não recebeu explicitamente. Leituras compartilhadas
 * admitem permissões de consulta correlatas, enquanto operações de escrita exigem
 * a permissão de gestão do domínio.
 */
export function enforceGranularApiPermissions(req, _res, next) {
  if (!req.user) return next();
  const path = apiPath(req);
  const method = String(req.method || "GET").toUpperCase();
  const safeRead = method === "GET" || method === "HEAD";
  const privileged = Boolean(req.user.isAdmin);

  if (path.startsWith("/api/authorization")) {
    return requireForRequest(req, next, "access.permissions.manage");
  }
  if (path.startsWith("/api/access/audit") || path.startsWith("/api/operations/audit")) {
    return requireForRequest(req, next, "audit.view");
  }
  if (path.startsWith("/api/access/password-resets")) {
    return requireForRequest(req, next, "access.password_reset");
  }
  if (path.startsWith("/api/access/activation-codes")) {
    if (safeRead) return requireAnyForRequest(req, next, ["access.identity.manage", "access.password_reset"]);
    return requireForRequest(req, next, "access.identity.manage");
  }

  if (path === "/api/employees" || path === "/api/employees/") {
    if (!safeRead) return requireForRequest(req, next, "team.manage");
    if (privileged) {
      return requireAnyForRequest(req, next, [
        ...ADMIN_READ_PERMISSIONS,
        "team.manage",
        "schedule.manage",
        "occurrences.manage",
        "practical.manage",
        "exams.manage",
        "training.manage",
      ]);
    }
  }
  if (path.startsWith("/api/employees/") && path !== "/api/employees/me") {
    if (!safeRead) return requireForRequest(req, next, "team.manage");
    if (privileged) return requireAnyForRequest(req, next, [...ADMIN_READ_PERMISSIONS, "team.manage"]);
  }

  if (path.startsWith("/api/cronograma")) {
    if (!safeRead) return requireForRequest(req, next, "schedule.manage");
    if (privileged) return requireAnyForRequest(req, next, [...ADMIN_READ_PERMISSIONS, "schedule.manage"]);
  }
  if (path.startsWith("/api/question-bank")) {
    if (!safeRead) return requireForRequest(req, next, "question_bank.manage");
    if (privileged) {
      return requireAnyForRequest(req, next, ["question_bank.manage", "exams.manage", "schedule.manage", "training.manage"]);
    }
  }
  if (path.startsWith("/api/admin/training")) {
    return requireForRequest(req, next, "training.manage");
  }
  if (path.startsWith("/api/admin")) {
    return requireForRequest(req, next, "certificates.manage");
  }
  if (path.startsWith("/api/exams") && privileged) {
    if (!safeRead) return requireForRequest(req, next, "exams.manage");
    return requireAnyForRequest(req, next, [...ADMIN_READ_PERMISSIONS, "exams.manage", "certificates.manage"]);
  }
  if (path.startsWith("/api/training") && privileged && !safeRead) {
    return requireForRequest(req, next, "training.manage");
  }

  if (path.startsWith("/api/operations/knowledge") && privileged) {
    if (!safeRead) return requireForRequest(req, next, "knowledge.manage");
    return requireAnyForRequest(req, next, ["knowledge.manage", "ai.view", ...ADMIN_READ_PERMISSIONS]);
  }
  if (path.startsWith("/api/operations/occurrences") && privileged) {
    if (!safeRead) return requireForRequest(req, next, "occurrences.manage");
    return requireAnyForRequest(req, next, ["occurrences.manage", ...ADMIN_READ_PERMISSIONS]);
  }
  if (path.startsWith("/api/operations/") && privileged) {
    if (!safeRead) return requireForRequest(req, next, "practical.manage");
    return requireAnyForRequest(req, next, ["practical.manage", ...ADMIN_READ_PERMISSIONS]);
  }

  return next();
}
