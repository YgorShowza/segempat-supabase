import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

function extractBaselineStorage(sql) {
  const tables = new Map();
  const pattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\([\s\S]*?\)\s*ENGINE\s*=\s*([A-Za-z0-9_]+)\s+DEFAULT\s+CHARSET\s*=\s*([A-Za-z0-9_]+)\s+COLLATE\s*=\s*([A-Za-z0-9_]+)\s*;/gi;

  for (const match of sql.matchAll(pattern)) {
    const tableName = String(match[1]);
    if (tableName === "schema_migrations") continue;
    if (tables.has(tableName)) {
      throw new Error(`Tabela duplicada no baseline ao extrair storage: ${tableName}`);
    }
    tables.set(tableName, {
      engine: String(match[2]),
      charset: String(match[3]),
      collation: String(match[4]),
    });
  }

  return tables;
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
  const expectedByTable = extractBaselineStorage(sql);
  const baselineTables = [...expectedByTable.keys()];
  if (baselineTables.length === 0) {
    throw new Error("Não foi possível extrair as configurações de storage do baseline 001_schema.sql");
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
        console.log("[segempat-api] histórico de migrations já existe; validação de storage do baseline legado dispensada");
        return;
      }
    }

    const placeholders = baselineTables.map(() => "?").join(",");
    const [rows] = await connection.execute(
      `SELECT t.table_name,
              t.engine,
              t.table_collation,
              c.character_set_name
         FROM information_schema.tables AS t
         LEFT JOIN information_schema.collation_character_set_applicability AS c
           ON c.collation_name = t.table_collation
        WHERE t.table_schema = DATABASE()
          AND t.table_name IN (${placeholders})
        ORDER BY t.table_name`,
      baselineTables,
    );

    if (rows.length === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
      return;
    }

    const found = new Set(rows.map((row) => String(row.table_name)));
    const missing = baselineTables.filter((tableName) => !found.has(tableName));
    if (missing.length > 0) {
      throw new Error(
        `Baseline MySQL legado está incompleto; tabelas ausentes: ${missing.join(", ")}. ` +
        "O runner não deve registrar o baseline automaticamente nesse estado.",
      );
    }

    const problems = [];
    for (const row of rows) {
      const tableName = String(row.table_name);
      const expected = expectedByTable.get(tableName);
      if (!expected) {
        problems.push(`${tableName}: tabela não mapeada no baseline`);
        continue;
      }

      const engine = String(row.engine || "");
      const collation = String(row.table_collation || "");
      const charset = String(row.character_set_name || "");

      if (engine.toLowerCase() !== expected.engine.toLowerCase()) {
        problems.push(`${tableName}: engine=${engine || "desconhecido"}; esperado ${expected.engine}`);
      }
      if (charset.toLowerCase() !== expected.charset.toLowerCase()) {
        problems.push(`${tableName}: charset=${charset || "desconhecido"}; esperado ${expected.charset}`);
      }
      if (collation.toLowerCase() !== expected.collation.toLowerCase()) {
        problems.push(`${tableName}: collation=${collation || "desconhecida"}; esperado ${expected.collation}`);
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Baseline MySQL legado possui configuração de storage divergente do 001_schema.sql: ${problems.join("; ")}. ` +
        "O runner não deve registrar 001_schema.sql automaticamente nesse estado.",
      );
    }

    const settings = [...new Set(
      [...expectedByTable.values()].map(({ engine, charset, collation }) => `${engine}/${charset}/${collation}`),
    )];
    console.log(
      `[segempat-api] storage do baseline legado OK; ${baselineTables.length} tabelas com configuração exata: ${settings.join(", ")}`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de storage do baseline legado falhou", error?.message || error);
  process.exit(1);
});
