import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[corporate-privacy-governance] ausente: ${label}`);
    process.exitCode = 1;
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    console.error(`[corporate-privacy-governance] proibido: ${label}`);
    process.exitCode = 1;
  }
}

const robots = read("public/robots.txt");
const root = read("src/routes/__root.tsx");
const readme = read("README.md");
const security = read("SECURITY_AUDIT.md");
const lgpd = read("LGPD_GOVERNANCE.md");

requireText(robots, "User-agent: *", "robots.txt cobre todos os crawlers");
requireText(robots, "Disallow: /", "robots.txt bloqueia indexação do sistema corporativo");
forbidText(robots, "Allow: /", "robots.txt não deve autorizar indexação pública");

requireText(root, 'name: "robots", content: "noindex, nofollow, noarchive, nosnippet, noimageindex"', "meta robots noindex");
requireText(root, 'name: "googlebot", content: "noindex, nofollow, noarchive, nosnippet, noimageindex"', "meta googlebot noindex");

for (const [name, source] of [["README", readme], ["SECURITY_AUDIT", security], ["LGPD_GOVERNANCE", lgpd]]) {
  requireText(source, "Administrador Master", `${name} documenta Administrador Master`);
  requireText(source, "Administrador", `${name} documenta Administrador`);
  requireText(source, "Inspetor", `${name} documenta Inspetor`);
  requireText(source, "Operador", `${name} documenta Operador`);
}

requireText(readme, "access.permissions.manage", "README documenta permissão exclusiva do Master");
requireText(readme, "010_granular_access_control.sql", "README documenta migration 010");
requireText(readme, "Disallow: /", "README documenta bloqueio de indexação");

requireText(security, "último Master realmente utilizável", "auditoria documenta proteção do último Master utilizável");
requireText(security, "Leituras gerenciais", "auditoria documenta redaction/coerência de leitura");
requireText(security, "recuperação administrativa", "auditoria documenta hierarquia de recuperação de senha");
requireText(security, "Disallow: /", "auditoria documenta proteção contra indexação");

requireText(lgpd, "perfil funcional", "LGPD diferencia perfil funcional de nível da aplicação");
requireText(lgpd, "nível de autorização da aplicação", "LGPD diferencia autorização granular");
requireText(lgpd, "recuperação somente pela TI", "LGPD documenta proteção de senha do Master");
requireText(lgpd, "não substituem controle de acesso", "LGPD deixa claro que noindex não é autenticação");

if (process.exitCode) process.exit(process.exitCode);
console.log("SEGEMPAT corporate privacy governance contract: OK");
