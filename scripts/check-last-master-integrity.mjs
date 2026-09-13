import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function readContract(filename) {
  for (const candidate of [`.github/contracts/${filename}`, `.github/workflows/${filename}`]) {
    if (fs.existsSync(candidate)) return read(candidate);
  }
  throw new Error(`Contrato CI não encontrado: ${filename}`);
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[last-master-integrity] ausente: ${label}`);
    process.exitCode = 1;
  }
}

const authorizationRoute = read("server/src/routes/authorization.js");
const employeesRoute = read("server/src/routes/employees.js");
const session = read("server/src/session.js");
const grantMaster = read("server/scripts/grant-master-access.js");
const manageInspector = read("server/scripts/manage-inspector-access.js");
const workflow = readContract("granular-access-control.yml");

requireText(
  authorizationRoute,
  "JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))",
  "contagem de Masters utilizáveis considera cadastro funcional",
);
requireText(
  authorizationRoute,
  "AND e.status = 'Ativo'",
  "rebaixamento só conta Master com cadastro funcional ativo",
);
requireText(
  authorizationRoute,
  "Não é permitido remover o último Administrador Master do SEGEMPAT",
  "bloqueio de rebaixamento do último Master",
);
requireText(authorizationRoute, "FOR UPDATE", "lock transacional do conjunto de Masters");

requireText(employeesRoute, "lockLinkedAccessAccount", "Gestão de Equipe consulta nível granular vinculado");
requireText(employeesRoute, "SELECT level_code", "nível granular é bloqueado antes da alteração funcional");
requireText(
  employeesRoute,
  'statusChanged && input.status === "Inativo" && linkedLevel === "master"',
  "inativação funcional de conta Master é bloqueada",
);
requireText(
  employeesRoute,
  "Cadastro vinculado a Administrador Master não pode ser inativado pela Gestão de Equipe",
  "mensagem operacional orienta transferência prévia do nível Master",
);
requireText(
  employeesRoute,
  'linkedLevel === "master" || (profile === "Inspetor" && status === "Ativo")',
  "role administrativa legada é preservada para Master",
);
requireText(employeesRoute, "master_status_guard", "auditoria registra verificação do guard Master");

requireText(
  session,
  'row.account_status !== "Ativo" || row.employee_status !== "Ativo"',
  "sessão só considera utilizável conta e cadastro funcional ativos",
);
requireText(grantMaster, 'account.employee_status !== "Ativo"', "concessão Master exige cadastro funcional ativo");
requireText(manageInspector, 'previousLevel === "master"', "utilitário de Inspetor não altera conta Master");
requireText(workflow, "node scripts/check-last-master-integrity.mjs", "gate dedicado executado no CI granular");
requireText(workflow, "node --check server/src/routes/employees.js", "sintaxe da rota de equipe protegida no CI");

if (process.exitCode) process.exit(process.exitCode);
console.log("SEGEMPAT last Master integrity contract: OK");
