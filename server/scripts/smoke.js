import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { healthcheck, query, queryOne, pool } from "../src/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../supabase/migrations");

const REQUIRED_TABLES = [
  "app_users",
  "employees",
  "profiles",
  "user_roles",
  "registration_activation_codes",
  "password_reset_codes",
  "access_levels",
  "access_permissions",
  "access_level_permissions",
  "user_access_levels",
  "user_permission_overrides",
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
  "occurrence_updates",
  "occurrence_attachments",
  "audit_logs",
  "schema_migrations",
];

const CRITICAL_FOREIGN_KEYS = [
  "profiles_user_fk",
  "profiles_employee_matricula_fk",
  "user_roles_user_fk",
  "registration_activation_employee_fk",
  "registration_activation_creator_fk",
  "password_reset_user_fk",
  "password_reset_creator_fk",
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
  "practical_evaluations_template_fk",
  "occurrences_employee_fk",
  "occurrences_creator_fk",
  "occurrence_updates_occurrence_fk",
  "occurrence_updates_creator_fk",
  "occurrence_attachments_occurrence_fk",
  "occurrence_attachments_uploader_fk",
  "audit_logs_actor_fk",
  "access_level_permissions_level_fk",
  "access_level_permissions_permission_fk",
  "user_access_levels_user_fk",
  "user_access_levels_level_fk",
  "user_access_levels_updater_fk",
  "user_permission_overrides_user_fk",
  "user_permission_overrides_permission_fk",
  "user_permission_overrides_updater_fk",
];

const CRITICAL_UNIQUE_INDEXES = [
  ["app_users", "app_users_matricula_key"],
  ["employees", "employees_matricula_key"],
  ["profiles", "profiles_matricula_key"],
  ["user_roles", "user_roles_user_id_role_key"],
  ["exam_attempts", "exam_attempts_certificate_code_uidx"],
  ["certificates", "certificates_attempt_id_key"],
  ["certificates", "certificates_verification_code_key"],
  ["cronograma_entries", "cronograma_entries_no_exact_duplicate_idx"],
  ["training_activity_attempts", "training_activity_daily_challenge_unique_idx"],
  ["training_schedules", "training_schedules_employee_id_key"],
  ["practical_evaluations", "practical_evaluations_template_slot_unique_idx"],
  ["occurrence_attachments", "occurrence_attachments_storage_path_uidx"],
];

const CRITICAL_TRIGGERS = [
  "cronograma_entries_guard_write",
  "cronograma_entries_guard_delete",
  "practical_evaluations_guard_delete",
  "audit_logs_block_update",
  "audit_logs_block_delete",
  "occurrences_guard_delete",
  "occurrences_guard_completed_update",
  "password_reset_codes_set_updated_at",
  "user_access_levels_set_updated_at",
  "user_permission_overrides_set_updated_at",
];

function postgresMajor(versionText) {
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

  if (files.length === 0) throw new Error("Nenhuma migration PostgreSQL encontrada em supabase/migrations");

  const expected = [];
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file.fileName), "utf8");
    expected.push({ ...file, checksum: checksum(sql) });
  }

  const appliedRows = await query(
    `SELECT version, file_name, checksum_sha256
       FROM schema_migrations
      ORDER BY version ASC`,
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

  return expected.at(-1);
}

async function main() {
  try {
    await healthcheck();

    const info = await queryOne(
      `SELECT current_setting('server_version') AS version,
              current_database() AS database_name,
              current_setting('TimeZone') AS time_zone,
              current_setting('server_encoding') AS server_encoding,
              current_setting('session_replication_role') AS replication_role`,
    );
    const majorVersion = postgresMajor(info?.version);
    if (!Number.isInteger(majorVersion) || majorVersion < 15) {
      throw new Error(`Versão PostgreSQL não suportada: ${info?.version || "desconhecida"}. O SEGEMPAT Supabase requer PostgreSQL 15+`);
    }
    if (!info?.database_name) throw new Error("Nenhum database PostgreSQL foi selecionado para o SEGEMPAT");
    if (String(info.server_encoding || "").toUpperCase() !== "UTF8") {
      throw new Error(`PostgreSQL deve usar UTF8; detectado: ${info.server_encoding || "desconhecido"}`);
    }
    if (!["UTC", "ETC/UTC", "+00:00"].includes(String(info.time_zone || "").toUpperCase())) {
      throw new Error(`Sessão PostgreSQL fora de UTC: ${info.time_zone || "desconhecido"}`);
    }
    if (String(info.replication_role || "").toLowerCase() !== "origin") {
      throw new Error(`session_replication_role deve permanecer origin; detectado: ${info.replication_role || "desconhecido"}`);
    }

    const sslStatus = await queryOne(
      `SELECT ssl, COALESCE(cipher, '') AS cipher
         FROM pg_stat_ssl
        WHERE pid = pg_backend_pid()`,
    );
    const sslOn = Boolean(sslStatus?.ssl);
    if (config.db.ssl && !sslOn) {
      throw new Error("POSTGRES_SSL=true, mas o smoke test não detectou TLS negociado na sessão PostgreSQL");
    }
    if (config.nodeEnv === "production" && !sslOn) {
      throw new Error("Homologação de produção exige conexão PostgreSQL com TLS efetivamente negociado");
    }

    const tableCount = await queryOne(
      `SELECT COUNT(*)::int AS total
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'`,
    );

    const placeholders = REQUIRED_TABLES.map(() => "?").join(",");
    const presentRows = await query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name IN (${placeholders})`,
      REQUIRED_TABLES,
    );
    const present = new Set(presentRows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
    if (missing.length) throw new Error(`Tabelas obrigatórias ausentes: ${missing.join(", ")}`);

    const latestMigration = await queryOne(
      `SELECT version, file_name, applied_at
         FROM schema_migrations
        ORDER BY version DESC
        LIMIT 1`,
    );
    if (!latestMigration) throw new Error("Nenhuma migration PostgreSQL está registrada");

    const expectedLatestMigration = await verifyMigrationHistory();
    if (String(latestMigration.version) !== String(expectedLatestMigration.version) || latestMigration.file_name !== expectedLatestMigration.fileName) {
      throw new Error(
        `Última migration registrada (${latestMigration.version}:${latestMigration.file_name}) difere da última migration do código (${expectedLatestMigration.version}:${expectedLatestMigration.fileName})`,
      );
    }

    const fkRows = await query(
      `SELECT conname
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public'
          AND c.contype = 'f'`,
    );
    const foreignKeys = new Set(fkRows.map((row) => row.conname));
    const missingForeignKeys = CRITICAL_FOREIGN_KEYS.filter((name) => !foreignKeys.has(name));
    if (missingForeignKeys.length) {
      throw new Error(`Foreign keys críticas ausentes: ${missingForeignKeys.join(", ")}`);
    }

    const indexRows = await query(
      `SELECT tablename, indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'`,
    );
    const indexMap = new Map(indexRows.map((row) => [`${row.tablename}.${row.indexname}`, String(row.indexdef || "")]));
    const missingUniqueIndexes = [];
    for (const [table, indexName] of CRITICAL_UNIQUE_INDEXES) {
      const definition = indexMap.get(`${table}.${indexName}`);
      if (!definition || !/CREATE\s+UNIQUE\s+INDEX/i.test(definition)) {
        missingUniqueIndexes.push(`${table}.${indexName}`);
      }
    }
    if (missingUniqueIndexes.length) {
      throw new Error(`Índices UNIQUE críticos ausentes: ${missingUniqueIndexes.join(", ")}`);
    }

    const triggerRows = await query(
      `SELECT DISTINCT trigger_name
         FROM information_schema.triggers
        WHERE trigger_schema = 'public'`,
    );
    const triggers = new Set(triggerRows.map((row) => row.trigger_name));
    const missingTriggers = CRITICAL_TRIGGERS.filter((name) => !triggers.has(name));
    if (missingTriggers.length) throw new Error(`Triggers críticos ausentes: ${missingTriggers.join(", ")}`);

    const permissions = await queryOne(`SELECT COUNT(*)::int AS total FROM access_permissions`);
    const levels = await queryOne(`SELECT COUNT(*)::int AS total FROM access_levels`);
    if (Number(permissions?.total || 0) < 20 || Number(levels?.total || 0) !== 4) {
      throw new Error(`Catálogo de autorização incompleto: levels=${levels?.total ?? 0} permissions=${permissions?.total ?? 0}`);
    }

    console.log(
      `[segempat-api] PostgreSQL OK; banco=${info.database_name}; versão=${info.version}; ` +
      `${Number(tableCount?.total ?? 0)} tabela(s); latest=${latestMigration.version}:${latestMigration.file_name}; ` +
      `migration_history=complete; tls=${sslOn ? sslStatus?.cipher || "on" : "off"}; foreign_keys=on; ` +
      `timezone=${info.time_zone}; encoding=${info.server_encoding}; critical_fks=${CRITICAL_FOREIGN_KEYS.length}; ` +
      `critical_unique_indexes=${CRITICAL_UNIQUE_INDEXES.length}; critical_triggers=${CRITICAL_TRIGGERS.length}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] smoke test PostgreSQL falhou", error?.message || error);
  process.exit(1);
});
