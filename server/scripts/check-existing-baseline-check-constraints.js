import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");

function splitTopLevelDefinitions(body) {
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
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "," && depth === 0) {
      parts.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function stripBalancedOuterParentheses(value) {
  let text = String(value || "").trim();

  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let wrapsWholeExpression = true;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

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
      else if (char === ")") depth -= 1;

      if (depth === 0 && index < text.length - 1) {
        wrapsWholeExpression = false;
        break;
      }
    }

    if (!wrapsWholeExpression || depth !== 0) break;
    text = text.slice(1, -1).trim();
  }

  return text;
}

function normalizeCheckExpression(value) {
  return stripBalancedOuterParentheses(value)
    .replace(/`/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function extractBaselineTableNames(sql) {
  const names = [];
  for (const match of sql.matchAll(/\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)/gi)) {
    const name = String(match[1]);
    if (name !== "schema_migrations") names.push(name);
  }
  return [...new Set(names)];
}

function extractBaselineCheckConstraints(sql) {
  const constraints = [];
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;

  for (const tableMatch of sql.matchAll(tablePattern)) {
    const tableName = String(tableMatch[1]);
    if (tableName === "schema_migrations") continue;

    for (const definition of splitTopLevelDefinitions(String(tableMatch[2]))) {
      const match = /^CONSTRAINT\s+([A-Za-z0-9_]+)\s+CHECK\s*\(([\s\S]*)\)$/i.exec(definition.trim());
      if (!match) continue;

      const expression = normalizeCheckExpression(match[2]);
      if (!expression) {
        throw new Error(`CHECK ${match[1]} do baseline não possui expressão válida`);
      }

      constraints.push({
        tableName,
        constraintName: String(match[1]),
        expression,
      });
    }
  }

  const byName = new Map();
  for (const constraint of constraints) {
    if (byName.has(constraint.constraintName)) {
      throw new Error(`CHECK constraint duplicada no baseline: ${constraint.constraintName}`);
    }
    byName.set(constraint.constraintName, constraint);
  }

  return [...byName.values()];
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
  const tableNames = extractBaselineTableNames(sql);
  const expected = extractBaselineCheckConstraints(sql);
  if (tableNames.length === 0) {
    throw new Error("Não foi possível extrair as tabelas do baseline 001_schema.sql");
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
        console.log("[segempat-api] histórico de migrations já existe; validação de CHECK do baseline legado dispensada");
        return;
      }
    }

    const tablePlaceholders = tableNames.map(() => "?").join(",");
    const [presentRows] = await connection.execute(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${tablePlaceholders})`,
      tableNames,
    );

    if (presentRows.length === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
      return;
    }

    const [rows] = await connection.execute(
      `SELECT tc.table_name,
              tc.constraint_name,
              tc.enforced,
              cc.check_clause
         FROM information_schema.table_constraints AS tc
         JOIN information_schema.check_constraints AS cc
           ON cc.constraint_schema = tc.constraint_schema
          AND cc.constraint_name = tc.constraint_name
        WHERE tc.constraint_schema = DATABASE()
          AND tc.constraint_type = 'CHECK'
          AND tc.table_name IN (${tablePlaceholders})
        ORDER BY tc.table_name, tc.constraint_name`,
      tableNames,
    );

    const actualByName = new Map(
      rows.map((row) => [String(row.constraint_name), {
        tableName: String(row.table_name),
        expression: normalizeCheckExpression(row.check_clause),
        enforced: String(row.enforced || "").toUpperCase(),
      }]),
    );
    const expectedNames = new Set(expected.map(({ constraintName }) => constraintName));

    const problems = [];
    for (const item of expected) {
      const actual = actualByName.get(item.constraintName);
      if (!actual) {
        problems.push(`${item.tableName}.${item.constraintName}: ausente`);
        continue;
      }
      if (actual.tableName !== item.tableName) {
        problems.push(`${item.constraintName}: tabela=${actual.tableName}; esperado ${item.tableName}`);
      }
      if (actual.expression !== item.expression) {
        problems.push(
          `${item.tableName}.${item.constraintName}: expressão divergente (${actual.expression || "vazia"}; esperado ${item.expression})`,
        );
      }
      if (actual.enforced !== "YES") {
        problems.push(`${item.tableName}.${item.constraintName}: ENFORCED=${actual.enforced || "desconhecido"}; esperado YES`);
      }
    }

    for (const [constraintName, actual] of actualByName) {
      if (!expectedNames.has(constraintName)) {
        problems.push(
          `${actual.tableName}.${constraintName}: CHECK inesperado (${actual.expression || "expressão vazia"})`,
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Baseline MySQL legado possui CHECK constraints divergentes do 001_schema.sql: ${problems.join("; ")}. ` +
        "O runner não deve registrar o baseline automaticamente nesse estado.",
      );
    }

    console.log(
      `[segempat-api] CHECK constraints do baseline legado OK; ${expected.length} definição(ões) exata(s) e nenhuma extra`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de CHECK constraints do baseline legado falhou", error?.message || error);
  process.exit(1);
});
