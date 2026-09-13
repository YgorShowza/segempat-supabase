import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

function splitTopLevel(body) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
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
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function extractExpectedColumns(sql) {
  const expected = [];
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;
  const nonColumnPrefixes = /^(PRIMARY\s+KEY|UNIQUE\s+KEY|KEY\s+|CONSTRAINT\s+|CHECK\s*\()/i;

  for (const tableMatch of sql.matchAll(tablePattern)) {
    const tableName = String(tableMatch[1]);
    if (tableName === "schema_migrations") continue;

    for (const definition of splitTopLevel(String(tableMatch[2]))) {
      const text = definition.trim();
      if (!text || nonColumnPrefixes.test(text)) continue;
      const match = /^(?:`([^`]+)`|([A-Za-z0-9_]+))\s+/i.exec(text);
      if (!match) throw new Error(`Não foi possível interpretar coluna em ${tableName}: ${text}`);
      expected.push({
        tableName,
        columnName: match[1] || match[2],
        autoIncrement: /\bAUTO_INCREMENT\b/i.test(text),
        invisible: /\bINVISIBLE\b/i.test(text),
      });
    }
  }

  if (expected.length === 0) throw new Error("Não foi possível extrair colunas do baseline 001_schema.sql");
  return expected;
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
  const expected = extractExpectedColumns(sql);
  const tableNames = [...new Set(expected.map(({ tableName }) => tableName))];

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
        console.log("[segempat-api] histórico de migrations já existe; validação de atributos de colunas do baseline legado dispensada");
        return;
      }
    }

    const placeholders = tableNames.map(() => "?").join(",");
    const [rows] = await connection.execute(
      `SELECT table_name, column_name, extra
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name IN (${placeholders})`,
      tableNames,
    );

    if (rows.length === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
      return;
    }

    const actualByKey = new Map(
      rows.map((row) => [`${row.table_name}\u0000${row.column_name}`, String(row.extra || "").toLowerCase()]),
    );
    const problems = [];

    for (const item of expected) {
      const label = `${item.tableName}.${item.columnName}`;
      const extra = actualByKey.get(`${item.tableName}\u0000${item.columnName}`);
      if (extra == null) continue;
      const actualAutoIncrement = extra.includes("auto_increment");
      const actualInvisible = extra.includes("invisible");

      if (actualAutoIncrement !== item.autoIncrement) {
        problems.push(`${label}: AUTO_INCREMENT=${actualAutoIncrement}; esperado ${item.autoIncrement}`);
      }
      if (actualInvisible !== item.invisible) {
        problems.push(`${label}: INVISIBLE=${actualInvisible}; esperado ${item.invisible}`);
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Baseline MySQL legado possui atributos de colunas divergentes do 001_schema.sql: ${problems.join("; ")}. ` +
        "AUTO_INCREMENT ou INVISIBLE inesperado pode alterar leitura e gravação; o runner não deve registrar o baseline automaticamente.",
      );
    }

    console.log(`[segempat-api] atributos AUTO_INCREMENT/INVISIBLE do baseline legado OK; ${expected.length} colunas validadas`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de atributos de colunas do baseline legado falhou", error?.message || error);
  process.exit(1);
});
