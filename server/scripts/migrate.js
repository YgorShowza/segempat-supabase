import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../database/mysql");
const MIGRATION_LOCK_NAME = "segempat:migrations";
const LOCKED_VALIDATORS = [
  "check-migration-history-table.js",
  "check-existing-baseline-storage.js",
  "check-existing-baseline-columns.js",
  "check-existing-baseline-column-attributes.js",
  "check-existing-baseline-primary-keys.js",
  "check-existing-baseline-secondary-indexes.js",
  "check-existing-baseline-generated-columns.js",
  "check-existing-baseline-check-constraints.js",
  "check-existing-baseline-triggers.js",
  "validate-existing-baseline.js",
  "check-existing-baseline-orphans.js",
];
const BASELINE_TABLES = [
  "app_users",
  "employees",
  "profiles",
  "user_roles",
  "registration_activation_codes",
  "exams",
  "exam_attempts",
  "certificates",
  "cronograma_entries",
  "cronograma_recurring_models",
  "cronograma_suspensions",
  "knowledge_items",
  "question_bank",
  "training_modules",
  "training_activity_attempts",
  "training_schedules",
  "practical_eval_templates",
  "practical_evaluations",
  "occurrences",
  "audit_logs",
];

function migrationVersion(fileName) {
  const match = /^(\d{3,})_.+\.sql$/i.exec(fileName);
  return match ? match[1] : null;
}

function numericVersion(version) {
  return BigInt(version);
}

function checksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function runLockedValidators() {
  for (const fileName of LOCKED_VALIDATORS) {
    const scriptPath = path.join(here, fileName);
    console.log(`[segempat-api] validação MySQL sob lock: ${fileName}`);
    try {
      execFileSync(process.execPath, [scriptPath], {
        cwd: path.resolve(here, ".."),
        env: process.env,
        stdio: "inherit",
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? ` (exit ${error.status})` : "";
      throw new Error(`Validação MySQL protegida por lock falhou em ${fileName}${status}`);
    }
  }
}

async function migrationSslOptions() {
  if (!config.db.ssl) return undefined;
  if (!config.db.caPath) return { rejectUnauthorized: true };
  try {
    const ca = await fs.readFile(config.db.caPath, "utf8");
    return { ca, rejectUnauthorized: true };
  } catch (error) {
    throw new Error(`Certificado CA do MySQL não pôde ser lido em ${config.db.caPath}: ${error?.message || error}`);
  }
}

async function initializeMigrationSession(connection) {
  await connection.query("SET NAMES utf8mb4");
  await connection.query(`
    SET SESSION
      time_zone = '+00:00',
      foreign_key_checks = 1,
      sql_mode = CASE
        WHEN FIND_IN_SET('STRICT_TRANS_TABLES', @@SESSION.sql_mode) > 0
          OR FIND_IN_SET('STRICT_ALL_TABLES', @@SESSION.sql_mode) > 0
        THEN @@SESSION.sql_mode
        ELSE CONCAT_WS(',', NULLIF(@@SESSION.sql_mode, ''), 'STRICT_TRANS_TABLES')
      END
  `);

  const [sessionRows] = await connection.query(`
    SELECT @@SESSION.time_zone AS time_zone,
           @@SESSION.foreign_key_checks AS foreign_key_checks,
           @@SESSION.sql_mode AS sql_mode,
           @@SESSION.character_set_client AS character_set_client,
           @@SESSION.character_set_connection AS character_set_connection,
           @@SESSION.character_set_results AS character_set_results
  `);
  const session = sessionRows?.[0] ?? {};
  const sqlModes = String(session.sql_mode || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (String(session.time_zone || "").trim() !== "+00:00") {
    throw new Error(`Sessão de migration MySQL não permaneceu em UTC: ${session.time_zone || "desconhecido"}`);
  }
  if (Number(session.foreign_key_checks) !== 1) {
    throw new Error("Sessão de migration MySQL está com FOREIGN_KEY_CHECKS desabilitado");
  }
  if (!sqlModes.includes("STRICT_TRANS_TABLES") && !sqlModes.includes("STRICT_ALL_TABLES")) {
    throw new Error("Sessão de migration MySQL não está em modo SQL estrito");
  }

  const charsets = {
    client: session.character_set_client,
    connection: session.character_set_connection,
    results: session.character_set_results,
  };
  for (const [name, value] of Object.entries(charsets)) {
    if (String(value || "").toLowerCase() !== "utf8mb4") {
      throw new Error(`Sessão de migration MySQL exige character_set_${name}=utf8mb4; detectado: ${value || "desconhecido"}`);
    }
  }

  const [sslRows] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const sslCipher = String(sslRows?.[0]?.Value ?? sslRows?.[0]?.value ?? "").trim();
  if (config.db.ssl && !sslCipher) {
    throw new Error("MYSQL_SSL=true, mas o runner de migrations não negociou TLS");
  }
  if (config.nodeEnv === "production" && !sslCipher) {
    throw new Error("Migrations de produção exigem conexão MySQL com TLS efetivamente negociado");
  }

  return sslCipher;
}

async function acquireMigrationLock(connection) {
  const [rows] = await connection.execute(`SELECT GET_LOCK(?, 30) AS acquired`, [MIGRATION_LOCK_NAME]);
  if (Number(rows?.[0]?.acquired) !== 1) {
    throw new Error("Não foi possível obter o lock exclusivo de migrations em até 30 segundos. Verifique se outro deploy está migrando o banco.");
  }
}

async function releaseMigrationLock(connection) {
  const [rows] = await connection.execute(`SELECT RELEASE_LOCK(?) AS released`, [MIGRATION_LOCK_NAME]);
  const released = rows?.[0]?.released;
  if (released !== null && Number(released) !== 1) {
    console.warn("[segempat-api] aviso: lock de migrations não foi liberado explicitamente");
  }
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(32) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (version),
      UNIQUE KEY schema_migrations_file_name_key (file_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function existingTables(connection, tableNames) {
  if (!tableNames.length) return new Set();
  const placeholders = tableNames.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${placeholders})`,
    tableNames,
  );
  return new Set(rows.map((row) => String(row.table_name)));
}

async function detectPreRunnerBaseline(connection) {
  const found = await existingTables(connection, BASELINE_TABLES);
  if (found.size === 0) return { state: "empty", missing: BASELINE_TABLES };
  const missing = BASELINE_TABLES.filter((table) => !found.has(table));
  if (missing.length) return { state: "partial", missing };
  return { state: "complete", missing: [] };
}

async function loadMigrationFiles() {
  const parsed = (await fs.readdir(migrationsDir))
    .map((fileName) => ({ fileName, version: migrationVersion(fileName) }))
    .filter((entry) => entry.version)
    .map((entry) => ({ ...entry, numeric: numericVersion(entry.version) }))
    .sort((a, b) => a.numeric < b.numeric ? -1 : a.numeric > b.numeric ? 1 : a.fileName.localeCompare(b.fileName, "en"));

  const rawVersions = new Set();
  const numericVersions = new Map();
  const migrations = [];
  for (const { fileName, version, numeric } of parsed) {
    if (rawVersions.has(version)) throw new Error(`Versão de migration duplicada: ${version}`);
    rawVersions.add(version);

    const numericKey = numeric.toString();
    const existingNumeric = numericVersions.get(numericKey);
    if (existingNumeric) {
      throw new Error(
        `Versões de migration numericamente duplicadas: ${existingNumeric.version} (${existingNumeric.fileName}) e ${version} (${fileName})`,
      );
    }
    numericVersions.set(numericKey, { version, fileName });

    const filePath = path.join(migrationsDir, fileName);
    const sql = await fs.readFile(filePath, "utf8");
    migrations.push({ version, numeric, fileName, sql, checksum: checksum(sql) });
  }
  if (!migrations.length) throw new Error("Nenhuma migration MySQL encontrada em database/mysql");
  if (migrations[0].numeric !== 1n) throw new Error(`A primeira migration MySQL deve ser a versão 001; encontrada ${migrations[0].version}`);
  return migrations;
}

function validateAppliedHistory(migrations, applied) {
  if (applied.size === 0) return;

  const byNumeric = new Map(migrations.map((migration) => [migration.numeric.toString(), migration]));
  let highestAppliedIndex = -1;

  for (const [version, row] of applied) {
    if (!/^\d+$/.test(version)) {
      throw new Error(`Histórico de migrations contém versão inválida: ${version}`);
    }

    const numericKey = numericVersion(version).toString();
    const migration = byNumeric.get(numericKey);
    if (!migration) {
      throw new Error(`Histórico de migrations contém versão ${version} que não existe no código atual`);
    }
    if (migration.version !== version) {
      throw new Error(
        `Histórico de migrations usa versão ${version}, mas o arquivo atual equivalente é ${migration.version} (${migration.fileName})`,
      );
    }
    if (row.file_name !== migration.fileName) {
      throw new Error(`Migration ${version} já aplicada com outro nome: ${row.file_name}`);
    }
    if (row.checksum_sha256 !== migration.checksum) {
      throw new Error(`Migration ${migration.fileName} foi alterada após ser aplicada. Crie uma nova migration em vez de editar a anterior.`);
    }

    const index = migrations.findIndex((item) => item.version === version);
    if (index > highestAppliedIndex) highestAppliedIndex = index;
  }

  for (let index = 0; index <= highestAppliedIndex; index += 1) {
    const migration = migrations[index];
    if (!applied.has(migration.version)) {
      throw new Error(
        `Histórico de migrations está fora de ordem: ${migration.fileName} está ausente, mas existe migration posterior registrada. ` +
        "Corrija schema_migrations antes de continuar.",
      );
    }
  }
}

async function main() {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: await migrationSslOptions(),
    multipleStatements: true,
    charset: "utf8mb4",
    timezone: "Z",
  });

  let lockAcquired = false;
  try {
    const sslCipher = await initializeMigrationSession(connection);
    console.log(
      `[segempat-api] sessão de migration pronta; tls=${sslCipher || "off"}; timezone=UTC; foreign_keys=on; strict_sql=on`,
    );
    await acquireMigrationLock(connection);
    lockAcquired = true;
    await ensureMigrationTable(connection);
    runLockedValidators();

    const migrations = await loadMigrationFiles();
    const [appliedRows] = await connection.query(
      `SELECT version, file_name, checksum_sha256 FROM schema_migrations ORDER BY CAST(version AS UNSIGNED) ASC, version ASC`,
    );
    const applied = new Map(appliedRows.map((row) => [String(row.version), row]));

    // Compatibilidade com instalações que receberam o 001_schema.sql antes do runner versionado.
    // As validações estruturais são executadas enquanto o lock de migrations está mantido, evitando
    // que dois runners concorrentes validem e registrem o baseline em estados diferentes.
    if (applied.size === 0 && migrations[0]?.numeric === 1n) {
      const baselineState = await detectPreRunnerBaseline(connection);
      if (baselineState.state === "partial") {
        throw new Error(
          `Banco MySQL aparenta ter um baseline 001 incompleto. Tabelas ausentes: ${baselineState.missing.join(", ")}. ` +
          "Não é seguro registrar nem reaplicar automaticamente o 001; corrija o schema antes de continuar.",
        );
      }
      if (baselineState.state === "complete") {
        const baseline = migrations[0];
        await connection.execute(
          `INSERT INTO schema_migrations (version, file_name, checksum_sha256, applied_at)
           VALUES (?, ?, ?, UTC_TIMESTAMP(3))`,
          [baseline.version, baseline.fileName, baseline.checksum],
        );
        applied.set(baseline.version, {
          version: baseline.version,
          file_name: baseline.fileName,
          checksum_sha256: baseline.checksum,
        });
        console.log(`[segempat-api] baseline existente validado sob lock e registrado: ${baseline.fileName}`);
      }
    }

    validateAppliedHistory(migrations, applied);

    let appliedCount = 0;
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;

      console.log(`[segempat-api] aplicando ${migration.fileName}`);
      await connection.query(migration.sql);
      await connection.execute(
        `INSERT INTO schema_migrations (version, file_name, checksum_sha256, applied_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3))`,
        [migration.version, migration.fileName, migration.checksum],
      );
      applied.set(migration.version, {
        version: migration.version,
        file_name: migration.fileName,
        checksum_sha256: migration.checksum,
      });
      appliedCount += 1;
    }

    if (appliedCount === 0) console.log("[segempat-api] schema MySQL já está atualizado");
    else console.log(`[segempat-api] ${appliedCount} migration(s) MySQL aplicada(s) com sucesso`);
  } finally {
    if (lockAcquired) await releaseMigrationLock(connection).catch((error) => {
      console.warn(`[segempat-api] aviso ao liberar lock de migrations: ${error?.message || error}`);
    });
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] falha ao aplicar migrations", error?.message || error);
  process.exit(1);
});
