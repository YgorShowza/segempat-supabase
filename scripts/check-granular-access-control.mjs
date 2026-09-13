import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[granular-access-control] ausente: ${label}`);
    process.exitCode = 1;
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    console.error(`[granular-access-control] proibido: ${label}`);
    process.exitCode = 1;
  }
}

const migration = read("database/mysql/010_granular_access_control.sql");
const authorization = read("server/src/authorization.js");
const authorizationRoute = read("server/src/routes/authorization.js");
const session = read("server/src/session.js");
const app = read("server/src/app.js");
const auth = read("server/src/routes/auth.js");
const bootstrap = read("server/scripts/bootstrap-admin.js");
const grantMaster = read("server/scripts/grant-master-access.js");
const manageInspector = read("server/scripts/manage-inspector-access.js");
const privilegedReport = read("server/scripts/report-privileged-access.js");
const serverPackage = read("server/package.json");
const accessRoute = read("src/routes/_authenticated/acessos.tsx");
const authenticatedRoute = read("src/routes/_authenticated/route.tsx");
const appLayout = read("src/components/AppLayoutV2.tsx");
const frontendAccessControl = read("src/lib/access-control.ts");
const demoMode = read("src/lib/demo-mode.ts");
const authorizationGateway = read("src/lib/backend/authorization-gateway.ts");
const permissionUi = read("src/components/access/PermissionAdministration.tsx");
const integrationWorkflow = read(".github/workflows/mysql-integration.yml");

for (const table of [
  "access_levels",
  "access_permissions",
  "access_level_permissions",
  "user_access_levels",
  "user_permission_overrides",
]) {
  requireText(migration, `CREATE TABLE ${table}`, `tabela MySQL ${table}`);
  requireText(app, `"${table}"`, `readiness da tabela ${table}`);
}

for (const level of ["master", "admin", "inspector", "operator"]) {
  requireText(migration, `('${level}'`, `nível ${level} na migration`);
  requireText(authorization, `code: "${level}"`, `nível ${level} no motor de autorização`);
}

requireText(migration, "('access.permissions.manage', 'Gerenciar níveis e permissões', 'Segurança', 210, 1)", "permissão de gestão marcada como exclusiva do Master");
requireText(migration, "WHEN e.access_profile = 'Inspetor' THEN 'inspector'", "migração segura de Inspetores legados");
requireText(migration, "THEN 'admin'", "migração segura de roles administrativas legadas");
requireText(migration, "ELSE 'operator'", "fallback de menor privilégio na migration");
forbidText(migration, "THEN 'master'", "migration não pode promover contas legadas automaticamente a Master");

requireText(authorization, "masterOnly: true", "permissão master-only no backend");
requireText(authorization, "enforceGranularApiPermissions", "enforcement global no backend");
requireText(authorization, "access.permissions.manage", "proteção da gestão de permissões");
requireText(authorization, "access.password_reset", "proteção granular de recuperação de senha");
requireText(authorization, 'if (legacyInspector) return "inspector";', "fallback legado de Inspetor sem promoção");
requireText(authorization, 'if (legacyAdmin) return "admin";', "fallback legado de admin sem promoção");
forbidText(authorization, 'if (legacyAdmin) return "master";', "fallback legado não pode conceder Master");

requireText(auth, "const initialAccessLevel = employee.access_profile === \"Inspetor\" ? \"inspector\" : \"operator\"", "ativação futura em menor privilégio");
requireText(auth, "INSERT INTO user_access_levels", "persistência do nível no primeiro acesso");
if (auth.includes("initialAccessLevel = employee.access_profile === \"Inspetor\" ? \"master\"")) {
  console.error("[granular-access-control] ativação de novo Inspetor não pode promover diretamente a Master");
  process.exitCode = 1;
}

requireText(session, "loadAuthorization", "carregamento da autorização na sessão");
requireText(session, "permissions: authorization.permissions", "permissões expostas no contexto autenticado");
requireText(session, "accessLevel: authorization.accessLevel", "nível exposto no contexto autenticado");

requireText(authorizationRoute, "targetUserId === req.user.id", "bloqueio de alteração própria");
requireText(authorizationRoute, "Não é permitido remover o último Administrador Master", "proteção do último Master");
requireText(authorizationRoute, "FOR UPDATE", "locks transacionais de privilégio");
requireText(authorizationRoute, "session_epoch = session_epoch + 1", "invalidação imediata de sessões");
requireText(authorizationRoute, '"UPDATE_ACCESS_CONTROL"', "auditoria de alteração de privilégios");
requireText(authorizationRoute, "master_only_not_delegable", "proteção de permissão exclusiva do Master");

requireText(app, 'app.use("/api", enforceGranularApiPermissions)', "middleware global de autorização");
requireText(app, 'app.use("/api/authorization", authorizationRouter)', "API de administração de permissões");

requireText(frontendAccessControl, "canAccessAdminPath", "contrato de autorização de rotas no frontend");
requireText(frontendAccessControl, '"/equipe": ["team.view", "team.manage"]', "rota Equipe aceita consulta ou gestão explicitamente autorizada");
requireText(authenticatedRoute, "canAccessAdminPath", "guard de rota com permissões");
requireText(authenticatedRoute, "<DemoModeBadge />", "badge de demonstração preservado no shell autenticado");
requireText(authenticatedRoute, "ssr: false", "comportamento client-side autenticado preservado");
requireText(authenticatedRoute, "segempat-operator-desktop", "wrapper desktop do Operador preservado");
requireText(authenticatedRoute, "segempat-inspector-desktop", "wrapper desktop do Inspetor preservado");
requireText(appLayout, "canAccessAdminPath", "menu administrativo filtrado por permissão");
requireText(appLayout, "accessLevelLabel", "identidade visual exibe o nível granular efetivo");
requireText(accessRoute, "PermissionAdministration", "painel de níveis e permissões na Governança");
requireText(accessRoute, 'title: "Acessos · SEGEMPAT"', "metadado da página de Acessos preservado");
requireText(permissionUi, "Conta atual · protegida", "proteção visual da conta atual");
requireText(permissionUi, "Salvar nível e permissões", "editor granular de permissões");

requireText(demoMode, 'matricula: "000001"', "sessão demo da Inspetoria preserva matrícula esperada");
requireText(demoMode, "isMaster: true", "sessão demo da Inspetoria permanece Master");
requireText(demoMode, 'accessLevel: "master"', "sessão demo da Inspetoria expõe nível Master");
requireText(demoMode, 'accessLevelLabel: "Administrador Master"', "rótulo Master consistente no modo demonstração");
requireText(demoMode, 'matricula: "100101"', "sessão demo do Operador preserva matrícula esperada");
requireText(demoMode, "isAdmin: false", "sessão demo do Operador não recebe privilégio administrativo");
requireText(demoMode, "isMaster: false", "sessão demo do Operador não recebe privilégio Master");
requireText(demoMode, 'accessLevel: "operator"', "sessão demo do Operador expõe nível Operador");

requireText(authorizationGateway, "isDemoModeAllowed", "isolamento do modo demonstração");
requireText(authorizationGateway, 'matricula: "000001"', "conta Master fictícia de demonstração");
requireText(authorizationGateway, 'matricula: "100101"', "conta Operador fictícia de demonstração");

requireText(bootstrap, "level_code, updated_by", "bootstrap grava nível granular");
requireText(bootstrap, "'master'", "bootstrap cria primeiro Administrador Master");
requireText(bootstrap, "session_epoch = session_epoch + 1", "bootstrap revoga sessões anteriores");

requireText(grantMaster, "CONFIRM_MASTER_ACCESS", "concessão Master exige confirmação explícita");
requireText(grantMaster, "TI_OPERATOR", "concessão Master exige identificação da TI");
requireText(grantMaster, "level_code = 'master'", "concessão Master grava nível explícito");
requireText(grantMaster, "session_epoch = session_epoch + 1", "concessão Master invalida sessões");
requireText(grantMaster, "TI_GRANT_MASTER_ACCESS", "concessão Master gera auditoria");
forbidText(grantMaster, "password_hash", "concessão Master não deve manipular senha");
requireText(serverPackage, '"grant-master-access": "node scripts/grant-master-access.js"', "comando operacional de concessão Master");

requireText(manageInspector, "level_code = 'inspector'", "script TI concede nível Inspector");
requireText(manageInspector, "level_code = 'operator'", "script TI revoga para Operador");
requireText(manageInspector, 'previousLevel === "master"', "script TI protege conta Master");
requireText(manageInspector, "session_epoch = session_epoch + 1", "script TI invalida sessões");

requireText(privilegedReport, "user_access_levels", "relatório TI usa níveis granulares");
requireText(privilegedReport, "effectivePermissions", "relatório TI calcula permissões efetivas");
requireText(privilegedReport, "TI_GRANT_MASTER_ACCESS", "relatório TI reconhece concessão explícita de Master");
requireText(integrationWorkflow, '\"version\":\"010\"', "integração MySQL exige migration 010");

if (process.exitCode) process.exit(process.exitCode);
console.log("SEGEMPAT granular access control contract: OK");
