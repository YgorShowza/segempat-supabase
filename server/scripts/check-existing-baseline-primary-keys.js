import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

function splitIdentifiers(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
}

function extractBaselinePrimaryKeys(sql) {
  const primaryKeys = new Map();
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;

  for (const tableMatch of sql.matchAll(tablePattern)) {
    const tableName = String(tableMatch[1]);
    if (tableName === "schema_migrations") continue;

    const body = String(tableMatch[2]);
    const matches = [...body.matchAll(/\bPRIMARY\s+KEY\s*\(([^)]+)\)/gi)];
    if (matches.length !== 1) {
      throw new Error(
        `Baseline ${tableName} deve declarar exatamente uma PRIMARY KEY; encontradas ${matches.length}`,
      );
    }

    const columns = splitIdentifiers(matches[0][1]);
    if (columns.length === 0) {
      throw new Error(`PRIMARY KEY do baseline ${tableName} não possui colunas válidas`);
    }
    primaryKeys.set(tableName, columns);
  }

  return primaryKeys;
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
  const expectedByTable = extractBaselinePrimaryKeys(sql);
  if (expectedByTable.size === 0) {
    throw new Error("Não foi possível extrair as PRIMARY KEYs do baseline 001_schema.sql");
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
        console.log("[segempat-api] histórico de migrations já existe; validação de PRIMARY KEY do baseline legado dispensada");
        return;
      }
    }

    const tableNames = [...expectedByTable.keys()];
    const placeholders = tableNames.map(() => "?").join(",");
    const [rows] = await connection.execute(
      `SELECT table_name,
              non_unique,
              seq_in_index,
              column_name,
              sub_part
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name IN (${placeholders})
          AND index_name = 'PRIMARY'
        ORDER BY table_name, seq_in_index`,
      tableNames,
    );

    if (rows.length === 0) {
      const [tableRows] = await connection.execute(
        `SELECT COUNT(*) AS total
           FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name IN (${placeholders})`,
        tableNames,
      );
      if (Number(tableRows?.[0]?.total ?? 0) === 0) {
        console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
        return;
      }
    }

    const actualByTable = new Map();
    for (const row of rows) {
      const tableName = String(row.table_name);
      if (!actualByTable.has(tableName)) {
        actualByTable.set(tableName, {
          nonUnique: Number(row.non_unique),
          columns: [],
        });
      }
      actualByTable.get(tableName).columns.push({
        columnName: String(row.column_name),
        sequence: Number(row.seq_in_index),
        prefixLength: row.sub_part == null ? null : Number(row.sub_part),
      });
    }

    const problems = [];
    for (const [tableName, expectedColumns] of expectedByTable) {
      const actual = actualByTable.get(tableName);
      if (!actual) {
        problems.push(`${tableName}: PRIMARY KEY ausente`);
        continue;
      }

      const orderedColumns = actual.columns
        .sort((a, b) => a.sequence - b.sequence)
        .map(({ columnName }) => columnName);
      const exactColumns =
        orderedColumns.length === expectedColumns.length &&
        orderedColumns.every((columnName, index) => columnName === expectedColumns[index]);

      if (!exactColumns) {
        problems.push(
          `${tableName}: PRIMARY KEY [${orderedColumns.join(",")}] divergente; esperado [${expectedColumns.join(",")}]`,
        );
      }
      if (actual.nonUnique !== 0) {
        problems.push(`${tableName}: índice PRIMARY não está marcado como único`);
      }
      const prefixed = actual.columns.filter(({ prefixLength }) => prefixLength !== null);
      if (prefixed.length > 0) {
        problems.push(
          `${tableName}: PRIMARY KEY possui prefixo parcial em ${prefixed
            .map(({ columnName, prefixLength }) => `${columnName}(${prefixLength})`)
            .join(",")}`,
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Baseline MySQL legado possui PRIMARY KEYs divergentes do 001_schema.sql: ${problems.join("; ")}. ` +
        "O runner não deve registrar o baseline automaticamente nesse estado.",
      );
    }

    console.log(
      `[segempat-api] PRIMARY KEYs do baseline legado OK; ${expectedByTable.size} tabela(s) validada(s)`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de PRIMARY KEY do baseline legado falhou", error?.message || error);
  process.exit(1);
});
