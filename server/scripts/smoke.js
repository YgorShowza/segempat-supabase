import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { healthcheck, query, queryOne, pool } from "../src/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../database/mysql");

const REQUIRED_TABLES = [
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
  "schema_migrations",
];

const CRITICAL_FOREIGN_KEYS = [
  "profiles_user_fk",
  "profiles_employee_matricula_fk",
  "user_roles_user_fk",
  "registration_activation_employee_fk",
  "registration_activation_creator_fk",
  "exams_creator_fk",
  "exam_attempts_exam_fk",
  "exam_attempts_user_fk",
  "certificates_attempt_fk",
  "certificates_exam_fk",
  "certificates_user_fk",
  "cronograma_entries_employee_fk",
  "cronograma_entries_exam_fk",
  "cronograma_entries_creator_fk",
  "cronograma_recurring_creator_fk",
  "cronograma_suspensions_employee_fk",
  "cronograma_suspensions_creator_fk",
  "knowledge_items_creator_fk",
  "question_bank_creator_fk",
  "training_modules_creator_fk",
  "training_activity_user_fk",
  "training_activity_employee_fk",
  "training_schedules_employee_fk",
  "training_schedules_creator_fk",
  "practical_eval_templates_creator_fk",
  "practical_evaluations_employee_fk",
  "practical_evaluations_evaluator_fk",
  "occurrences_employee_fk",
  "occurrences_creator_fk",
  "audit_logs_actor_fk",
];

const CRITICAL_UNIQUE_INDEXES = [
  ["app_users", "app_users_matricula_key"],
  ["employees", "employees_matricula_key"],
  ["profiles", "profiles_matricula_key"],
  ["user_roles", "user_roles_user_id_role_key"],
  ["exam_attempts", "exam_attempts_certificate_code_uidx"],
  ["certificates", "certificates_attempt_id_key"],
  ["certificates", "certificates_verification_code_key"],
  ["training_activity_attempts", "training_activity_daily_challenge_unique_idx"],
  ["training_schedules", "training_schedules_employee_id_key"],
];

function mysqlMajor(versionText) {
  const match = /^(\d+)/.exec(String(versionText || ""));
  return match ? Number(match[1]) : NaN;
}

function migrationVersion(fileName) {
  const match = /^(\d{3,})_.+\.sql$/i.exec(fileName);
  return match ? match[1] : null;
}

function checksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

async function verifyMigrationHistory() {
  const files = (await fs.readdir(migrationsDir))
    .map((fileName) => ({ fileName, version: migrationVersion(fileName) }))
    .filter((entry) => entry.version)
    .sort((a, b) => BigInt(a.version) < BigInt(b.version) ? -1 : BigInt(a.version) > BigInt(b.version) ? 1 : a.fileName.localeCompare(b.fileName, "en"));

  if (files.length === 0) throw new Error("Nenhuma migration MySQL encontrada em database/mysql");

  const expected = [];
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file.fileName), "utf8");
    expected.push({ ...file, checksum: checksum(sql) });
  }

  const appliedRows = await query(
    `SELECT version, file_name, checksum_sha256
       FROM schema_migrations
      ORDER BY CAST(version AS UNSIGNED) ASC, version ASC`,
  );
  const applied = new Map(appliedRows.map((row) => [String(row.version), row]));

  if (applied.size !== expected.length) {
    throw new Error(`Histórico de migrations divergente do código: esperadas ${expected.length}, registradas ${applied.size}`);
  }

  for (const migration of expected) {
    const row = applied.get(migration.version);
    if (!row) throw new Error(`Migration ${migration.fileName} não está registrada em schema_migrations`);
    if (String(row.file_name) !== migration.fileName) {
      throw new Error(`Migration ${migration.version} registrada com nome divergente: ${row.file_name}`);
    }
    if (String(row.checksum_sha256) !== migration.checksum) {
      throw new Error(`Migration ${migration.fileName} possui checksum divergente do arquivo versionado`);
    }
  }

  for (const [version, row] of applied) {
    if (!expected.some((migration) => migration.version === version)) {
      throw new Error(`Histórico contém migration inexistente no código atual: ${version}:${row.file_name}`);
    }
  }

  return expected.at(-1);
}

async function main() {
  try {
    await healthcheck();

    const sslStatus = await queryOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    const sslCipher = String(sslStatus?.Value ?? sslStatus?.value ?? "").trim();
    if (config.db.ssl && !sslCipher) {
      throw new Error("MYSQL_SSL=true, mas o smoke test não detectou TLS negociado na sessão MySQL");
    }
    if (config.nodeEnv === "production" && !sslCipher) {
      throw new Error("Homologação de produção exige conexão MySQL com TLS efetivamente negociado");
    }

    const version = await queryOne(`SELECT VERSION() AS version`);
    const database = await queryOne(`SELECT DATABASE() AS database_name`);
    const tables = await queryOne(
      `SELECT COUNT(*) AS total
         FROM information_schema.tables
        WHERE table_schema = DATABASE()`,
    );

    const majorVersion = mysqlMajor(version?.version);
    if (!Number.isInteger(majorVersion) || majorVersion < 8) {
      throw new Error(`Versão MySQL não suportada: ${version?.version || "desconhecida"}. O SEGEMPAT requer MySQL 8.0+`);
    }
    if (!database?.database_name) {
      throw new Error("Nenhum database MySQL foi selecionado para o SEGEMPAT");
    }

    const missing = [];
    for (const table of REQUIRED_TABLES) {
      const row = await queryOne(
        `SELECT COUNT(*) AS total
           FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = ?`,
        [table],
      );
      if (Number(row?.total ?? 0) !== 1) missing.push(table);
    }

    if (missing.length) {
      throw new Error(`Tabelas obrigatórias ausentes: ${missing.join(", ")}`);
    }

    const baseline = await queryOne(
      `SELECT version, file_name, applied_at
         FROM schema_migrations
        WHERE CAST(version AS UNSIGNED) = 1
        ORDER BY applied_at ASC
        LIMIT 1`,
    );
    if (!baseline) {
      throw new Error("Migration baseline 001 não está registrada em schema_migrations");
    }

    const latestMigration = await queryOne(
      `SELECT version, file_name, applied_at
         FROM schema_migrations
        ORDER BY CAST(version AS UNSIGNED) DESC, applied_at DESC
        LIMIT 1`,
    );
    if (!latestMigration) {
      throw new Error("Nenhuma migration MySQL está registrada");
    }

    const expectedLatestMigration = await verifyMigrationHistory();
    if (String(latestMigration.version) !== String(expectedLatestMigration.version) || latestMigration.file_name !== expectedLatestMigration.fileName) {
      throw new Error(
        `Última migration registrada (${latestMigration.version}:${latestMigration.file_name}) difere da última migration do código (${expectedLatestMigration.version}:${expectedLatestMigration.fileName})`,
      );
    }

    const placeholders = REQUIRED_TABLES.map(() => "?").join(",");
    const engineRows = await queryOne(
      `SELECT COUNT(*) AS invalid_count
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${placeholders})
          AND engine <> 'InnoDB'`,
      REQUIRED_TABLES,
    );
    if (Number(engineRows?.invalid_count ?? 0) > 0) {
      throw new Error("Uma ou mais tabelas obrigatórias não estão usando InnoDB");
    }

    const charsetRows = await queryOne(
      `SELECT COUNT(*) AS invalid_count
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${placeholders})
          AND (table_collation IS NULL OR table_collation NOT LIKE 'utf8mb4%')`,
      REQUIRED_TABLES,
    );
    if (Number(charsetRows?.invalid_count ?? 0) > 0) {
      throw new Error("Uma ou mais tabelas obrigatórias não estão usando collation utf8mb4");
    }

    const missingForeignKeys = [];
    for (const constraint of CRITICAL_FOREIGN_KEYS) {
      const row = await queryOne(
        `SELECT COUNT(*) AS total
           FROM information_schema.referential_constraints
          WHERE constraint_schema = DATABASE()
            AND constraint_name = ?`,
        [constraint],
      );
      if (Number(row?.total ?? 0) !== 1) missingForeignKeys.push(constraint);
    }
    if (missingForeignKeys.length > 0) {
      throw new Error(`Foreign keys críticas ausentes: ${missingForeignKeys.join(", ")}`);
    }

    const missingUniqueIndexes = [];
    for (const [table, indexName] of CRITICAL_UNIQUE_INDEXES) {
      const row = await queryOne(
        `SELECT COUNT(DISTINCT index_name) AS total
           FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = ?
            AND index_name = ?
            AND non_unique = 0`,
        [table, indexName],
      );
      if (Number(row?.total ?? 0) !== 1) missingUniqueIndexes.push(`${table}.${indexName}`);
    }
    if (missingUniqueIndexes.length > 0) {
      throw new Error(`Índices UNIQUE críticos ausentes: ${missingUniqueIndexes.join(", ")}`);
    }

    const session = await queryOne(
      `SELECT @@FOREIGN_KEY_CHECKS AS foreign_keys,
              @@SESSION.time_zone AS time_zone,
              @@SESSION.sql_mode AS sql_mode`,
    );
    if (Number(session?.foreign_keys) !== 1) {
      throw new Error("FOREIGN_KEY_CHECKS está desabilitado na sessão MySQL; a homologação exige integridade referencial ativa");
    }
    const timeZone = String(session?.time_zone || "").trim();
    if (!["+00:00", "UTC"].includes(timeZone.toUpperCase() === "UTC" ? "UTC" : timeZone)) {
      throw new Error(`Sessão MySQL fora de UTC: ${timeZone || "desconhecido"}`);
    }
    const sqlModes = String(session?.sql_mode || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (!sqlModes.includes("STRICT_TRANS_TABLES") && !sqlModes.includes("STRICT_ALL_TABLES")) {
      throw new Error("Modo SQL estrito não está ativo na sessão MySQL; habilite STRICT_TRANS_TABLES ou STRICT_ALL_TABLES");
    }

    console.log(
      `[segempat-api] MySQL OK; banco=${database.database_name}; versão=${version.version}; ` +
      `${Number(tables?.total ?? 0)} tabela(s); baseline=${baseline.version}:${baseline.file_name}; ` +
      `latest=${latestMigration.version}:${latestMigration.file_name}; migration_history=complete; tls=${sslCipher || "off"}; foreign_keys=on; timezone=${timeZone}; strict_sql=on; ` +
      `critical_fks=${CRITICAL_FOREIGN_KEYS.length}; critical_unique_indexes=${CRITICAL_UNIQUE_INDEXES.length}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] smoke test falhou", error?.message || error);
  process.exit(1);
});
