import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\" && quote !== "`") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseIndexColumn(indexName, token) {
  const match = /^(?:`([^`]+)`|([A-Za-z0-9_]+))(?:\s*\(\s*(\d+)\s*\))?(?:\s+(ASC|DESC))?$/i.exec(token.trim());
  if (!match) {
    throw new Error(`Não foi possível interpretar a coluna do índice ${indexName}: ${token}`);
  }
  return {
    columnName: match[1] || match[2],
    prefixLength: match[3] == null ? null : Number(match[3]),
    direction: String(match[4] || "ASC").toUpperCase(),
  };
}

function extractExpectedIndexes(sql) {
  const indexes = [];
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;

  for (const tableMatch of sql.matchAll(tablePattern)) {
    const tableName = String(tableMatch[1]);
    if (tableName === "schema_migrations") continue;

    for (const definition of splitTopLevel(String(tableMatch[2]))) {
      const match = /^(UNIQUE\s+)?KEY\s+(?:`([^`]+)`|([A-Za-z0-9_]+))\s*\((.*)\)$/is.exec(definition.trim());
      if (!match) continue;

      const indexName = match[2] || match[3];
      const columns = splitTopLevel(String(match[4])).map((token) => parseIndexColumn(indexName, token));
      if (columns.length === 0) {
        throw new Error(`Índice ${tableName}.${indexName} sem colunas no baseline`);
      }
      indexes.push({
        tableName,
        indexName,
        unique: Boolean(match[1]),
        columns,
      });
    }
  }

  const keys = new Set();
  for (const index of indexes) {
    const key = `${index.tableName}\u0000${index.indexName}`;
    if (keys.has(key)) throw new Error(`Índice duplicado no baseline: ${index.tableName}.${index.indexName}`);
    keys.add(key);
  }
  return indexes;
}

function groupActualIndexes(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.table_name}\u0000${row.index_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        tableName: String(row.table_name),
        indexName: String(row.index_name),
        unique: Number(row.non_unique) === 0,
        columns: [],
      });
    }
    grouped.get(key).columns.push({
      columnName: String(row.column_name),
      prefixLength: row.sub_part == null ? null : Number(row.sub_part),
      direction: String(row.collation || "A").toUpperCase() === "D" ? "DESC" : "ASC",
      sequence: Number(row.seq_in_index),
    });
  }

  for (const index of grouped.values()) {
    index.columns.sort((a, b) => a.sequence - b.sequence);
  }
  return grouped;
}

function formatColumns(columns) {
  return columns
    .map(({ columnName, prefixLength, direction }) =>
      `${columnName}${prefixLength == null ? "" : `(${prefixLength})`}${direction === "DESC" ? " DESC" : ""}`,
    )
    .join(", ");
}

function validateIndexes(expectedIndexes, actualByKey) {
  const problems = [];
  const expectedByKey = new Map(
    expectedIndexes.map((index) => [`${index.tableName}\u0000${index.indexName}`, index]),
  );

  for (const expected of expectedIndexes) {
    const actual = actualByKey.get(`${expected.tableName}\u0000${expected.indexName}`);
    if (!actual) {
      problems.push(`${expected.tableName}.${expected.indexName}: ausente`);
      continue;
    }
    if (actual.unique !== expected.unique) {
      problems.push(
        `${expected.tableName}.${expected.indexName}: ${actual.unique ? "UNIQUE" : "não UNIQUE"}; ` +
        `esperado ${expected.unique ? "UNIQUE" : "não UNIQUE"}`,
      );
    }

    const exactColumns =
      actual.columns.length === expected.columns.length &&
      actual.columns.every((column, index) => {
        const wanted = expected.columns[index];
        return column.columnName === wanted.columnName &&
          column.prefixLength === wanted.prefixLength &&
          column.direction === wanted.direction;
      });

    if (!exactColumns) {
      problems.push(
        `${expected.tableName}.${expected.indexName}: colunas [${formatColumns(actual.columns)}]; ` +
        `esperado [${formatColumns(expected.columns)}]`,
      );
    }
  }

  for (const [key, actual] of actualByKey) {
    if (actual.unique && !expectedByKey.has(key)) {
      problems.push(
        `${actual.tableName}.${actual.indexName}: índice UNIQUE inesperado em [${formatColumns(actual.columns)}]`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Baseline MySQL legado possui índices secundários explícitos divergentes do 001_schema.sql: ${problems.join("; ")}. ` +
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

async function main() {
  const sql = await fs.readFile(baselinePath, "utf8");
  const expectedIndexes = extractExpectedIndexes(sql);
  if (expectedIndexes.length === 0) {
    throw new Error("Não foi possível extrair os índices secundários explícitos do baseline 001_schema.sql");
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
      const [historyRows] = await connection.query("SELECT COUNT(*) AS total FROM schema_migrations");
      if (Number(historyRows?.[0]?.total ?? 0) > 0) {
        console.log("[segempat-api] histórico de migrations já existe; validação de índices do baseline legado dispensada");
        return;
      }
    }

    const tableNames = [...new Set(expectedIndexes.map(({ tableName }) => tableName))];
    const tablePlaceholders = tableNames.map(() => "?").join(",");
    const [existingRows] = await connection.execute(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${tablePlaceholders})`,
      tableNames,
    );
    if (existingRows.length === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
      return;
    }

    const [rows] = await connection.execute(
      `SELECT table_name,
              index_name,
              non_unique,
              seq_in_index,
              column_name,
              sub_part,
              collation
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name IN (${tablePlaceholders})
          AND index_name <> 'PRIMARY'
        ORDER BY table_name, index_name, seq_in_index`,
      tableNames,
    );

    validateIndexes(expectedIndexes, groupActualIndexes(rows));
    console.log(
      `[segempat-api] índices secundários explícitos do baseline legado OK; ${expectedIndexes.length} definições exatas e nenhum UNIQUE extra`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de índices do baseline legado falhou", error?.message || error);
  process.exit(1);
});
