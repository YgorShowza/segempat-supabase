import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const routesDir = join(root, "src/routes/_authenticated");
const read = (path) => readFileSync(join(root, path), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

function extractSet(source, name) {
  const startToken = `const ${name} = new Set([`;
  const start = source.indexOf(startToken);
  if (start < 0) {
    failures.push(`Conjunto ${name} não encontrado no shell autenticado.`);
    return [];
  }
  const end = source.indexOf("]);", start);
  if (end < 0) {
    failures.push(`Conjunto ${name} está sem fechamento reconhecível.`);
    return [];
  }
  const body = source.slice(start + startToken.length, end);
  return [...body.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]);
}

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  check(start >= 0 && end > start, `Bloco ${startToken} não pôde ser isolado.`);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function requireText(path, needles) {
  const source = read(path);
  for (const needle of needles) {
    check(source.includes(needle), `${path} não contém o contrato esperado: ${needle}`);
  }
}

const shell = read("src/routes/_authenticated/route.tsx");
const layout = read("src/components/AppLayoutV2.tsx");
const rootRoute = read("src/routes/__root.tsx");
const adminOnly = new Set(extractSet(shell, "ADMIN_ONLY_PATHS"));
const operatorDesktop = new Set(extractSet(shell, "OPERATOR_DESKTOP_PATHS"));
const inspectorDesktop = new Set(extractSet(shell, "INSPECTOR_DESKTOP_PATHS"));

const adminMenuBlock = section(layout, "const adminSections", "const operatorMenu");
const operatorMenuBlock = section(layout, "const operatorMenu", "function routeMatches");

const adminMenuRoutes = [
  "/admin",
  "/atencao",
  "/analytics",
  "/equipe",
  "/risco",
  "/individual",
  "/cronograma",
  "/ocorrencias",
  "/avaliacao-pratica",
  "/provas-criar",
  "/provas",
  "/banco-questoes",
  "/modulos-treinamento",
  "/ciclos-treinamento",
  "/conteudos",
  "/assinaturas-provas",
  "/validar-certificados",
  "/relatorios",
  "/ia-base",
  "/acessos",
  "/auditoria",
  "/documento-seguranca",
];

const operatorMenuRoutes = [
  "/painel",
  "/pendencias",
  "/progresso",
  "/certificados",
  "/treinamentos",
  "/conteudos",
  "/meu-perfil",
  "/pratico",
  "/minhas-ocorrencias",
];

for (const route of adminMenuRoutes) {
  check(adminMenuBlock.includes(`path: "${route}"`), `Rota ${route} saiu do menu da Inspetoria sem atualização do contrato.`);
}
for (const route of operatorMenuRoutes) {
  check(operatorMenuBlock.includes(`path: "${route}"`), `Rota ${route} saiu do menu do Operador sem atualização do contrato.`);
  check(operatorDesktop.has(route), `Rota de menu do Operador sem cobertura desktop no shell: ${route}`);
}

const families = {
  native: ["/admin", "/equipe"],
  operational: ["/cronograma", "/cronograma-gestao", "/ocorrencias", "/provas"],
  analytical: ["/analytics", "/individual", "/relatorios", "/relatorio-mensal"],
  governance: ["/acessos", "/auditoria", "/documento-seguranca"],
  training: ["/banco-questoes", "/ciclos-treinamento", "/conteudos", "/assinaturas-provas", "/avaliacao-pratica"],
  inspector: ["/atencao", "/risco", "/ia-base", "/provas-criar", "/modulos-treinamento", "/validar-certificados"],
};

for (const route of adminMenuRoutes) {
  const memberships = Object.entries(families).filter(([, routes]) => routes.includes(route)).map(([family]) => family);
  check(memberships.length === 1, `Rota administrativa visível ${route} deve pertencer a exatamente uma família desktop; atual: ${memberships.join(", ") || "nenhuma"}.`);
}

const sharedAdminRoutes = new Set(["/provas", "/conteudos"]);
for (const route of adminMenuRoutes) {
  if (!sharedAdminRoutes.has(route)) check(adminOnly.has(route), `Rota exclusiva da Inspetoria sem proteção central: ${route}`);
}
for (const route of sharedAdminRoutes) {
  check(!adminOnly.has(route), `Rota compartilhada ${route} foi marcada indevidamente como exclusiva da Inspetoria.`);
}
check(operatorMenuRoutes.includes("/conteudos"), "Conteúdos deixou de estar disponível no menu do Operador.");
requireText("src/routes/_authenticated/provas.tsx", ["listAvailableExams", "isAdmin", "segempat-operational-provas"]);

const aliases = {
  "/radar-analises": ["radar-analises.tsx", "/analytics"],
  "/resumos": ["resumos.tsx", "/conteudos"],
  "/oportunidades": ["oportunidades.tsx", "/treinamentos"],
  "/foco": ["foco.tsx", "/treinamentos"],
};
for (const [route, [file, target]] of Object.entries(aliases)) {
  check(adminOnly.has(route), `Alias administrativo ${route} perdeu a proteção central.`);
  requireText(`src/routes/_authenticated/${file}`, [`redirect({ to: "${target}" })`]);
}

const hiddenAdminScreens = ["/cronograma-gestao", "/relatorio-mensal", "/tv"];
const expectedAdminOnly = new Set([
  ...adminMenuRoutes.filter((route) => !sharedAdminRoutes.has(route)),
  ...hiddenAdminScreens,
  ...Object.keys(aliases),
]);
for (const route of adminOnly) check(expectedAdminOnly.has(route), `ADMIN_ONLY_PATHS contém rota sem classificação na auditoria: ${route}`);
for (const route of expectedAdminOnly) check(adminOnly.has(route), `Rota administrativa classificada não está em ADMIN_ONLY_PATHS: ${route}`);

for (const route of families.inspector) {
  check(inspectorDesktop.has(route), `Rota complementar da Inspetoria ausente de INSPECTOR_DESKTOP_PATHS: ${route}`);
}
for (const route of inspectorDesktop) {
  check(families.inspector.includes(route), `INSPECTOR_DESKTOP_PATHS contém rota fora da família Inspector: ${route}`);
  check(adminOnly.has(route), `Rota Inspector Desktop sem proteção administrativa: ${route}`);
  check(!operatorDesktop.has(route), `Rota ${route} aparece simultaneamente em Inspector e Operator Desktop.`);
}
for (const route of operatorDesktop) check(!adminOnly.has(route), `Rota do Operador marcada simultaneamente como ADMIN_ONLY: ${route}`);

const classifiedRoutes = new Set([
  ...adminMenuRoutes,
  ...operatorDesktop,
  ...hiddenAdminScreens,
  ...Object.keys(aliases),
]);
const routeFiles = readdirSync(routesDir).filter((file) => file.endsWith(".tsx") && file !== "route.tsx");
for (const file of routeFiles) {
  if (file === "certificado.$attemptId.tsx") continue;
  const route = `/${file.slice(0, -4)}`;
  check(classifiedRoutes.has(route), `Rota autenticada sem classificação desktop/fluxo: ${route}`);
}
check(shell.includes('canonicalPath.startsWith("/certificado/")'), "Emissão administrativa de certificado perdeu a proteção dinâmica /certificado/.");
requireText("src/routes/_authenticated/certificado.$attemptId.tsx", ["CertificateAdminPage", "getAdminExamAttemptEvidence", "A emissão do certificado é exclusiva da Inspetoria"]);

requireText("src/components/dashboard/AdminDashboardV2.tsx", ['max-w-[1536px]']);
requireText("src/components/team/TeamManagementWorkspace.tsx", ['max-w-[1536px]']);

requireText("src/operational-desktop.css", [
  "segempat-operational-cronograma",
  "segempat-operational-cronograma-management",
  "segempat-operational-occurrences",
  "segempat-operational-provas",
  "max-width: 1536px",
]);
requireText("src/components/cronograma/CronogramaPorted.tsx", ["segempat-operational-cronograma"]);
requireText("src/routes/_authenticated/cronograma-gestao.tsx", ["segempat-operational-cronograma-management"]);
requireText("src/routes/_authenticated/ocorrencias.tsx", ["segempat-operational-occurrences"]);
requireText("src/routes/_authenticated/provas.tsx", ["segempat-operational-provas"]);

requireText("src/analytical-desktop.css", [
  "segempat-analytical-analytics",
  "segempat-analytical-individual",
  "segempat-analytical-reports",
  "segempat-analytical-monthly-report",
  "max-width: 1536px",
]);
requireText("src/routes/_authenticated/analytics.tsx", ["segempat-analytical-analytics"]);
requireText("src/routes/_authenticated/individual.tsx", ["segempat-analytical-individual"]);
requireText("src/routes/_authenticated/relatorios.tsx", ["segempat-analytical-reports"]);
requireText("src/routes/_authenticated/relatorio-mensal.tsx", ["segempat-analytical-monthly-report"]);

requireText("src/governance-desktop.css", ["segempat-governance-access", "segempat-governance-audit", "segempat-governance-security"]);
requireText("src/routes/_authenticated/acessos.tsx", ["segempat-governance-access"]);
requireText("src/routes/_authenticated/auditoria.tsx", ["segempat-governance-audit"]);
requireText("src/routes/_authenticated/documento-seguranca.tsx", ["segempat-governance-security"]);

requireText("src/training-management-desktop.css", [
  "segempat-training-question-bank",
  "segempat-training-cycles",
  "segempat-training-knowledge",
  "segempat-training-signatures",
  "segempat-training-practical",
]);
requireText("src/routes/_authenticated/banco-questoes.tsx", ["segempat-training-question-bank"]);
requireText("src/routes/_authenticated/ciclos-treinamento.tsx", ["segempat-training-cycles"]);
requireText("src/routes/_authenticated/conteudos.tsx", ["segempat-training-knowledge"]);
requireText("src/routes/_authenticated/assinaturas-provas.tsx", ["segempat-training-signatures"]);
requireText("src/routes/_authenticated/avaliacao-pratica.tsx", ["segempat-training-practical"]);

requireText("src/inspector-desktop.css", ["segempat-inspector-desktop", "max-width: 1536px", "max-width: 1280px"]);
requireText("src/routes/_authenticated/route.tsx", ["segempat-inspector-desktop", "data-inspector-route", "segempat-operator-desktop", "data-operator-route"]);
requireText("src/operator-desktop.css", ["segempat-operator-desktop", "max-width: 1536px", "max-width: 1280px"]);

for (const css of [
  "operational-desktop.css",
  "analytical-desktop.css",
  "governance-desktop.css",
  "training-management-desktop.css",
  "operator-desktop.css",
  "inspector-desktop.css",
]) {
  check(rootRoute.includes(css), `Folha desktop não está carregada globalmente em __root.tsx: ${css}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  console.error(`Auditoria desktop falhou com ${failures.length} inconsistência(s).`);
  process.exit(1);
}

console.log(`SEGEMPAT Desktop Coverage Audit OK · ${routeFiles.length} rotas autenticadas classificadas ou explicitamente isentas.`);
console.log("Famílias: Native · Operational · Analytical · Governance · Training Management · Inspector · Operator/Focused Flows.");
