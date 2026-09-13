import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../src/config.js";
import { pool, query, queryOne } from "../src/db.js";

function fail(message) {
  throw new Error(`[preflight] ${message}`);
}

function parseMajor(version) {
  const match = String(version ?? "").match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

async function checkDatabase() {
  const info = await queryOne(
    `SELECT VERSION() AS version,
            DATABASE() AS database_name,
            @@hostname AS server_hostname,
            @@port AS server_port,
            @@session.time_zone AS session_time_zone,
            @@session.sql_mode AS session_sql_mode,
            @@session.default_storage_engine AS default_storage_engine,
            @@session.foreign_key_checks AS foreign_key_checks,
            @@session.character_set_client AS character_set_client,
            @@session.character_set_connection AS character_set_connection,
            @@session.character_set_results AS character_set_results`,
  );
  if (!info) fail("MySQL não retornou informações da conexão");

  const major = parseMajor(info.version);
  if (major === null || major < 8) fail(`MySQL 8+ obrigatório; detectado: ${info.version || "desconhecido"}`);
  if (String(info.database_name || "") !== String(config.db.database)) {
    fail(`database selecionado (${info.database_name || "nenhum"}) difere de MYSQL_DATABASE (${config.db.database})`);
  }

  const sessionTimeZone = String(info.session_time_zone || "").trim().toUpperCase();
  if (!["+00:00", "UTC"].includes(sessionTimeZone)) {
    fail(`sessão MySQL deve operar em UTC; detectado: ${info.session_time_zone || "desconhecido"}`);
  }

  const sqlModes = String(info.session_sql_mode || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!sqlModes.includes("STRICT_TRANS_TABLES") && !sqlModes.includes("STRICT_ALL_TABLES")) {
    fail("sessão MySQL deve usar modo SQL estrito (STRICT_TRANS_TABLES ou STRICT_ALL_TABLES)");
  }

  if (String(info.default_storage_engine || "").trim().toUpperCase() !== "INNODB") {
    fail(`default_storage_engine deve ser InnoDB; detectado: ${info.default_storage_engine || "desconhecido"}`);
  }
  if (Number(info.foreign_key_checks) !== 1) {
    fail(`FOREIGN_KEY_CHECKS deve estar habilitado; detectado: ${info.foreign_key_checks ?? "desconhecido"}`);
  }

  const connectionCharsets = {
    client: String(info.character_set_client || "").toLowerCase(),
    connection: String(info.character_set_connection || "").toLowerCase(),
    results: String(info.character_set_results || "").toLowerCase(),
  };
  for (const [name, value] of Object.entries(connectionCharsets)) {
    if (value !== "utf8mb4") fail(`character_set_${name} deve ser utf8mb4; detectado: ${value || "desconhecido"}`);
  }

  const schema = await queryOne(
    `SELECT default_character_set_name AS charset_name,
            default_collation_name AS collation_name
       FROM information_schema.schemata
      WHERE schema_name = DATABASE()
      LIMIT 1`,
  );
  if (!schema) fail("não foi possível ler os defaults do database selecionado");
  if (String(schema.charset_name || "").toLowerCase() !== "utf8mb4") {
    fail(`database deve usar utf8mb4; detectado: ${schema.charset_name || "desconhecido"}`);
  }

  const sslRows = await query("SHOW STATUS LIKE 'Ssl_cipher'");
  const sslCipher = String(sslRows?.[0]?.Value ?? sslRows?.[0]?.value ?? "").trim();
  if (config.db.ssl && !sslCipher) fail("MYSQL_SSL=true, mas a conexão MySQL não negociou TLS");
  if (config.nodeEnv === "production" && (!config.db.ssl || !sslCipher)) {
    fail("produção exige MYSQL_SSL=true e conexão MySQL com TLS efetivamente negociado");
  }

  return {
    version: String(info.version),
    database: String(info.database_name),
    server: `${info.server_hostname}:${info.server_port}`,
    tls: sslCipher ? `on (${sslCipher})` : "off",
    timezone: String(info.session_time_zone),
    sqlMode: sqlModes.join(","),
    engine: String(info.default_storage_engine),
    foreignKeyChecks: Number(info.foreign_key_checks),
    connectionCharsets,
    charset: String(schema.charset_name),
    collation: String(schema.collation_name || ""),
  };
}

async function checkStorage() {
  const root = path.resolve(config.storage.path);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) fail(`SEGEMPAT_STORAGE_PATH não é diretório: ${root}`);

  const token = crypto.randomBytes(16).toString("hex");
  const probePath = path.join(root, `.segempat-preflight-${process.pid}-${Date.now()}`);
  try {
    await fs.writeFile(probePath, token, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const readBack = await fs.readFile(probePath, "utf8");
    if (readBack !== token) fail("storage escreveu conteúdo diferente do esperado");
  } finally {
    await fs.unlink(probePath).catch(() => {});
  }
  return root;
}

async function main() {
  try {
    const database = await checkDatabase();
    const storage = await checkStorage();
    console.log("[preflight] OK");
    console.log(`[preflight] node_env=${config.nodeEnv}`);
    console.log(`[preflight] mysql=${database.version} database=${database.database} server=${database.server} tls=${database.tls}`);
    console.log(`[preflight] mysql_timezone=${database.timezone} charset=${database.charset} collation=${database.collation}`);
    console.log(`[preflight] mysql_engine=${database.engine} foreign_key_checks=${database.foreignKeyChecks}`);
    console.log(`[preflight] mysql_connection_charset=${database.connectionCharsets.client}/${database.connectionCharsets.connection}/${database.connectionCharsets.results}`);
    console.log(`[preflight] mysql_sql_mode=${database.sqlMode}`);
    console.log(`[preflight] storage=${storage}`);
    console.log(`[preflight] cors_origins=${config.allowedOrigins.length}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
