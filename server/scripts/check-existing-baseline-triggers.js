import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

function extractBaselineTableNames(sql) {
  const names = [];
  for (const match of sql.matchAll(/\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)/gi)) {
    const name = String(match[1]);
    if (name !== "schema_migrations") names.push(name);
  }
  return [...new Set(names)];
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
  const baselineTables = extractBaselineTableNames(sql);
  if (baselineTables.length === 0) {
    throw new Error("Não foi possível extrair as tabelas do baseline 001_schema.sql");
  }

  if (/\bCREATE\s+TRIGGER\b/i.test(sql)) {
    throw new Error(
      "O baseline 001_schema.sql passou a declarar triggers. Atualize o validador de triggers antes de permitir registro automático do baseline.",
    );
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
        console.log("[segempat-api] histórico de migrations já existe; validação de triggers do baseline legado dispensada");
        return;
      }
    }

    const placeholders = baselineTables.map(() => "?").join(",");
    const [existingRows] = await connection.execute(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${placeholders})`,
      baselineTables,
    );
    if (existingRows.length === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
      return;
    }

    const [triggerRows] = await connection.execute(
      `SELECT trigger_name, event_object_table, event_manipulation, action_timing
         FROM information_schema.triggers
        WHERE trigger_schema = DATABASE()
          AND event_object_table IN (${placeholders})
        ORDER BY event_object_table, trigger_name`,
      baselineTables,
    );

    if (triggerRows.length > 0) {
      const details = triggerRows
        .map((row) =>
          `${row.event_object_table}.${row.trigger_name} (${row.action_timing} ${row.event_manipulation})`,
        )
        .join(", ");
      throw new Error(
        `Baseline MySQL legado possui triggers não declaradas no 001_schema.sql: ${details}. ` +
        "Triggers podem alterar gravações e não são seguras para registro automático do baseline.",
      );
    }

    console.log(
      `[segempat-api] baseline legado sem triggers inesperadas nas ${baselineTables.length} tabelas funcionais`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de triggers do baseline legado falhou", error?.message || error);
  process.exit(1);
});
