import { pool, query, queryOne } from "../src/db.js";

const REQUIRED_FOREIGN_KEYS = [
  ["profiles_user_fk", "profiles", "id", "app_users", "id", "CASCADE"],
  ["profiles_employee_matricula_fk", "profiles", "matricula", "employees", "matricula", "RESTRICT"],
  ["user_roles_user_fk", "user_roles", "user_id", "app_users", "id", "CASCADE"],
  ["registration_activation_employee_fk", "registration_activation_codes", "employee_id", "employees", "id", "CASCADE"],
  ["registration_activation_creator_fk", "registration_activation_codes", "created_by", "app_users", "id", "SET NULL"],
  ["exams_creator_fk", "exams", "created_by", "app_users", "id", "SET NULL"],
  ["exam_attempts_exam_fk", "exam_attempts", "exam_id", "exams", "id", "RESTRICT"],
  ["exam_attempts_user_fk", "exam_attempts", "user_id", "app_users", "id", "RESTRICT"],
  ["certificates_attempt_fk", "certificates", "attempt_id", "exam_attempts", "id", "CASCADE"],
  ["certificates_exam_fk", "certificates", "exam_id", "exams", "id", "RESTRICT"],
  ["certificates_user_fk", "certificates", "user_id", "app_users", "id", "RESTRICT"],
  ["cronograma_entries_employee_fk", "cronograma_entries", "employee_id", "employees", "id", "RESTRICT"],
  ["cronograma_entries_exam_fk", "cronograma_entries", "exam_id", "exams", "id", "SET NULL"],
  ["cronograma_entries_creator_fk", "cronograma_entries", "created_by", "app_users", "id", "SET NULL"],
  ["cronograma_recurring_creator_fk", "cronograma_recurring_models", "created_by", "app_users", "id", "SET NULL"],
  ["cronograma_suspensions_employee_fk", "cronograma_suspensions", "employee_id", "employees", "id", "SET NULL"],
  ["cronograma_suspensions_creator_fk", "cronograma_suspensions", "created_by", "app_users", "id", "SET NULL"],
  ["knowledge_items_creator_fk", "knowledge_items", "created_by", "app_users", "id", "SET NULL"],
  ["question_bank_creator_fk", "question_bank", "created_by", "app_users", "id", "SET NULL"],
  ["training_modules_creator_fk", "training_modules", "created_by", "app_users", "id", "SET NULL"],
  ["training_activity_user_fk", "training_activity_attempts", "user_id", "app_users", "id", "RESTRICT"],
  ["training_activity_employee_fk", "training_activity_attempts", "employee_id", "employees", "id", "SET NULL"],
  ["training_schedules_employee_fk", "training_schedules", "employee_id", "employees", "id", "CASCADE"],
  ["training_schedules_creator_fk", "training_schedules", "created_by", "app_users", "id", "SET NULL"],
  ["practical_eval_templates_creator_fk", "practical_eval_templates", "created_by", "app_users", "id", "SET NULL"],
  ["practical_evaluations_employee_fk", "practical_evaluations", "employee_id", "employees", "id", "RESTRICT"],
  ["practical_evaluations_evaluator_fk", "practical_evaluations", "evaluator_id", "app_users", "id", "SET NULL"],
  ["occurrences_employee_fk", "occurrences", "employee_id", "employees", "id", "SET NULL"],
  ["occurrences_creator_fk", "occurrences", "created_by", "app_users", "id", "SET NULL"],
  ["audit_logs_actor_fk", "audit_logs", "actor_id", "app_users", "id", "RESTRICT"],
].map(([constraintName, tableName, columnName, referencedTableName, referencedColumnName, deleteRule]) => ({
  constraintName,
  tableName,
  columnName,
  referencedTableName,
  referencedColumnName,
  deleteRule,
  updateRule: "RESTRICT",
}));

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

function normalizeReferentialRule(value) {
  const normalized = String(value || "").toUpperCase();
  // No MySQL/InnoDB, NO ACTION e RESTRICT têm a mesma semântica imediata.
  // O INFORMATION_SCHEMA pode expor NO ACTION mesmo quando o DDL omite
  // ON UPDATE ou quando a intenção de integridade é RESTRICT.
  return normalized === "NO ACTION" ? "RESTRICT" : normalized;
}

function groupForeignKeys(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.constraint_name}\u0000${row.table_name}\u0000${row.referenced_table_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        constraintName: String(row.constraint_name),
        tableName: String(row.table_name),
        referencedTableName: String(row.referenced_table_name),
        deleteRule: String(row.delete_rule || "").toUpperCase(),
        updateRule: String(row.update_rule || "").toUpperCase(),
        columns: [],
      });
    }
    grouped.get(key).columns.push({
      columnName: String(row.column_name),
      referencedColumnName: String(row.referenced_column_name),
      ordinalPosition: Number(row.ordinal_position),
    });
  }

  return [...grouped.values()].map((foreignKey) => ({
    ...foreignKey,
    columns: foreignKey.columns.sort((a, b) => a.ordinalPosition - b.ordinalPosition),
  }));
}

function validateRequiredForeignKeys(foreignKeys) {
  const byName = new Map(foreignKeys.map((foreignKey) => [foreignKey.constraintName, foreignKey]));
  const problems = [];

  for (const expected of REQUIRED_FOREIGN_KEYS) {
    const actual = byName.get(expected.constraintName);
    if (!actual) {
      problems.push(`${expected.constraintName}: ausente`);
      continue;
    }

    const column = actual.columns[0];
    const exactSingleColumn =
      actual.columns.length === 1 &&
      actual.tableName === expected.tableName &&
      column?.columnName === expected.columnName &&
      actual.referencedTableName === expected.referencedTableName &&
      column?.referencedColumnName === expected.referencedColumnName;

    if (!exactSingleColumn) {
      const actualColumns = actual.columns
        .map(({ columnName, referencedColumnName }) => `${columnName}->${referencedColumnName}`)
        .join(",");
      problems.push(
        `${expected.constraintName}: definição divergente (${actual.tableName}[${actualColumns}] -> ${actual.referencedTableName})`,
      );
    }

    if (normalizeReferentialRule(actual.deleteRule) !== normalizeReferentialRule(expected.deleteRule)) {
      problems.push(
        `${expected.constraintName}: ON DELETE ${actual.deleteRule || "desconhecido"}; esperado ${expected.deleteRule}`,
      );
    }
    if (normalizeReferentialRule(actual.updateRule) !== normalizeReferentialRule(expected.updateRule)) {
      problems.push(
        `${expected.constraintName}: ON UPDATE ${actual.updateRule || "desconhecido"}; esperado ${expected.updateRule}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Schema MySQL possui foreign keys críticas ausentes ou divergentes: ${problems.join("; ")}`,
    );
  }
}

async function main() {
  try {
    // Alias explícito evita depender da caixa exposta pelo INFORMATION_SCHEMA
    // em combinações diferentes de MySQL 8 e mysql2.
    const rows = await query(
      `SELECT kcu.CONSTRAINT_NAME AS constraint_name,
              kcu.TABLE_NAME AS table_name,
              kcu.COLUMN_NAME AS column_name,
              kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
              kcu.REFERENCED_COLUMN_NAME AS referenced_column_name,
              kcu.ORDINAL_POSITION AS ordinal_position,
              rc.DELETE_RULE AS delete_rule,
              rc.UPDATE_RULE AS update_rule
         FROM information_schema.key_column_usage AS kcu
         JOIN information_schema.referential_constraints AS rc
           ON rc.constraint_schema = kcu.constraint_schema
          AND rc.constraint_name = kcu.constraint_name
          AND rc.table_name = kcu.table_name
        WHERE kcu.constraint_schema = DATABASE()
          AND kcu.referenced_table_name IS NOT NULL
        ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    );

    const foreignKeys = groupForeignKeys(rows);
    if (foreignKeys.length === 0) {
      throw new Error("Nenhuma foreign key foi encontrada no schema MySQL do SEGEMPAT");
    }

    validateRequiredForeignKeys(foreignKeys);

    const orphaned = [];
    for (const foreignKey of foreignKeys) {
      const childTable = quoteIdentifier(foreignKey.tableName);
      const parentTable = quoteIdentifier(foreignKey.referencedTableName);
      const joinCondition = foreignKey.columns
        .map(({ columnName, referencedColumnName }) =>
          `child.${quoteIdentifier(columnName)} = parent.${quoteIdentifier(referencedColumnName)}`,
        )
        .join(" AND ");
      const populatedChildColumns = foreignKey.columns
        .map(({ columnName }) => `child.${quoteIdentifier(columnName)} IS NOT NULL`)
        .join(" AND ");
      const parentProbe = `parent.${quoteIdentifier(foreignKey.columns[0].referencedColumnName)} IS NULL`;

      const result = await queryOne(
        `SELECT COUNT(*) AS total
           FROM ${childTable} AS child
           LEFT JOIN ${parentTable} AS parent
             ON ${joinCondition}
          WHERE ${populatedChildColumns}
            AND ${parentProbe}`,
      );
      const total = Number(result?.total ?? 0);
      if (total > 0) {
        orphaned.push(`${foreignKey.constraintName}=${total}`);
      }
    }

    if (orphaned.length > 0) {
      throw new Error(
        `Foram encontrados registros órfãos em foreign keys do SEGEMPAT: ${orphaned.join(", ")}. ` +
        "Corrija os dados importados antes da homologação/cutover.",
      );
    }

    console.log(
      `[segempat-api] integridade referencial OK; ${foreignKeys.length} foreign key(s) auditada(s); ` +
      `${REQUIRED_FOREIGN_KEYS.length} foreign key(s) crítica(s) com definição, ON DELETE e ON UPDATE corretos; nenhum registro órfão`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] auditoria de órfãos falhou", error?.message || error);
  process.exit(1);
});
