import type { SessionUser } from "@/lib/backend/contracts";

export type AccessPermission =
  | "dashboard.view"
  | "attention.view"
  | "team.view"
  | "team.manage"
  | "risk.view"
  | "schedule.manage"
  | "occurrences.manage"
  | "practical.manage"
  | "exams.manage"
  | "question_bank.manage"
  | "training.manage"
  | "knowledge.manage"
  | "certificates.manage"
  | "analytics.view"
  | "reports.view"
  | "ai.view"
  | "access.identity.manage"
  | "access.password_reset"
  | "audit.view"
  | "security.document.view"
  | "access.permissions.manage";

const ROUTE_PERMISSIONS: Record<string, AccessPermission | AccessPermission[]> = {
  "/admin": "dashboard.view",
  "/atencao": "attention.view",
  "/equipe": ["team.view", "team.manage"],
  "/acessos": ["access.identity.manage", "access.password_reset", "access.permissions.manage"],
  "/analytics": "analytics.view",
  "/risco": "risk.view",
  "/individual": "analytics.view",
  "/radar-analises": "analytics.view",
  "/relatorios": "reports.view",
  "/relatorio-mensal": "reports.view",
  "/tv": "dashboard.view",
  "/auditoria": "audit.view",
  "/documento-seguranca": "security.document.view",
  "/cronograma": "schedule.manage",
  "/cronograma-gestao": "schedule.manage",
  "/provas-criar": "exams.manage",
  "/provas": "exams.manage",
  "/banco-questoes": "question_bank.manage",
  "/modulos-treinamento": "training.manage",
  "/ciclos-treinamento": "training.manage",
  "/validar-certificados": "certificates.manage",
  "/assinaturas-provas": "certificates.manage",
  "/ia-base": "ai.view",
  "/avaliacao-pratica": "practical.manage",
  "/conteudos": "knowledge.manage",
  "/resumos": "knowledge.manage",
  "/ocorrencias": "occurrences.manage",
  "/oportunidades": "training.manage",
  "/foco": "training.manage",
};

const ADMIN_HOME_CANDIDATES = [
  "/admin",
  "/atencao",
  "/equipe",
  "/analytics",
  "/cronograma",
  "/provas-criar",
  "/relatorios",
  "/acessos",
  "/ocorrencias",
  "/avaliacao-pratica",
] as const;

export function hasPermission(user: Pick<SessionUser, "isAdmin" | "isMaster" | "permissions"> | null | undefined, permission: AccessPermission) {
  if (!user) return false;
  if (user.isMaster) return true;
  // Compatibilidade controlada com payloads antigos e com o modo demonstração.
  // No ambiente corporativo atual a API sempre envia a lista de permissões.
  if (!Array.isArray(user.permissions)) return Boolean(user.isAdmin);
  return user.permissions.includes(permission);
}

export function hasAnyPermission(
  user: Pick<SessionUser, "isAdmin" | "isMaster" | "permissions"> | null | undefined,
  permissions: AccessPermission[],
) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function requiredPermissionsForPath(pathname: string): AccessPermission[] | null {
  const canonicalPath = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const exact = ROUTE_PERMISSIONS[canonicalPath];
  if (exact) return Array.isArray(exact) ? exact : [exact];
  if (canonicalPath.startsWith("/certificado/")) return ["certificates.manage"];
  return null;
}

export function canAccessAdminPath(user: SessionUser, pathname: string) {
  if (!user.isAdmin) return false;
  const required = requiredPermissionsForPath(pathname);
  if (!required) return true;
  return hasAnyPermission(user, required);
}

export function firstAllowedAdminPath(user: SessionUser) {
  for (const path of ADMIN_HOME_CANDIDATES) {
    if (canAccessAdminPath(user, path)) return path;
  }
  return "/painel";
}
