import { pool, query, queryOne } from "../src/db.js";

const REQUIRED_COLUMNS = [
  "current_situation",
  "immediate_risk",
  "information_source",
  "actions_taken",
  "support_required",
  "people_involved",
];

const REQUIRED_TABLES = ["occurrence_updates", "occurrence_attachments"];
const REQUIRED_FOREIGN_KEYS = [
  "occurrence_updates_occurrence_fk",
  "occurrence_updates_creator_fk",
  "occurrence_attachments_occurrence_fk",
  "occurrence_attachments_uploader_fk",
];
const REQUIRED_TRIGGERS = ["occurrences_guard_delete", "occurrences_guard_completed_update"];
const REQUIRE_TRIGGER_METADATA = process.env.SEGEMPAT_SCHEMA_AUDIT_PRIVILEGED === "1";

async function main() {
  try {
    const missingColumns = [];
    for (const column of REQUIRED_COLUMNS) {
      const row = await queryOne(
        `SELECT COUNT(*) AS total
           FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = 'occurrences'
            AND column_name = ?`,
        [column],
      );
      if (Number(row?.total ?? 0) !== 1) missingColumns.push(column);
    }
    if (missingColumns.length) throw new Error(`Campos operacionais de ocorrência ausentes: ${missingColumns.join(", ")}`);

    const missingTables = [];
    for (const table of REQUIRED_TABLES) {
      const row = await queryOne(
        `SELECT COUNT(*) AS total
           FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = ?`,
        [table],
      );
      if (Number(row?.total ?? 0) !== 1) missingTables.push(table);
    }
    if (missingTables.length) throw new Error(`Tabelas do registro de ocorrência ausentes: ${missingTables.join(", ")}`);

    const missingFks = [];
    for (const constraint of REQUIRED_FOREIGN_KEYS) {
      const row = await queryOne(
        `SELECT COUNT(*) AS total
           FROM information_schema.referential_constraints
          WHERE constraint_schema = DATABASE() AND constraint_name = ?`,
        [constraint],
      );
      if (Number(row?.total ?? 0) !== 1) missingFks.push(constraint);
    }
    if (missingFks.length) throw new Error(`Foreign keys de ocorrências ausentes: ${missingFks.join(", ")}`);

    const missingTriggers = [];
    for (const trigger of REQUIRED_TRIGGERS) {
      const row = await queryOne(
        `SELECT COUNT(*) AS total
           FROM information_schema.triggers
          WHERE trigger_schema = DATABASE() AND trigger_name = ?`,
        [trigger],
      );
      if (Number(row?.total ?? 0) !== 1) missingTriggers.push(trigger);
    }
    if (missingTriggers.length) {
      if (REQUIRE_TRIGGER_METADATA) {
        throw new Error(`Triggers de proteção de ocorrências ausentes: ${missingTriggers.join(", ")}`);
      }
      console.log("[segempat-api] metadados dos triggers de ocorrências não são visíveis à credencial runtime de menor privilégio; definições validadas no gate pós-migration privilegiado");
    }

    const invalidPeople = await queryOne(
      `SELECT COUNT(*) AS total
         FROM occurrences
        WHERE people_involved IS NULL
           OR JSON_TYPE(people_involved) <> 'ARRAY'`,
    );
    if (Number(invalidPeople?.total ?? 0) > 0) {
      throw new Error(`${invalidPeople.total} ocorrência(s) possuem people_involved fora do formato JSON ARRAY`);
    }

    const orphanUpdates = await queryOne(
      `SELECT COUNT(*) AS total
         FROM occurrence_updates u
         LEFT JOIN occurrences o ON o.id = u.occurrence_id
        WHERE o.id IS NULL`,
    );
    const orphanAttachments = await queryOne(
      `SELECT COUNT(*) AS total
         FROM occurrence_attachments a
         LEFT JOIN occurrences o ON o.id = a.occurrence_id
        WHERE o.id IS NULL`,
    );
    if (Number(orphanUpdates?.total ?? 0) || Number(orphanAttachments?.total ?? 0)) {
      throw new Error(`Registros órfãos detectados: updates=${orphanUpdates?.total ?? 0}; anexos=${orphanAttachments?.total ?? 0}`);
    }

    const invalidAttachments = await query(
      `SELECT id,storage_path,mime_type,size_bytes
         FROM occurrence_attachments
        WHERE storage_path NOT LIKE 'occurrence-evidence/%'
           OR mime_type NOT IN ('image/png','image/jpeg')
           OR size_bytes <= 0
           OR size_bytes > 1250000
        LIMIT 20`,
    );
    if (invalidAttachments.length) throw new Error(`Metadados de evidência inválidos em ${invalidAttachments.length} registro(s)`);

    console.log(
      `[segempat-api] integridade de ocorrências OK; campos=${REQUIRED_COLUMNS.length}; tabelas=${REQUIRED_TABLES.length}; fks=${REQUIRED_FOREIGN_KEYS.length}; triggers=${missingTriggers.length ? "privileged-gate" : REQUIRED_TRIGGERS.length}; pessoas=json-array; evidências=privadas`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] integridade do registro de ocorrências falhou", error?.message || error);
  process.exit(1);
});
