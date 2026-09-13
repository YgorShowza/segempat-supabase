import { pool, query } from "../src/db.js";

const REQUIRED_UNIQUE_INDEXES = [
  ["app_users", "app_users_matricula_key", ["matricula"]],
  ["employees", "employees_matricula_key", ["matricula"]],
  ["profiles", "profiles_matricula_key", ["matricula"]],
  ["user_roles", "user_roles_user_id_role_key", ["user_id", "role"]],
  ["exam_attempts", "exam_attempts_certificate_code_uidx", ["certificate_code"]],
  ["certificates", "certificates_attempt_id_key", ["attempt_id"]],
  ["certificates", "certificates_verification_code_key", ["verification_code"]],
  ["training_activity_attempts", "training_activity_daily_challenge_unique_idx", ["daily_challenge_guard"]],
  ["training_schedules", "training_schedules_employee_id_key", ["employee_id"]],
];

function groupIndexes(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.table_name}\u0000${row.index_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        tableName: String(row.table_name),
        indexName: String(row.index_name),
        nonUnique: Number(row.non_unique),
        columns: [],
      });
    }
    grouped.get(key).columns.push({
      columnName: String(row.column_name),
      sequence: Number(row.seq_in_index),
      prefixLength: row.sub_part == null ? null : Number(row.sub_part),
    });
  }

  return new Map(
    [...grouped.entries()].map(([key, index]) => [
      key,
      {
        ...index,
        columns: index.columns.sort((a, b) => a.sequence - b.sequence),
      },
    ]),
  );
}

async function main() {
  try {
    const tableNames = [...new Set(REQUIRED_UNIQUE_INDEXES.map(([table]) => table))];
    const indexNames = [...new Set(REQUIRED_UNIQUE_INDEXES.map(([, index]) => index))];
    const tablePlaceholders = tableNames.map(() => "?").join(",");
    const indexPlaceholders = indexNames.map(() => "?").join(",");

    // Alias explícito evita depender da caixa usada pelo INFORMATION_SCHEMA /
    // driver em versões diferentes do MySQL 8.
    const rows = await query(
      `SELECT TABLE_NAME AS table_name,
              INDEX_NAME AS index_name,
              NON_UNIQUE AS non_unique,
              SEQ_IN_INDEX AS seq_in_index,
              COLUMN_NAME AS column_name,
              SUB_PART AS sub_part
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name IN (${tablePlaceholders})
          AND index_name IN (${indexPlaceholders})
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      [...tableNames, ...indexNames],
    );

    const actualByKey = groupIndexes(rows);
    const problems = [];

    for (const [tableName, indexName, expectedColumns] of REQUIRED_UNIQUE_INDEXES) {
      const actual = actualByKey.get(`${tableName}\u0000${indexName}`);
      if (!actual) {
        problems.push(`${tableName}.${indexName}: ausente`);
        continue;
      }
      if (actual.nonUnique !== 0) {
        problems.push(`${tableName}.${indexName}: não é UNIQUE`);
      }

      const actualColumns = actual.columns.map(({ columnName }) => columnName);
      const exactColumns =
        actualColumns.length === expectedColumns.length &&
        actualColumns.every((columnName, index) => columnName === expectedColumns[index]);
      if (!exactColumns) {
        problems.push(
          `${tableName}.${indexName}: colunas [${actualColumns.join(",")}] divergentes; ` +
          `esperado [${expectedColumns.join(",")}]`,
        );
      }

      const prefixedColumns = actual.columns.filter(({ prefixLength }) => prefixLength !== null);
      if (prefixedColumns.length > 0) {
        problems.push(
          `${tableName}.${indexName}: possui prefixo parcial em ${prefixedColumns
            .map(({ columnName, prefixLength }) => `${columnName}(${prefixLength})`)
            .join(",")}`,
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(`Índices UNIQUE críticos divergentes do baseline SEGEMPAT: ${problems.join("; ")}`);
    }

    console.log(
      `[segempat-api] índices UNIQUE críticos OK; ${REQUIRED_UNIQUE_INDEXES.length} definição(ões) validada(s) por nome, unicidade, ordem e colunas`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de índices críticos falhou", error?.message || error);
  process.exit(1);
});
