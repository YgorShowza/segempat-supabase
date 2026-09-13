import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

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

function extractBaselineTableNames(sql) {
  const names = [];
  for (const match of sql.matchAll(/\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)/gi)) {
    const name = String(match[1]);
    if (name !== "schema_migrations") names.push(name);
  }
  return [...new Set(names)];
}

function splitIdentifiers(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
}

function extractRule(definition, rule) {
  const match = new RegExp(`\\bON\\s+${rule}\\s+(CASCADE|SET\\s+NULL|RESTRICT|NO\\s+ACTION)\\b`, "i").exec(definition);
  return match ? match[1].replace(/\s+/g, " ").toUpperCase() : "RESTRICT";
}

function extractBaselineForeignKeys(sql) {
  const foreignKeys = [];
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;

  for (const tableMatch of sql.matchAll(tablePattern)) {
    const tableName = String(tableMatch[1]);
    const body = String(tableMatch[2]);
    const constraintPattern = /\bCONSTRAINT\s+([A-Za-z0-9_]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([A-Za-z0-9_]+)\s*\(([^)]+)\)([^,\n]*)/gi;

    for (const match of body.matchAll(constraintPattern)) {
      const columns = splitIdentifiers(match[2]);
      const referencedColumns = splitIdentifiers(match[4]);
      if (columns.length === 0 || columns.length !== referencedColumns.length) {
        throw new Error(`Foreign key ${match[1]} do baseline possui definição de colunas inválida`);
      }

      foreignKeys.push({
        constraintName: String(match[1]),
        tableName,
        referencedTableName: String(match[3]),
        columns: columns.map((columnName, index) => ({
          columnName,
          referencedColumnName: referencedColumns[index],
        })),
        deleteRule: extractRule(match[5], "DELETE"),
        updateRule: extractRule(match[5], "UPDATE"),
      });
    }
  }

  const byName = new Map();
  for (const foreignKey of foreignKeys) {
    if (byName.has(foreignKey.constraintName)) {
      throw new Error(`Foreign key duplicada no baseline: ${foreignKey.constraintName}`);
    }
    byName.set(foreignKey.constraintName, foreignKey);
  }
  return [...byName.values()];
}

function groupActualForeignKeys(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const name = String(row.constraint_name);
    if (!grouped.has(name)) {
      grouped.set(name, {
        constraintName: name,
        tableName: String(row.table_name),
        referencedTableName: String(row.referenced_table_name),
        deleteRule: String(row.delete_rule || "").toUpperCase(),
        updateRule: String(row.update_rule || "").toUpperCase(),
        columns: [],
      });
    }
    grouped.get(name).columns.push({
      columnName: String(row.column_name),
      referencedColumnName: String(row.referenced_column_name),
      ordinalPosition: Number(row.ordinal_position),
    });
  }

  return new Map(
    [...grouped.entries()].map(([name, foreignKey]) => [
      name,
      {
        ...foreignKey,
        columns: foreignKey.columns
          .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
          .map(({ columnName, referencedColumnName }) => ({ columnName, referencedColumnName })),
      },
    ]),
  );
}

function validateForeignKeyDefinitions(expectedForeignKeys, actualByName) {
  const problems = [];
  const expectedNames = new Set(expectedForeignKeys.map(({ constraintName }) => constraintName));

  for (const expected of expectedForeignKeys) {
    const actual = actualByName.get(expected.constraintName);
    if (!actual) {
      problems.push(`${expected.constraintName}: ausente`);
      continue;
    }

    const sameColumns =
      actual.columns.length === expected.columns.length &&
      actual.columns.every((column, index) =>
        column.columnName === expected.columns[index].columnName &&
        column.referencedColumnName === expected.columns[index].referencedColumnName,
      );

    if (
      actual.tableName !== expected.tableName ||
      actual.referencedTableName !== expected.referencedTableName ||
      !sameColumns
    ) {
      const actualColumns = actual.columns
        .map(({ columnName, referencedColumnName }) => `${columnName}->${referencedColumnName}`)
        .join(",");
      const expectedColumns = expected.columns
        .map(({ columnName, referencedColumnName }) => `${columnName}->${referencedColumnName}`)
        .join(",");
      problems.push(
        `${expected.constraintName}: definição divergente ` +
        `(${actual.tableName}[${actualColumns}] -> ${actual.referencedTableName}; ` +
        `esperado ${expected.tableName}[${expectedColumns}] -> ${expected.referencedTableName})`,
      );
    }

    if (actual.deleteRule !== expected.deleteRule) {
      problems.push(
        `${expected.constraintName}: ON DELETE ${actual.deleteRule || "desconhecido"}; esperado ${expected.deleteRule}`,
      );
    }
    if (actual.updateRule !== expected.updateRule) {
      problems.push(
        `${expected.constraintName}: ON UPDATE ${actual.updateRule || "desconhecido"}; esperado ${expected.updateRule}`,
      );
    }
  }

  for (const actual of actualByName.values()) {
    if (!expectedNames.has(actual.constraintName)) {
      const columns = actual.columns
        .map(({ columnName, referencedColumnName }) => `${columnName}->${referencedColumnName}`)
        .join(",");
      problems.push(
        `${actual.constraintName}: foreign key inesperada ` +
        `(${actual.tableName}[${columns}] -> ${actual.referencedTableName})`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Baseline MySQL legado possui foreign keys divergentes do 001_schema.sql: ${problems.join("; ")}. ` +
      "O runner não deve registrar o baseline automaticamente nesse estado.",
    );
  }
}

function groupActualIndexes(rows) {
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
      { ...index, columns: index.columns.sort((a, b) => a.sequence - b.sequence) },
    ]),
  );
}

function validateCriticalUniqueIndexes(actualByKey) {
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

    const prefixed = actual.columns.filter(({ prefixLength }) => prefixLength !== null);
    if (prefixed.length > 0) {
      problems.push(
        `${tableName}.${indexName}: possui prefixo parcial em ${prefixed
          .map(({ columnName, prefixLength }) => `${columnName}(${prefixLength})`)
          .join(",")}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Baseline MySQL legado possui índices UNIQUE críticos divergentes: ${problems.join("; ")}. ` +
      "O runner não deve registrar o baseline automaticamente nesse estado.",
    );
  }
}

async function sslOptions() {
  if (!config.db.ssl) return undefined;
  if (!config.db.caPath) return { rejectUnauthorized: true };
  const ca = await fs.readFile(config.db.caPath, "utf8");
  return { ca, rejectUnauthorized: true };
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT 1 AS ok
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function existingNames(connection, query, names) {
  if (names.length === 0) return new Set();
  const placeholders = names.map(() => "?").join(",");
  const [rows] = await connection.execute(query.replace("__NAMES__", placeholders), names);
  return new Set(rows.map((row) => String(row.name)));
}

async function main() {
  const sql = await fs.readFile(baselinePath, "utf8");
  const baselineTables = extractBaselineTableNames(sql);
  const baselineForeignKeys = extractBaselineForeignKeys(sql);

  if (baselineTables.length === 0) {
    throw new Error("Não foi possível extrair as tabelas do baseline 001_schema.sql");
  }
  if (baselineForeignKeys.length === 0) {
    throw new Error("Não foi possível extrair as foreign keys do baseline 001_schema.sql");
  }

  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: await sslOptions(),
    charset: "utf8mb4",
    timezone: "Z",
  });

  try {
    if (await tableExists(connection, "schema_migrations")) {
      const [rows] = await connection.query("SELECT COUNT(*) AS total FROM schema_migrations");
      if (Number(rows?.[0]?.total ?? 0) > 0) {
        console.log("[segempat-api] histórico de migrations já existe; validação de baseline legado dispensada");
        return;
      }
    }

    const foundTables = await existingNames(
      connection,
      `SELECT table_name AS name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (__NAMES__)`,
      baselineTables,
    );

    if (foundTables.size === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
      return;
    }

    const missingTables = baselineTables.filter((name) => !foundTables.has(name));
    if (missingTables.length > 0) {
      throw new Error(
        `Baseline MySQL legado está incompleto; tabelas ausentes: ${missingTables.join(", ")}`,
      );
    }

    const tablePlaceholders = baselineTables.map(() => "?").join(",");
    const [foreignKeyRows] = await connection.execute(
      `SELECT kcu.constraint_name,
              kcu.table_name,
              kcu.column_name,
              kcu.referenced_table_name,
              kcu.referenced_column_name,
              kcu.ordinal_position,
              rc.delete_rule,
              rc.update_rule
         FROM information_schema.key_column_usage AS kcu
         JOIN information_schema.referential_constraints AS rc
           ON rc.constraint_schema = kcu.constraint_schema
          AND rc.constraint_name = kcu.constraint_name
          AND rc.table_name = kcu.table_name
        WHERE kcu.constraint_schema = DATABASE()
          AND kcu.referenced_table_name IS NOT NULL
          AND (
            kcu.table_name IN (${tablePlaceholders})
            OR kcu.referenced_table_name IN (${tablePlaceholders})
          )
        ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position`,
      [...baselineTables, ...baselineTables],
    );

    validateForeignKeyDefinitions(baselineForeignKeys, groupActualForeignKeys(foreignKeyRows));

    const indexTables = [...new Set(REQUIRED_UNIQUE_INDEXES.map(([tableName]) => tableName))];
    const indexNames = [...new Set(REQUIRED_UNIQUE_INDEXES.map(([, indexName]) => indexName))];
    const indexTablePlaceholders = indexTables.map(() => "?").join(",");
    const indexNamePlaceholders = indexNames.map(() => "?").join(",");
    const [indexRows] = await connection.execute(
      `SELECT table_name,
              index_name,
              non_unique,
              seq_in_index,
              column_name,
              sub_part
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name IN (${indexTablePlaceholders})
          AND index_name IN (${indexNamePlaceholders})
        ORDER BY table_name, index_name, seq_in_index`,
      [...indexTables, ...indexNames],
    );

    validateCriticalUniqueIndexes(groupActualIndexes(indexRows));

    console.log(
      `[segempat-api] baseline legado pré-validado: ${baselineTables.length} tabelas, ` +
      `${baselineForeignKeys.length} foreign keys exatas (sem extras nem referências externas) e ` +
      `${REQUIRED_UNIQUE_INDEXES.length} índices UNIQUE críticos corretos`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação do baseline legado falhou", error?.message || error);
  process.exit(1);
});
