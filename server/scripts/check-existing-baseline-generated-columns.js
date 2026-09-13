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

function extractParenthesized(value, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openIndex; index < value.length; index += 1) {
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
      depth -= 1;
      if (depth === 0) return value.slice(openIndex + 1, index);
    }
  }

  throw new Error(`Expressão GENERATED sem fechamento de parênteses: ${value}`);
}

function stripBalancedOuterParentheses(value) {
  let current = value.trim();
  while (current.startsWith("(") && current.endsWith(")")) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let closesAtEnd = false;

    for (let index = 0; index < current.length; index += 1) {
      const char = current[index];
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
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          closesAtEnd = index === current.length - 1;
          break;
        }
      }
    }

    if (!closesAtEnd) break;
    current = current.slice(1, -1).trim();
  }
  return current;
}

function normalizeExpression(value) {
  const source = stripBalancedOuterParentheses(String(value || "").trim()).replace(/`/g, "");
  let output = "";
  let quote = null;
  let escaped = false;
  let pendingSpace = false;

  for (const char of source) {
    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"') {
      if (pendingSpace && output && !/[\s(,=|]$/.test(output)) output += " ";
      pendingSpace = false;
      quote = char;
      output += char;
      continue;
    }

    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }

    if (pendingSpace && output && !/[\s(,=|]$/.test(output) && !/[),=|]/.test(char)) output += " ";
    pendingSpace = false;
    output += /[A-Z]/.test(char) ? char.toLowerCase() : char;
  }

  return output.trim();
}

function extractExpectedGeneratedColumns(sql) {
  const generatedColumns = [];
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;

  for (const tableMatch of sql.matchAll(tablePattern)) {
    const tableName = String(tableMatch[1]);
    if (tableName === "schema_migrations") continue;

    for (const definition of splitTopLevelDefinitions(String(tableMatch[2]))) {
      const generatedMatch = /\bGENERATED\s+ALWAYS\s+AS\s*\(/i.exec(definition);
      if (!generatedMatch) continue;

      const columnMatch = /^(?:`([^`]+)`|([A-Za-z0-9_]+))\s+/i.exec(definition.trim());
      if (!columnMatch) {
        throw new Error(`Não foi possível identificar a coluna GENERATED em ${tableName}: ${definition}`);
      }
      const openIndex = generatedMatch.index + generatedMatch[0].lastIndexOf("(");
      const expression = extractParenthesized(definition, openIndex);
      generatedColumns.push({
        tableName,
        columnName: columnMatch[1] || columnMatch[2],
        expression: normalizeExpression(expression),
        stored: /\bSTORED\b/i.test(definition),
      });
    }
  }

  return generatedColumns;
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
  const expected = extractExpectedGeneratedColumns(sql);
  if (expected.length === 0) {
    console.log("[segempat-api] baseline não possui colunas GENERATED; validação dispensada");
    return;
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
        console.log("[segempat-api] histórico de migrations já existe; validação de GENERATED do baseline legado dispensada");
        return;
      }
    }

    const tableNames = [...new Set(expected.map(({ tableName }) => tableName))];
    const placeholders = tableNames.map(() => "?").join(",");
    const [rows] = await connection.execute(
      `SELECT table_name, column_name, extra, generation_expression
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name IN (${placeholders})
        ORDER BY table_name, ordinal_position`,
      tableNames,
    );

    if (rows.length === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para validar");
      return;
    }

    const actualByKey = new Map(
      rows.map((row) => [
        `${row.table_name}\u0000${row.column_name}`,
        {
          expression: normalizeExpression(row.generation_expression),
          stored: String(row.extra || "").toLowerCase().includes("stored generated"),
        },
      ]),
    );

    const problems = [];
    for (const wanted of expected) {
      const key = `${wanted.tableName}\u0000${wanted.columnName}`;
      const actual = actualByKey.get(key);
      if (!actual) {
        problems.push(`${wanted.tableName}.${wanted.columnName}: coluna GENERATED ausente`);
        continue;
      }
      if (!actual.expression) {
        problems.push(`${wanted.tableName}.${wanted.columnName}: generation_expression ausente`);
      } else if (actual.expression !== wanted.expression) {
        problems.push(
          `${wanted.tableName}.${wanted.columnName}: expressão GENERATED divergente; ` +
          `detectado ${actual.expression}; esperado ${wanted.expression}`,
        );
      }
      if (actual.stored !== wanted.stored) {
        problems.push(
          `${wanted.tableName}.${wanted.columnName}: ${actual.stored ? "STORED" : "VIRTUAL"}; ` +
          `esperado ${wanted.stored ? "STORED" : "VIRTUAL"}`,
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Baseline MySQL legado possui colunas GENERATED divergentes do 001_schema.sql: ${problems.join("; ")}. ` +
        "O runner não deve registrar o baseline automaticamente nesse estado.",
      );
    }

    console.log(`[segempat-api] colunas GENERATED do baseline legado OK; ${expected.length} expressões exatas`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de colunas GENERATED do baseline legado falhou", error?.message || error);
  process.exit(1);
});
