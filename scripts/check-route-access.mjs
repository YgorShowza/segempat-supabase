import fs from "node:fs";

const guardSource = fs.readFileSync("src/routes/_authenticated/route.tsx", "utf8");
const layoutSource = fs.readFileSync("src/components/AppLayout.tsx", "utf8");
const academySource = fs.readFileSync("src/components/training/TrainingLibrary.tsx", "utf8");

const adminBlock = guardSource.match(/const ADMIN_ONLY_PATHS = new Set\(\[([\s\S]*?)\]\);/);
if (!adminBlock) throw new Error("Não foi possível localizar ADMIN_ONLY_PATHS no guard autenticado");

const operatorBlock = layoutSource.match(/const operadorMenu: MenuItem\[\] = \[([\s\S]*?)\];/);
if (!operatorBlock) throw new Error("Não foi possível localizar operadorMenu no AppLayout");

const adminOnly = new Set(
  [...adminBlock[1].matchAll(/"(\/[^"\s]+)"/g)].map((match) => match[1]),
);
const operatorPaths = [...operatorBlock[1].matchAll(/path:\s*"(\/[^"\s]+)"/g)].map((match) => match[1]);

if (operatorPaths.length === 0) throw new Error("Menu do Operador ficou vazio ou não pôde ser analisado");

const duplicates = operatorPaths.filter((path, index) => operatorPaths.indexOf(path) !== index);
if (duplicates.length) {
  throw new Error(`Menu do Operador contém rota duplicada: ${[...new Set(duplicates)].join(", ")}`);
}

const collisions = operatorPaths.filter((path) => adminOnly.has(path));
if (collisions.length) {
  throw new Error(`Rota(s) do Operador também estão marcadas como Admin-only: ${collisions.join(", ")}`);
}

const requiredOperatorMenuPaths = [
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

const missingFromMenu = requiredOperatorMenuPaths.filter((path) => !operatorPaths.includes(path));
if (missingFromMenu.length) {
  throw new Error(`Fluxo(s) principal(is) ausente(s) do menu do Operador: ${missingFromMenu.join(", ")}`);
}

const academySelfServicePaths = [
  "/teste-rapido",
  "/simulador",
  "/stress-test",
  "/desafio-diario",
];

const missingFromAcademy = academySelfServicePaths.filter(
  (path) => !academySource.includes(`path=\"${path}\"`),
);
if (missingFromAcademy.length) {
  throw new Error(`Fluxo(s) de prática ausente(s) da Academia SEGEMPAT: ${missingFromAcademy.join(", ")}`);
}

const academyAdminCollisions = academySelfServicePaths.filter((path) => adminOnly.has(path));
if (academyAdminCollisions.length) {
  throw new Error(`Fluxo(s) da Academia marcado(s) incorretamente como Admin-only: ${academyAdminCollisions.join(", ")}`);
}

console.log(
  `Contrato de rotas do Operador validado: ${operatorPaths.length} rota(s) principais, ${academySelfServicePaths.length} fluxo(s) de prática na Academia e nenhum conflito com ${adminOnly.size} rota(s) Admin-only.`,
);