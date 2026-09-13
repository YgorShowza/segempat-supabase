import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function requireFile(relativePath) {
  if (!exists(relativePath)) throw new Error(`Arquivo obrigatório ausente: ${relativePath}`);
  return read(relativePath);
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`${label}: contrato ausente (${needle})`);
}

function requireAbsent(content, needle, label) {
  if (content.includes(needle)) throw new Error(`${label}: conteúdo indevido encontrado (${needle})`);
}

function requireOrdered(content, needles, label) {
  let cursor = -1;
  for (const needle of needles) {
    const index = content.indexOf(needle, cursor + 1);
    if (index < 0) throw new Error(`${label}: valor ausente (${needle})`);
    if (index <= cursor) throw new Error(`${label}: ordem inválida em ${needle}`);
    cursor = index;
  }
}

const demoMode = requireFile("src/lib/demo-mode.ts");
requireText(demoMode, 'matricula: "000001"', "Perfil demo Inspetor");
requireText(demoMode, 'matricula: "100101"', "Perfil demo Operador");
requireText(demoMode, "!configuredApiUrl() && !envFlag(\"VITE_SEGEMPAT_REQUIRE_API\")", "Isolamento do demo");

const authGateway = requireFile("src/lib/backend/auth-gateway.ts");
requireText(authGateway, 'const DEMO_PASSWORD = "demo"', "Senha de apresentação");
requireText(authGateway, 'enableDemoMode("inspector")', "Login demo Inspetor");
requireText(authGateway, 'enableDemoMode("operator")', "Login demo Operador");

const badge = requireFile("src/components/DemoModeBadge.tsx");
requireText(badge, "MODO DEMONSTRAÇÃO", "Aviso do modo demo");
requireText(badge, "DADOS FICTÍCIOS", "Aviso de dados fictícios");
requireText(badge, "switchProfile", "Troca Inspetor/Operador");

const adminAttempts = requireFile("src/lib/backend/admin-attempts.ts");
requireOrdered(
  adminAttempts,
  ["score: 5.8", "score: 6.6", "score: 7.6", "score: 8.8"],
  "Narrativa de evolução 5.8 → 6.6 → 7.6 → 8.8",
);
requireText(adminAttempts, 'exam_id: "demo-exam-03"', "Reprovação demonstrativa não resolvida");

const demoApi = requireFile("src/lib/demo-api.ts");
for (const contract of [
  'pathname === "/api/employees"',
  'pathname === "/api/admin/exam-attempts"',
  'pathname === "/api/exams"',
  'pathname.startsWith("/api/cronograma/year/")',
  'pathname === "/api/operations/knowledge"',
  'pathname === "/api/operations/occurrences"',
  'pathname === "/api/operations/practical-evaluations"',
  'pathname === "/api/operations/audit"',
  'pathname === "/api/training/modules"',
  'pathname === "/api/admin/training/schedules"',
  'pathname === "/api/question-bank"',
]) {
  requireText(demoApi, contract, "Cobertura demo do Inspetor");
}

const operatorDemo = requireFile("src/lib/operator-demo-api.ts");
for (const contract of [
  'pathname === "/api/auth/me"',
  'pathname === "/api/me/exam-attempts"',
  'pathname === "/api/me/certificate-states"',
  'pathname === "/api/me/exams"',
  'pathname.startsWith("/api/cronograma/year/")',
  'pathname === "/api/operations/practical-evaluations"',
  'pathname === "/api/operations/occurrences"',
  'pathname === "/api/operations/knowledge"',
  'pathname === "/api/training/modules"',
  'pathname === "/api/me/training/schedule"',
  'pathname === "/api/me/training/activities"',
  'pathname === "/api/question-bank/operational"',
]) {
  requireText(operatorDemo, contract, "Cobertura demo do Operador");
}
requireText(operatorDemo, "/attempts$/", "Realização de prova pelo Operador demo");
requireText(operatorDemo, "/signature$/", "Assinatura de prova pelo Operador demo");

const appLayout = requireFile("src/components/AppLayoutV2.tsx");
const adminRoutes = [
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
const operatorRoutes = [
  "/painel",
  "/pendencias",
  "/provas",
  "/progresso",
  "/certificados",
  "/treinamentos",
  "/conteudos",
  "/meu-perfil",
  "/pratico",
  "/minhas-ocorrencias",
];

for (const route of [...adminRoutes, ...operatorRoutes]) {
  requireText(appLayout, `path: "${route}"`, `Navegação ${route}`);
  const routeFile = `src/routes/_authenticated/${route.slice(1)}.tsx`;
  if (!exists(routeFile)) throw new Error(`Rota navegável sem arquivo: ${route} → ${routeFile}`);
}

const authRouteDir = path.join(root, "src/routes/_authenticated");
for (const entry of fs.readdirSync(authRouteDir)) {
  if (!entry.endsWith(".tsx")) continue;
  const content = read(`src/routes/_authenticated/${entry}`);
  if (content.includes("EmBreve")) throw new Error(`Tela autenticada ainda usa placeholder EmBreve: ${entry}`);
}

const examApi = requireFile("src/lib/exams.ts");
requireText(examApi, "normalizeDemoScale", "Escala de notas do modo demo");
requireText(examApi, "score <= 10", "Proteção da escala 0–10");

const wrangler = requireFile("wrangler.jsonc");
requireText(wrangler, '"name": "app-reimagined"', "Identidade do Worker Cloudflare");
requireText(wrangler, '"main": "@tanstack/react-start/server-entry"', "Entrypoint Cloudflare");

const originalLogo = "https://media.base44.com/images/public/6a1117d573bbf85981b1abee/8271ac857_IMG_9226.png";
const loginRoute = requireFile("src/routes/index.tsx");
requireText(loginRoute, originalLogo, "Logo original EMPAT no login");
requireText(loginRoute, "isDemoModeAllowed", "Detecção do ambiente demo no login");
requireText(loginRoute, '"Modo demonstração"', "Status correto do preview demo");
requireText(
  loginRoute,
  "Ambiente de demonstração com dados fictícios; a API corporativa permanece isolada.",
  "Explicação do isolamento demo",
);
requireText(
  loginRoute,
  'step === "password" && !demoAvailable',
  "Recuperação de senha restrita ao ambiente corporativo",
);
requireText(loginRoute, "{!demoAvailable && (", "Primeiro acesso restrito ao ambiente corporativo");
requireText(appLayout, originalLogo, "Logo original EMPAT no layout autenticado");

const vite = requireFile("vite.config.ts");
requireAbsent(vite, "segempat-local-brand-asset", "Substituição raster de baixa resolução da marca EMPAT");
requireAbsent(vite, '"/empat-logo.svg"', "Redirecionamento para logo local de baixa resolução");
if (exists("public/empat-logo.svg")) throw new Error("Asset de baixa resolução public/empat-logo.svg não deve voltar ao runtime");

console.log("SEGEMPAT presentation readiness contract OK");
console.log(`- ${adminRoutes.length} rotas do Inspetor protegidas`);
console.log(`- ${operatorRoutes.length} rotas do Operador protegidas`);
console.log("- demo Inspetor/Operador, notas 0–10 e evolução 5.8 → 6.6 → 7.6 → 8.8 protegidos");
console.log("- login demo sem falso alerta de indisponibilidade e sem fluxos corporativos inválidos");
console.log("- Worker app-reimagined e logo EMPAT original protegidos");
