import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

function extractBaselineDefinition(sql) {
  const tableNames = [];
  const foreignKeyNames = [];
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;

  for (const match of sql.matchAll(tablePattern)) {
    const tableName = String(match[1]);
    if (tableName === "schema_migrations") continue;
    tableNames.push(tableName);

    const body = String(match[2]);
    for (const fkMatch of body.matchAll(/\bCONSTRAINT\s+([A-Za-z0-9_]+)\s+FOREIGN\s+KEY\b/gi)) {
      foreignKeyNames.push(String(fkMatch[1]));
    }
  }

  return {
    tableNames: [...new Set(tableNames)],
    foreignKeyNames: [...new Set(foreignKeyNames)],
  };
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
  const { tableNames, foreignKeyNames } = extractBaselineDefinition(sql);
  if (tableNames.length === 0 || foreignKeyNames.length === 0) {
    throw new Error("Não foi possível extrair as tabelas e foreign keys do baseline 001_schema.sql");
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
        console.log("[segempat-api] histórico de migrations já existe; auditoria de FKs extras do baseline legado dispensada");
        return;
      }
    }

    const tablePlaceholders = tableNames.map(() => "?").join(",");
    const [existingRows] = await connection.execute(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${tablePlaceholders})`,
      tableNames,
    );
    if (existingRows.length === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para auditar FKs extras");
      return;
    }

    const [rows] = await connection.execute(
      `SELECT DISTINCT constraint_name, table_name
         FROM information_schema.key_column_usage
        WHERE constraint_schema = DATABASE()
          AND referenced_table_name IS NOT NULL
          AND table_name IN (${tablePlaceholders})
        ORDER BY table_name, constraint_name`,
      tableNames,
    );

    const expected = new Set(foreignKeyNames);
    const unexpected = rows
      .filter((row) => !expected.has(String(row.constraint_name)))
      .map((row) => `${row.table_name}.${row.constraint_name}`);

    if (unexpected.length > 0) {
      throw new Error(
        `Baseline MySQL legado possui foreign keys extras não declaradas no 001_schema.sql: ${unexpected.join(", ")}. ` +
        "FKs adicionais podem alterar regras de gravação/exclusão, então o baseline não deve ser registrado automaticamente.",
      );
    }

    console.log(
      `[segempat-api] nenhuma foreign key extra encontrada no baseline legado; ${foreignKeyNames.length} FKs esperadas`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] auditoria de FKs extras do baseline legado falhou", error?.message || error);
  process.exit(1);
});
