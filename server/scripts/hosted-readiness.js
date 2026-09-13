import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../supabase/migrations");

function fail(message) {
  throw new Error(`[hosted-readiness] ${message}`);
}

function exactHttpsOrigin(name, value) {
  const text = String(value || "").trim().replace(/\/$/, "");
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail(`${name} deve ser uma URL HTTPS válida`);
  }
  if (parsed.protocol !== "https:" || parsed.origin !== text) {
    fail(`${name} deve ser uma origem HTTPS exata, sem path, query ou hash`);
  }
  return text;
}

function apiBase(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail("SEGEMPAT_HOSTED_API_URL deve ser uma URL HTTPS válida");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail("SEGEMPAT_HOSTED_API_URL deve usar HTTPS e não pode conter credenciais, query ou hash");
  }
  return text;
}

async function latestMigrationFile() {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => /^\d{3,}_.+\.sql$/i.test(file))
    .sort((a, b) => {
      const left = BigInt(a.match(/^(\d+)/)[1]);
      const right = BigInt(b.match(/^(\d+)/)[1]);
      return left < right ? -1 : left > right ? 1 : a.localeCompare(b, "en");
    });
  if (!files.length) fail("nenhuma migration versionada encontrada");
  return files.at(-1);
}

async function requestJson(url, options = {}, timeoutMs = 45_000) {
  const response = await fetch(url, {
    redirect: "error",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    fail(`${url} não retornou JSON válido (HTTP ${response.status})`);
  }
  return { response, body };
}

function expectStatus(result, expected, label) {
  if (result.response.status !== expected) {
    fail(`${label}: esperado HTTP ${expected}, recebido ${result.response.status}`);
  }
}

const apiUrl = apiBase(process.env.SEGEMPAT_HOSTED_API_URL);
const trustedOrigin = exactHttpsOrigin("SEGEMPAT_HOSTED_TRUSTED_ORIGIN", process.env.SEGEMPAT_HOSTED_TRUSTED_ORIGIN);
const latestMigration = await latestMigrationFile();

console.log(`[hosted-readiness] alvo=${apiUrl}`);
console.log(`[hosted-readiness] migration_esperada=${latestMigration}`);

const health = await requestJson(`${apiUrl}/health`, {}, 90_000);
expectStatus(health, 200, "/health");
if (health.body?.ok !== true || health.body?.service !== "segempat-api") {
  fail("/health respondeu payload inesperado");
}
console.log("[hosted-readiness] /health OK");

const ready = await requestJson(`${apiUrl}/health/ready`, {}, 60_000);
expectStatus(ready, 200, "/health/ready");
if (
  ready.body?.ok !== true ||
  ready.body?.database !== "connected" ||
  ready.body?.tls !== "ready" ||
  ready.body?.schema !== "ready" ||
  ready.body?.storage !== "ready"
) {
  fail(`/health/ready não confirmou banco/TLS/schema/storage: ${JSON.stringify(ready.body)}`);
}
if (ready.body?.migration?.file_name !== latestMigration) {
  fail(`/health/ready está em migration diferente do código: ${ready.body?.migration?.file_name || "nenhuma"}`);
}
console.log("[hosted-readiness] banco, TLS, schema, storage e migrations OK");

const probeMatricula = `hosted-probe-${Date.now()}`;
const loginBody = JSON.stringify({ matricula: probeMatricula, password: "invalid-probe-password" });

const missingOrigin = await requestJson(`${apiUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: loginBody,
});
expectStatus(missingOrigin, 403, "escrita sem Origin");
if (missingOrigin.body?.code !== "ORIGIN_REQUIRED") {
  fail(`escrita sem Origin não foi bloqueada pelo gate esperado: ${missingOrigin.body?.code || "sem código"}`);
}
console.log("[hosted-readiness] escrita sem Origin bloqueada");

const invalidOrigin = await requestJson(`${apiUrl}/api/auth/login`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://invalid.segempat.example.invalid",
  },
  body: loginBody,
});
expectStatus(invalidOrigin, 403, "escrita com Origin não confiável");
if (!new Set(["CORS_FORBIDDEN", "ORIGIN_FORBIDDEN"]).has(invalidOrigin.body?.code)) {
  fail(`Origin não confiável não foi bloqueada pelo gate esperado: ${invalidOrigin.body?.code || "sem código"}`);
}
console.log("[hosted-readiness] Origin não confiável bloqueada");

const trusted = await requestJson(`${apiUrl}/api/auth/login`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: trustedOrigin,
  },
  body: loginBody,
});
expectStatus(trusted, 401, "login-probe com Origin confiável");
if (trusted.body?.code !== "UNAUTHORIZED") {
  fail(`Origin confiável não alcançou autenticação como esperado: ${trusted.body?.code || "sem código"}`);
}
const allowOrigin = trusted.response.headers.get("access-control-allow-origin");
if (allowOrigin !== trustedOrigin) {
  fail(`CORS não devolveu a origem confiável esperada: ${allowOrigin || "ausente"}`);
}
console.log("[hosted-readiness] Origin confiável e CORS OK");
console.log("[hosted-readiness] GATE HOSPEDADO APROVADO");
