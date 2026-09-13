import path from "node:path";

const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "SEGEMPAT_SESSION_SECRET"];

const missing = required.filter((key) => String(process.env[key] ?? "").trim() === "");
if (missing.length > 0) {
  console.error(`[segempat-api] Variáveis de ambiente obrigatórias ausentes ou vazias: ${missing.join(", ")}`);
  process.exit(1);
}

function positiveInteger(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`[segempat-api] ${name} inválido: esperado inteiro entre ${min} e ${max}`);
    process.exit(1);
  }
  return value;
}

function booleanValue(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  console.error(`[segempat-api] ${name} inválido: use true ou false`);
  process.exit(1);
}

function sameSiteValue() {
  const value = String(process.env["SEGEMPAT_SESSION_SAMESITE"] || "lax").trim().toLowerCase();
  if (!["lax", "strict", "none"].includes(value)) {
    console.error("[segempat-api] SEGEMPAT_SESSION_SAMESITE deve ser lax, strict ou none");
    process.exit(1);
  }
  return value;
}

function timezoneValue() {
  const value = String(process.env["SEGEMPAT_TIMEZONE"] || "America/Maceio").trim();
  if (!value) {
    console.error("[segempat-api] SEGEMPAT_TIMEZONE não pode ficar vazio");
    process.exit(1);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
  } catch {
    console.error(`[segempat-api] SEGEMPAT_TIMEZONE inválido: ${value}`);
    process.exit(1);
  }
  return value;
}

const nodeEnv = String(process.env["NODE_ENV"] || "production").trim().toLowerCase();
if (!["production", "development", "test"].includes(nodeEnv)) {
  console.error("[segempat-api] NODE_ENV inválido: use production, development ou test");
  process.exit(1);
}

function rejectProductionPlaceholder(name, value, placeholders) {
  if (nodeEnv !== "production") return;
  const normalized = String(value || "").trim().toLowerCase();
  if (placeholders.some((placeholder) => normalized === placeholder.toLowerCase())) {
    console.error(`[segempat-api] ${name} ainda contém valor de exemplo/placeholder; configure um secret real em produção`);
    process.exit(1);
  }
}

function allowedOrigins() {
  const origins = String(process.env["SEGEMPAT_ALLOWED_ORIGINS"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === "*") {
      console.error("[segempat-api] SEGEMPAT_ALLOWED_ORIGINS não pode usar * quando cookies de sessão estão habilitados");
      process.exit(1);
    }
    try {
      const parsed = new URL(origin);
      if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin.replace(/\/$/, "")) throw new Error("invalid origin");
      if (nodeEnv === "production" && parsed.protocol !== "https:") throw new Error("production requires https");
    } catch {
      console.error(`[segempat-api] Origem CORS inválida${nodeEnv === "production" ? " ou sem HTTPS em produção" : ""}: ${origin}`);
      process.exit(1);
    }
  }
  return origins.map((origin) => origin.replace(/\/$/, ""));
}

const mysqlHost = String(process.env["MYSQL_HOST"]).trim();
const mysqlDatabase = String(process.env["MYSQL_DATABASE"]).trim();
const mysqlUser = String(process.env["MYSQL_USER"]).trim();
const mysqlPassword = String(process.env["MYSQL_PASSWORD"]);
const mysqlSsl = booleanValue("MYSQL_SSL", false);
const mysqlCaPath = String(process.env["MYSQL_SSL_CA_PATH"] || "").trim() || null;

if (nodeEnv === "production" && !mysqlSsl) {
  console.error("[segempat-api] MYSQL_SSL deve ser true em produção");
  process.exit(1);
}
if (mysqlCaPath && !mysqlSsl) {
  console.error("[segempat-api] MYSQL_SSL_CA_PATH foi informado, mas MYSQL_SSL=false");
  process.exit(1);
}
if (nodeEnv === "production" && mysqlCaPath && !path.isAbsolute(mysqlCaPath)) {
  console.error("[segempat-api] MYSQL_SSL_CA_PATH deve ser absoluto em produção");
  process.exit(1);
}

const sessionSecret = String(process.env["SEGEMPAT_SESSION_SECRET"] || "");
if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
  console.error("[segempat-api] SEGEMPAT_SESSION_SECRET deve possuir pelo menos 32 bytes");
  process.exit(1);
}
rejectProductionPlaceholder("SEGEMPAT_SESSION_SECRET", sessionSecret, [
  "CHANGE_ME_TO_A_LONG_RANDOM_SECRET_32_BYTES_MINIMUM",
  "CHANGE_ME",
]);
rejectProductionPlaceholder("MYSQL_PASSWORD", mysqlPassword, ["CHANGE_ME"]);

const sessionCookieName = String(process.env["SEGEMPAT_SESSION_COOKIE"] || "segempat_session").trim();
if (!/^[A-Za-z0-9_.-]{1,80}$/.test(sessionCookieName)) {
  console.error("[segempat-api] SEGEMPAT_SESSION_COOKIE inválido");
  process.exit(1);
}

const secureSession = booleanValue("SEGEMPAT_SESSION_SECURE", true);
const sessionSameSite = sameSiteValue();
if (sessionSameSite === "none" && !secureSession) {
  console.error("[segempat-api] SameSite=None exige SEGEMPAT_SESSION_SECURE=true");
  process.exit(1);
}
if (nodeEnv === "production" && !secureSession) {
  console.error("[segempat-api] SEGEMPAT_SESSION_SECURE deve ser true em produção");
  process.exit(1);
}

const origins = allowedOrigins();
if (nodeEnv === "production" && origins.length === 0) {
  console.error("[segempat-api] SEGEMPAT_ALLOWED_ORIGINS é obrigatório em produção");
  process.exit(1);
}

const storageDriver = String(process.env["SEGEMPAT_STORAGE_DRIVER"] || "filesystem").trim().toLowerCase();
if (storageDriver !== "filesystem") {
  console.error(`[segempat-api] SEGEMPAT_STORAGE_DRIVER não suportado: ${storageDriver || "vazio"}. Use filesystem`);
  process.exit(1);
}

const storagePath = String(process.env["SEGEMPAT_STORAGE_PATH"] || "./storage").trim();
if (!storagePath) {
  console.error("[segempat-api] SEGEMPAT_STORAGE_PATH não pode ficar vazio");
  process.exit(1);
}
if (nodeEnv === "production" && !path.isAbsolute(storagePath)) {
  console.error("[segempat-api] SEGEMPAT_STORAGE_PATH deve ser absoluto em produção");
  process.exit(1);
}

export const config = {
  port: positiveInteger("PORT", 8787, { min: 1, max: 65535 }),
  nodeEnv,
  db: {
    host: mysqlHost,
    port: positiveInteger("MYSQL_PORT", 3306, { min: 1, max: 65535 }),
    database: mysqlDatabase,
    user: mysqlUser,
    password: mysqlPassword,
    ssl: mysqlSsl,
    caPath: mysqlCaPath,
    poolSize: positiveInteger("MYSQL_POOL_SIZE", 10, { min: 1, max: 100 }),
  },
  session: {
    secret: sessionSecret,
    cookieName: sessionCookieName,
    ttlHours: positiveInteger("SEGEMPAT_SESSION_TTL_HOURS", 12, { min: 1, max: 720 }),
    sameSite: sessionSameSite,
    secure: secureSession,
  },
  storage: {
    driver: storageDriver,
    path: storagePath,
  },
  // Origens do frontend autorizadas a enviar cookie de sessão.
  allowedOrigins: origins,
  timezone: timezoneValue(),
};
