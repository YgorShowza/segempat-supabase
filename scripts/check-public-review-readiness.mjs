import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const auditedHistoricalSensitiveBlobs = new Map([
  // Antigo .env removido antes desta edição. O blob conhecido foi auditado e
  // continha apenas configuração cliente histórica; qualquer outro .env no
  // histórico continua bloqueando a revisão pública.
  ["9a2788223df6456976423af36eae73443345b5aa", ".env"],
  // Exemplo MySQL removido da edição Supabase. O blob possuía somente valores
  // vazios/de exemplo e é aceito exclusivamente por SHA + caminho históricos.
  ["b0b1c2415bb5197d2857523ee741437a0bd05504", ".env.mysql.example"],
]);
const auditedHistoricalHits = [];

function fail(message) {
  failures.push(message);
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
}

function normalize(file) {
  return file.replaceAll("\\", "/");
}

function isForbiddenSensitivePath(file) {
  const value = normalize(file);
  const base = path.posix.basename(value).toLowerCase();

  const allowedExamples = new Set([".env.example", ".env.supabase.example"]);
  if (/\.env(?:\.|$)/i.test(base) && !allowedExamples.has(base)) return true;
  if (/\.(?:pem|key|p12|pfx|jks|keystore|der)$/i.test(base)) return true;
  if (["id_rsa", "id_ed25519", "pgpass", ".pgpass"].includes(base)) return true;
  return false;
}

function looksBinary(buffer) {
  const limit = Math.min(buffer.length, 8192);
  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

const secretPatterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, "chave privada"],
  [/\bghp_[A-Za-z0-9]{30,}\b/g, "GitHub personal access token clássico"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, "GitHub fine-grained personal access token"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "AWS access key"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, "Google API key"],
  [/\bsb_secret_[A-Za-z0-9_-]{20,}\b/g, "Supabase secret key"],
  [/\bservice_role\b\s*[:=]\s*[A-Za-z0-9._-]{20,}/gi, "Supabase service-role credential"],
];

function scanText(text, label) {
  for (const [pattern, description] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) fail(`${label}: possível ${description}`);
  }
}

let shallow = "unknown";
try {
  shallow = git(["rev-parse", "--is-shallow-repository"]).trim();
} catch {
  fail("não foi possível determinar se o clone Git é completo");
}
if (shallow !== "false") {
  fail("a auditoria pública exige clone Git completo (fetch-depth: 0); clone shallow não é aceito");
}

let trackedFiles = [];
try {
  trackedFiles = git(["ls-files", "-z"]).split("\0").filter(Boolean);
} catch {
  fail("não foi possível listar os arquivos versionados");
}

for (const file of trackedFiles) {
  if (isForbiddenSensitivePath(file)) fail(`arquivo sensível versionado no HEAD: ${file}`);

  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
  const data = fs.readFileSync(fullPath);
  if (looksBinary(data)) continue;
  scanText(data.toString("utf8"), `HEAD ${file}`);
}

try {
  const historyObjects = git(["rev-list", "--objects", "--all"]);
  for (const line of historyObjects.split("\n")) {
    const separator = line.indexOf(" ");
    if (separator < 0) continue;
    const objectSha = line.slice(0, separator).trim();
    const historicalPath = line.slice(separator + 1).trim();
    if (!historicalPath || !isForbiddenSensitivePath(historicalPath)) continue;

    const auditedPath = auditedHistoricalSensitiveBlobs.get(objectSha);
    if (auditedPath === historicalPath) {
      auditedHistoricalHits.push(`${historicalPath}@${objectSha.slice(0, 12)}`);
      continue;
    }
    fail(`arquivo sensível encontrado no histórico Git: ${historicalPath}`);
  }
} catch {
  fail("não foi possível examinar os nomes de arquivos do histórico Git");
}

try {
  const historyPatch = git([
    "log",
    "--all",
    "--no-ext-diff",
    "--no-color",
    "--format=",
    "--patch",
    "--",
    ".",
  ]);
  scanText(historyPatch, "histórico Git");
} catch (error) {
  fail(`não foi possível examinar o conteúdo do histórico Git: ${error?.message || "erro desconhecido"}`);
}

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
for (const expected of [".env", ".env.*", "*.pem", "*.key", "*.crt", ".dev.vars"]) {
  if (!gitignore.includes(expected)) fail(`.gitignore não protege ${expected}`);
}

const frontendExamplePath = path.join(root, ".env.supabase.example");
if (!fs.existsSync(frontendExamplePath)) {
  fail(".env.supabase.example está ausente");
} else {
  const frontendExample = fs.readFileSync(frontendExamplePath, "utf8");
  if (!/VITE_SEGEMPAT_API_URL="https:\/\//.test(frontendExample)) {
    fail(".env.supabase.example deve configurar VITE_SEGEMPAT_API_URL com HTTPS");
  }
  if (!/VITE_SEGEMPAT_REQUIRE_API="true"/.test(frontendExample)) {
    fail(".env.supabase.example deve exigir a API SEGEMPAT");
  }
  for (const forbidden of ["DATABASE_URL=", "POSTGRES_PASSWORD=", "SEGEMPAT_SESSION_SECRET=", "SUPABASE_SERVICE_ROLE", "SUPABASE_SECRET_KEY"]) {
    if (frontendExample.includes(forbidden)) fail(`.env.supabase.example não pode expor ${forbidden.replace("=", "")}`);
  }
}

const serverExample = fs.readFileSync(path.join(root, "server/.env.example"), "utf8");
if (!/DATABASE_URL=postgresql:\/\/user:CHANGE_ME@host:5432\/database/.test(serverExample)) {
  fail("server/.env.example deve usar placeholder seguro para DATABASE_URL PostgreSQL");
}
if (!/POSTGRES_SSL=true/.test(serverExample)) fail("server/.env.example deve exigir TLS PostgreSQL em produção");
if (!/SEGEMPAT_SESSION_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET_32_BYTES_MINIMUM/.test(serverExample)) {
  fail("server/.env.example deve usar placeholder para SEGEMPAT_SESSION_SECRET");
}

for (const required of ["SECURITY.md", "TI_REVIEW.md", ".github/CODEOWNERS", "SUPABASE_EDITION.md"]) {
  if (!trackedFiles.includes(required)) fail(`arquivo obrigatório para revisão pública ausente: ${required}`);
}

if (failures.length) {
  console.error("SEGEMPAT public review readiness: FALHOU");
  for (const item of [...new Set(failures)]) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`SEGEMPAT public review readiness: OK (${trackedFiles.length} arquivos versionados; histórico Git verificado).`);
if (auditedHistoricalHits.length) {
  console.log(`Histórico sensível conhecido e auditado por SHA exato: ${auditedHistoricalHits.join(", ")}.`);
}
console.log("Observação: este gate complementa, mas não substitui, secret scanning e política de segurança do ambiente.");
