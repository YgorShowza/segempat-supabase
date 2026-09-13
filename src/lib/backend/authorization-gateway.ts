import { isDemoModeAllowed } from "@/lib/demo-mode";
import { apiRequest } from "./api-client";
import type { AccessLevel } from "./contracts";

export interface AccessLevelDefinition {
  code: AccessLevel;
  label: string;
  rank: number;
}

export interface PermissionDefinition {
  code: string;
  label: string;
  group: string;
  sortOrder: number;
  masterOnly?: boolean;
}

export interface AuthorizationCatalog {
  levels: AccessLevelDefinition[];
  permissions: PermissionDefinition[];
  default_permissions: Record<AccessLevel, string[]>;
}

export interface AuthorizationUser {
  user_id: string;
  employee_id: string | null;
  name: string;
  matricula: string;
  sector: string | null;
  account_status: string;
  employee_status: string | null;
  access_profile: string | null;
  level: AccessLevel;
  level_label: string;
  permissions: string[];
  is_self: boolean;
}

const DEMO_LEVELS: AccessLevelDefinition[] = [
  { code: "master", label: "Administrador Master", rank: 100 },
  { code: "admin", label: "Administrador", rank: 80 },
  { code: "inspector", label: "Inspetor", rank: 60 },
  { code: "operator", label: "Operador", rank: 10 },
];

const DEMO_PERMISSIONS: PermissionDefinition[] = [
  ["dashboard.view", "Visualizar dashboard administrativo", "Comando Operacional"],
  ["attention.view", "Visualizar Central de Atenção", "Comando Operacional"],
  ["team.view", "Visualizar equipe completa", "Equipe & Desempenho"],
  ["team.manage", "Cadastrar e editar colaboradores", "Equipe & Desempenho"],
  ["risk.view", "Visualizar Zona de Risco", "Equipe & Desempenho"],
  ["schedule.manage", "Gerenciar cronograma", "Operação"],
  ["occurrences.manage", "Gerenciar ocorrências", "Operação"],
  ["practical.manage", "Gerenciar avaliações práticas", "Operação"],
  ["exams.manage", "Criar e gerenciar provas", "Capacitação"],
  ["question_bank.manage", "Gerenciar banco de questões", "Capacitação"],
  ["training.manage", "Gerenciar treinamentos, módulos e ciclos", "Capacitação"],
  ["knowledge.manage", "Gerenciar conteúdos e base de conhecimento", "Capacitação"],
  ["certificates.manage", "Gerenciar certificados e assinaturas", "Capacitação"],
  ["analytics.view", "Visualizar Analytics e análise individual", "Relatórios & Inteligência"],
  ["reports.view", "Visualizar relatórios gerenciais", "Relatórios & Inteligência"],
  ["ai.view", "Acessar IA Base", "Relatórios & Inteligência"],
  ["access.identity.manage", "Gerenciar primeiro acesso", "Governança"],
  ["access.password_reset", "Autorizar recuperação de senha", "Governança"],
  ["audit.view", "Visualizar trilha de auditoria", "Governança"],
  ["security.document.view", "Visualizar documento de segurança", "Governança"],
  ["access.permissions.manage", "Gerenciar níveis e permissões", "Segurança"],
].map(([code, label, group], index) => ({
  code,
  label,
  group,
  sortOrder: (index + 1) * 10,
  masterOnly: code === "access.permissions.manage",
}));

const ALL_DEMO_PERMISSIONS = DEMO_PERMISSIONS.map((permission) => permission.code);
const DEMO_DEFAULTS: Record<AccessLevel, string[]> = {
  master: [...ALL_DEMO_PERMISSIONS],
  admin: ALL_DEMO_PERMISSIONS.filter((code) => !["access.permissions.manage", "audit.view"].includes(code)),
  inspector: ALL_DEMO_PERMISSIONS.filter((code) => !["access.permissions.manage", "audit.view", "security.document.view"].includes(code)),
  operator: [],
};

const DEMO_CATALOG: AuthorizationCatalog = {
  levels: DEMO_LEVELS,
  permissions: DEMO_PERMISSIONS,
  default_permissions: DEMO_DEFAULTS,
};

let demoUsers: AuthorizationUser[] = [
  {
    user_id: "demo-inspector",
    employee_id: "demo-inspector-employee",
    name: "Inspetor Demo",
    matricula: "000001",
    sector: "CFTV",
    account_status: "Ativo",
    employee_status: "Ativo",
    access_profile: "Inspetor",
    level: "master",
    level_label: "Administrador Master",
    permissions: [...ALL_DEMO_PERMISSIONS],
    is_self: true,
  },
  {
    user_id: "demo-operator",
    employee_id: "demo-operator-employee",
    name: "Operador Demo",
    matricula: "100101",
    sector: "CFTV",
    account_status: "Ativo",
    employee_status: "Ativo",
    access_profile: "Operacional",
    level: "operator",
    level_label: "Operador",
    permissions: [],
    is_self: false,
  },
];

export async function getAuthorizationCatalog(): Promise<AuthorizationCatalog> {
  if (isDemoModeAllowed()) return DEMO_CATALOG;
  return apiRequest<AuthorizationCatalog>("/api/authorization/catalog");
}

export async function listAuthorizationUsers(): Promise<AuthorizationUser[]> {
  if (isDemoModeAllowed()) return demoUsers.map((user) => ({ ...user, permissions: [...user.permissions] }));
  return apiRequest<AuthorizationUser[]>("/api/authorization/users");
}

export async function updateAuthorizationUser(
  userId: string,
  input: { level: AccessLevel; permissions: string[] },
): Promise<AuthorizationUser> {
  if (isDemoModeAllowed()) {
    const current = demoUsers.find((user) => user.user_id === userId);
    if (!current) throw new Error("Conta de demonstração não encontrada.");
    if (current.is_self) throw new Error("A conta Master em uso é protegida contra alteração própria.");
    const level = DEMO_LEVELS.find((item) => item.code === input.level);
    if (!level) throw new Error("Nível de acesso inválido.");
    const permissions = input.level === "master"
      ? [...ALL_DEMO_PERMISSIONS]
      : input.level === "operator"
        ? []
        : [...new Set(input.permissions)].filter((code) => ALL_DEMO_PERMISSIONS.includes(code) && code !== "access.permissions.manage");
    const next: AuthorizationUser = {
      ...current,
      level: input.level,
      level_label: level.label,
      permissions,
    };
    demoUsers = demoUsers.map((user) => user.user_id === userId ? next : user);
    return { ...next, permissions: [...next.permissions] };
  }

  return apiRequest<AuthorizationUser>(`/api/authorization/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
