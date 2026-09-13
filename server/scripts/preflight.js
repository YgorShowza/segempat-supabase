import path from "node:path";
import { config } from "../src/config.js";
import { pool, queryOne } from "../src/db.js";
import { storage } from "../src/storage.js";

function fail(message) {
  throw new Error(`[preflight] ${message}`);
}

function parseMajor(version) {
  const match = String(version ?? "").match(/^(\d+)(?:\.|$)/);
  return match ? Number(match[1]) : null;
}

function expectedDatabaseName() {
  const url = new URL(config.db.url);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function expectedRuntimeRole() {
  const value = String(process.env.SEGEMPAT_EXPECTED_DB_ROLE || "").trim();
  if (!value) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    fail("SEGEMPAT_EXPECTED_DB_ROLE contém nome de role PostgreSQL inválido");
  }
  return value;
}

async function checkDatabase() {
  const info = await queryOne(
    `SELECT current_setting('server_version') AS version,
            current_database() AS database_name,
            COALESCE(inet_server_addr()::text, 'local') AS server_hostname,
            inet_server_port() AS server_port,
            current_setting('TimeZone') AS session_time_zone,
            current_setting('server_encoding') AS server_encoding,
            current_schema() AS schema_name,
            current_user AS runtime_role`,
  );
  if (!info) fail("PostgreSQL não retornou informações da conexão");

  const major = parseMajor(info.version);
  if (major === null || major < 15) {
    fail(`PostgreSQL 15+ obrigatório nesta edição; detectado: ${info.version || "desconhecido"}`);
  }

  const expectedDatabase = expectedDatabaseName();
  if (expectedDatabase && String(info.database_name || "") !== expectedDatabase) {
    fail(`database selecionado (${info.database_name || "nenhum"}) difere do DATABASE_URL (${expectedDatabase})`);
  }

  const expectedRole = expectedRuntimeRole();
  if (expectedRole && String(info.runtime_role || "") !== expectedRole) {
    fail(`role PostgreSQL efetiva (${info.runtime_role || "nenhuma"}) difere de SEGEMPAT_EXPECTED_DB_ROLE (${expectedRole})`);
  }

  const sessionTimeZone = String(info.session_time_zone || "").trim().toUpperCase();
  if (!["UTC", "ETC/UTC", "+00:00"].includes(sessionTimeZone)) {
    fail(`sessão PostgreSQL deve operar em UTC; detectado: ${info.session_time_zone || "desconhecido"}`);
  }

  if (String(info.server_encoding || "").trim().toUpperCase() !== "UTF8") {
    fail(`server_encoding deve ser UTF8; detectado: ${info.server_encoding || "desconhecido"}`);
  }
  if (String(info.schema_name || "") !== "public") {
    fail(`schema efetivo esperado é public; detectado: ${info.schema_name || "desconhecido"}`);
  }

  const ssl = await queryOne(
    `SELECT ssl, COALESCE(cipher, '') AS cipher, COALESCE(version, '') AS tls_version
       FROM pg_stat_ssl
      WHERE pid = pg_backend_pid()`,
  );
  const tlsOn = Boolean(ssl?.ssl);
  if (config.db.ssl && !tlsOn) fail("POSTGRES_SSL=true, mas a conexão PostgreSQL não negociou TLS");
  if (config.nodeEnv === "production" && (!config.db.ssl || !tlsOn)) {
    fail("produção exige POSTGRES_SSL=true e conexão PostgreSQL com TLS efetivamente negociado");
  }

  return {
    version: String(info.version),
    database: String(info.database_name),
    server: `${info.server_hostname}:${info.server_port ?? "default"}`,
    role: String(info.runtime_role || ""),
    schema: String(info.schema_name || ""),
    encoding: String(info.server_encoding || ""),
    timezone: String(info.session_time_zone || ""),
    tls: tlsOn ? `on (${ssl?.tls_version || "TLS"}${ssl?.cipher ? `; ${ssl.cipher}` : ""})` : "off",
  };
}

async function checkStorage() {
  await storage.readinessProbe();
  if (config.storage.driver === "supabase") {
    return `supabase:${config.storage.bucket}`;
  }
  return `filesystem:${path.resolve(config.storage.path)}`;
}

async function main() {
  try {
    const database = await checkDatabase();
    const storageStatus = await checkStorage();
    console.log("[preflight] OK");
    console.log(`[preflight] node_env=${config.nodeEnv}`);
    console.log(`[preflight] postgresql=${database.version} database=${database.database} server=${database.server} tls=${database.tls}`);
    console.log(`[preflight] role=${database.role} schema=${database.schema} timezone=${database.timezone} encoding=${database.encoding}`);
    console.log(`[preflight] storage=${storageStatus}`);
    console.log(`[preflight] cors_origins=${config.allowedOrigins.length}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
