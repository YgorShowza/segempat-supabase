import path from "node:path";

const required = ["DATABASE_URL", "SEGEMPAT_SESSION_SECRET"];

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

const databaseUrl = String(process.env["DATABASE_URL"] || "").trim();
let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) throw new Error("invalid protocol");
  if (!parsedDatabaseUrl.hostname || !parsedDatabaseUrl.pathname || parsedDatabaseUrl.pathname === "/") throw new Error("incomplete url");
} catch {
  console.error("[segempat-api] DATABASE_URL deve ser uma connection string PostgreSQL válida");
  process.exit(1);
}

const postgresSsl = booleanValue("POSTGRES_SSL", nodeEnv === "production");
const postgresCaPath = String(process.env["POSTGRES_SSL_CA_PATH"] || "").trim() || null;
if (nodeEnv === "production" && !postgresSsl) {
  console.error("[segempat-api] POSTGRES_SSL deve ser true em produção");
  process.exit(1);
}
if (postgresCaPath && !postgresSsl) {
  console.error("[segempat-api] POSTGRES_SSL_CA_PATH foi informado, mas POSTGRES_SSL=false");
  process.exit(1);
}
if (nodeEnv === "production" && postgresCaPath && !path.isAbsolute(postgresCaPath)) {
  console.error("[segempat-api] POSTGRES_SSL_CA_PATH deve ser absoluto em produção");
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
rejectProductionPlaceholder("DATABASE_URL", databaseUrl, [
  "postgresql://user:change_me@host:5432/database",
  "postgres://user:change_me@host:5432/database",
]);

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
if (!["filesystem", "supabase"].includes(storageDriver)) {
  console.error(`[segempat-api] SEGEMPAT_STORAGE_DRIVER inválido: ${storageDriver || "vazio"}. Use filesystem ou supabase`);
  process.exit(1);
}

const storagePath = String(process.env["SEGEMPAT_STORAGE_PATH"] || "./storage").trim();
const storageBucket = String(process.env["SEGEMPAT_STORAGE_BUCKET"] || "segempat-evidence").trim();
const s3Endpoint = String(process.env["SUPABASE_STORAGE_S3_ENDPOINT"] || "").trim();
const s3Region = String(process.env["SUPABASE_STORAGE_S3_REGION"] || "").trim();
const s3AccessKeyId = String(process.env["SUPABASE_STORAGE_S3_ACCESS_KEY_ID"] || "").trim();
const s3SecretAccessKey = String(process.env["SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY"] || "").trim();

if (storageDriver === "filesystem") {
  if (!storagePath) {
    console.error("[segempat-api] SEGEMPAT_STORAGE_PATH não pode ficar vazio");
    process.exit(1);
  }
  if (nodeEnv === "production" && !path.isAbsolute(storagePath)) {
    console.error("[segempat-api] SEGEMPAT_STORAGE_PATH deve ser absoluto em produção");
    process.exit(1);
  }
} else {
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(storageBucket)) {
    console.error("[segempat-api] SEGEMPAT_STORAGE_BUCKET inválido");
    process.exit(1);
  }
  if (!s3Endpoint || !s3Region || !s3AccessKeyId || !s3SecretAccessKey) {
    console.error("[segempat-api] Storage Supabase exige endpoint, região e credenciais S3 server-side");
    process.exit(1);
  }
  try {
    const parsed = new URL(s3Endpoint);
    if (parsed.protocol !== "https:" || !parsed.hostname || !parsed.pathname.endsWith("/storage/v1/s3")) throw new Error("invalid endpoint");
  } catch {
    console.error("[segempat-api] SUPABASE_STORAGE_S3_ENDPOINT deve ser HTTPS e terminar com /storage/v1/s3");
    process.exit(1);
  }
  rejectProductionPlaceholder("SUPABASE_STORAGE_S3_ACCESS_KEY_ID", s3AccessKeyId, ["CHANGE_ME"]);
  rejectProductionPlaceholder("SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY", s3SecretAccessKey, ["CHANGE_ME"]);
}

export const config = {
  port: positiveInteger("PORT", 8787, { min: 1, max: 65535 }),
  nodeEnv,
  db: {
    url: databaseUrl,
    ssl: postgresSsl,
    caPath: postgresCaPath,
    poolSize: positiveInteger("POSTGRES_POOL_SIZE", 10, { min: 1, max: 100 }),
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
    bucket: storageBucket,
    s3Endpoint,
    s3Region,
    s3AccessKeyId,
    s3SecretAccessKey,
  },
  allowedOrigins: origins,
  timezone: timezoneValue(),
};
