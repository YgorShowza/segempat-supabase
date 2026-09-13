import { pool, query, queryOne } from "../src/db.js";

const EXPECTED_COLUMNS = new Map([
  ["min_approval_score", { dataType: "decimal", nullable: "NO" }],
  ["template_id", { dataType: "char", nullable: "YES", length: 36 }],
  ["template_slot", { dataType: "varchar", nullable: "YES", length: 64 }],
]);
const REQUIRE_TRIGGER_METADATA = process.env.SEGEMPAT_SCHEMA_AUDIT_PRIVILEGED === "1";

async function loadIndex(indexName) {
  return query(
    `SELECT INDEX_NAME AS index_name,
            NON_UNIQUE AS non_unique,
            SEQ_IN_INDEX AS seq_in_index,
            COLUMN_NAME AS column_name,
            SUB_PART AS sub_part
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'practical_evaluations'
        AND index_name = ?
      ORDER BY SEQ_IN_INDEX`,
    [indexName],
  );
}

function validateIndex(rows, indexName, expectedColumns, { unique }) {
  if (rows.length !== expectedColumns.length) {
    throw new Error(`${indexName}: definição ausente/incompleta; esperadas ${expectedColumns.length} coluna(s), encontradas ${rows.length}`);
  }
  const actual = rows.map((row) => String(row.column_name));
  if (!actual.every((column, index) => column === expectedColumns[index])) {
    throw new Error(`${indexName}: colunas [${actual.join(",")}] divergentes; esperado [${expectedColumns.join(",")}]`);
  }
  const expectedNonUnique = unique ? 0 : 1;
  if (rows.some((row) => Number(row.non_unique) !== expectedNonUnique)) {
    throw new Error(`${indexName}: unicidade divergente; esperado ${unique ? "UNIQUE" : "INDEX não-UNIQUE"}`);
  }
  if (rows.some((row) => row.sub_part != null)) {
    throw new Error(`${indexName}: não pode usar prefixo parcial de coluna`);
  }
}

function normalizeReferentialRule(value) {
  const normalized = String(value || "").toUpperCase();
  return normalized === "NO ACTION" ? "RESTRICT" : normalized;
}

async function assertZero(sql, message) {
  const row = await queryOne(sql);
  const total = Number(row?.total ?? 0);
  if (total > 0) throw new Error(`${message}: ${total}`);
}

async function main() {
  try {
    const columns = await query(
      `SELECT COLUMN_NAME AS column_name,
              DATA_TYPE AS data_type,
              IS_NULLABLE AS is_nullable,
              COLUMN_DEFAULT AS column_default,
              CHARACTER_MAXIMUM_LENGTH AS character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'practical_evaluations'
          AND column_name IN ('min_approval_score','template_id','template_slot')`,
    );
    const byName = new Map(columns.map((row) => [String(row.column_name), row]));

    for (const [name, expected] of EXPECTED_COLUMNS) {
      const row = byName.get(name);
      if (!row) throw new Error(`practical_evaluations.${name}: coluna ausente`);
      if (String(row.data_type).toLowerCase() !== expected.dataType) {
        throw new Error(`practical_evaluations.${name}: tipo ${row.data_type}; esperado ${expected.dataType}`);
      }
      if (String(row.is_nullable).toUpperCase() !== expected.nullable) {
        throw new Error(`practical_evaluations.${name}: nullable=${row.is_nullable}; esperado ${expected.nullable}`);
      }
      if (expected.length && Number(row.character_maximum_length) !== expected.length) {
        throw new Error(`practical_evaluations.${name}: tamanho ${row.character_maximum_length}; esperado ${expected.length}`);
      }
    }

    const minApproval = byName.get("min_approval_score");
    if (Number(minApproval?.column_default) !== 7) {
      throw new Error(`practical_evaluations.min_approval_score: default ${minApproval?.column_default}; esperado 7`);
    }

    validateIndex(
      await loadIndex("practical_evaluations_template_slot_unique_idx"),
      "practical_evaluations_template_slot_unique_idx",
      ["employee_id", "template_id", "template_slot"],
      { unique: true },
    );
    validateIndex(
      await loadIndex("practical_evaluations_template_idx"),
      "practical_evaluations_template_idx",
      ["template_id", "evaluation_date"],
      { unique: false },
    );

    const foreignKey = await queryOne(
      `SELECT kcu.TABLE_NAME AS table_name,
              kcu.COLUMN_NAME AS column_name,
              kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
              kcu.REFERENCED_COLUMN_NAME AS referenced_column_name,
              rc.DELETE_RULE AS delete_rule,
              rc.UPDATE_RULE AS update_rule
         FROM information_schema.key_column_usage AS kcu
         JOIN information_schema.referential_constraints AS rc
           ON rc.constraint_schema = kcu.constraint_schema
          AND rc.constraint_name = kcu.constraint_name
          AND rc.table_name = kcu.table_name
        WHERE kcu.constraint_schema = DATABASE()
          AND kcu.constraint_name = 'practical_evaluations_template_fk'
          AND kcu.table_name = 'practical_evaluations'
        LIMIT 1`,
    );
    if (!foreignKey) throw new Error("practical_evaluations_template_fk: foreign key ausente");
    if (
      String(foreignKey.column_name) !== "template_id" ||
      String(foreignKey.referenced_table_name) !== "practical_eval_templates" ||
      String(foreignKey.referenced_column_name) !== "id" ||
      normalizeReferentialRule(foreignKey.delete_rule) !== "RESTRICT" ||
      normalizeReferentialRule(foreignKey.update_rule) !== "RESTRICT"
    ) {
      throw new Error("practical_evaluations_template_fk: definição ou regras referenciais divergentes da migration 004");
    }

    const deleteGuard = await queryOne(
      `SELECT ACTION_TIMING AS action_timing,
              EVENT_MANIPULATION AS event_manipulation,
              ACTION_STATEMENT AS action_statement
         FROM information_schema.triggers
        WHERE trigger_schema = DATABASE()
          AND event_object_table = 'practical_evaluations'
          AND trigger_name = 'practical_evaluations_guard_delete'
        LIMIT 1`,
    );
    if (!deleteGuard) {
      if (REQUIRE_TRIGGER_METADATA) {
        throw new Error("practical_evaluations_guard_delete: trigger de histórico ausente");
      }
      console.log("[segempat-api] metadado do trigger practical_evaluations_guard_delete não é visível à credencial runtime de menor privilégio; definição validada no gate pós-migration privilegiado");
    } else {
      if (
        String(deleteGuard.action_timing).toUpperCase() !== "BEFORE" ||
        String(deleteGuard.event_manipulation).toUpperCase() !== "DELETE"
      ) {
        throw new Error("practical_evaluations_guard_delete: timing/evento divergente da migration 005");
      }
      const guardStatement = String(deleteGuard.action_statement ?? "").toLowerCase();
      if (
        !guardStatement.includes("practical:") ||
        !guardStatement.includes("cronograma_entries") ||
        !guardStatement.includes("pendente")
      ) {
        throw new Error("practical_evaluations_guard_delete: regra de vínculo formalizado divergente da migration 005");
      }
    }

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM practical_evaluations
        WHERE (template_id IS NULL AND template_slot IS NOT NULL)
           OR (template_id IS NOT NULL AND template_slot IS NULL)`,
      "Avaliações com vínculo de modelo incompleto",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM practical_evaluations
        WHERE min_approval_score < 0 OR min_approval_score > 10`,
      "Avaliações com nota mínima fora de 0..10",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM practical_evaluations
        WHERE template_id IS NOT NULL
          AND evaluation_date IS NULL`,
      "Avaliações geradas por modelo sem data operacional",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM practical_evaluations
        WHERE template_id IS NOT NULL
          AND template_slot <> 'once'
          AND template_slot NOT REGEXP '^[0-9]{4}-(0[1-9]|1[0-2]):[0-9]{2}$'`,
      "Avaliações recorrentes com template_slot inválido",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM practical_evaluations
        WHERE template_id IS NOT NULL
          AND template_slot <> 'once'
          AND DATE_FORMAT(evaluation_date, '%Y-%m') <> LEFT(template_slot, 7)`,
      "Avaliações recorrentes com data fora do mês do slot",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM (
           SELECT employee_id, template_id, template_slot
             FROM practical_evaluations
            WHERE template_id IS NOT NULL AND template_slot IS NOT NULL
            GROUP BY employee_id, template_id, template_slot
           HAVING COUNT(*) > 1
         ) AS duplicated`,
      "Slots recorrentes duplicados encontrados",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM practical_evaluations pe
        WHERE pe.template_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
              FROM cronograma_entries ce
             WHERE ce.employee_id = pe.employee_id
               AND ce.notes LIKE CONCAT('%[PRACTICAL:', pe.id, ']%')
          )`,
      "Avaliações recorrentes sem lançamento vinculado no Cronograma",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM (
           SELECT pe.id
             FROM practical_evaluations pe
             JOIN cronograma_entries ce
               ON ce.employee_id = pe.employee_id
              AND ce.notes LIKE CONCAT('%[PRACTICAL:', pe.id, ']%')
            WHERE pe.template_id IS NOT NULL
            GROUP BY pe.id
           HAVING COUNT(*) <> 1
         ) AS invalid_links`,
      "Avaliações recorrentes com quantidade de vínculos diferente de 1",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM practical_evaluations pe
         JOIN cronograma_entries ce
           ON ce.notes LIKE CONCAT('%[PRACTICAL:', pe.id, ']%')
        WHERE pe.template_id IS NOT NULL
          AND (
            NOT (ce.employee_id <=> pe.employee_id)
            OR NOT (LOWER(TRIM(ce.theme)) <=> LOWER(TRIM(pe.title)))
            OR NOT (ce.planned_date <=> pe.evaluation_date)
          )`,
      "Vínculos recorrentes com identidade, tema ou data divergentes do Cronograma",
    );

    await assertZero(
      `SELECT COUNT(*) AS total
         FROM cronograma_entries ce
        WHERE ce.notes LIKE '%[PRACTICAL:%'
          AND NOT EXISTS (
            SELECT 1
              FROM practical_evaluations pe
             WHERE ce.notes LIKE CONCAT('%[PRACTICAL:', pe.id, ']%')
          )`,
      "Marcadores PRACTICAL órfãos no Cronograma",
    );

    console.log(
      `[segempat-api] geração recorrente de Avaliação Prática OK; migrations 003/004/005, colunas, índices, FK, slots, período, nota mínima e vínculo 1:1 com Cronograma auditados; trigger_metadata=${deleteGuard ? "verified" : "privileged-gate"}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] auditoria da geração recorrente de Avaliação Prática falhou", error?.message || error);
  process.exit(1);
});
