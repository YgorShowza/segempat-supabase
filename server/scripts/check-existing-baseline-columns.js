import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, "../../database/mysql/001_schema.sql");
const BASELINE_CHARACTER_SET = "utf8mb4";
const BASELINE_COLLATION = "utf8mb4_unicode_ci";
const TEXTUAL_TYPES = new Set(["char", "varchar", "tinytext", "text", "mediumtext", "longtext"]);

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

function normalizeColumnType(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function baseColumnType(columnType) {
  return String(columnType || "").split("(", 1)[0].toLowerCase();
}

function normalizeDefault(value) {
  if (value == null) return null;
  return String(value)
    .trim()
    .replace(/^'(.*)'$/s, "$1")
    .replace(/''/g, "'")
    .toLowerCase();
}

function parseExpectedColumn(tableName, definition) {
  const columnMatch = /^(?:`([^`]+)`|([A-Za-z0-9_]+))\s+([A-Za-z]+(?:\s*\([^)]*\))?)([\s\S]*)$/i.exec(definition.trim());
  if (!columnMatch) {
    throw new Error(`Não foi possível interpretar uma definição de coluna em ${tableName}: ${definition}`);
  }

  const name = columnMatch[1] || columnMatch[2];
  const columnType = normalizeColumnType(columnMatch[3]);
  const textual = TEXTUAL_TYPES.has(baseColumnType(columnType));
  const remainder = String(columnMatch[4] || "");
  const generated = /\bGENERATED\s+ALWAYS\s+AS\s*\(/i.test(remainder);
  const storedGenerated = generated && /\bSTORED\b/i.test(remainder);
  const nullable = !/\bNOT\s+NULL\b/i.test(remainder);
  const defaultMatch = /\bDEFAULT\s+(CURRENT_TIMESTAMP(?:\s*\(\s*\d+\s*\))?|NULL|'(?:''|[^'])*'|-?\d+(?:\.\d+)?)/i.exec(remainder);
  const hasDefault = Boolean(defaultMatch);
  const defaultValue = defaultMatch ? normalizeDefault(defaultMatch[1]) : null;
  const onUpdateMatch = /\bON\s+UPDATE\s+(CURRENT_TIMESTAMP(?:\s*\(\s*\d+\s*\))?)/i.exec(remainder);
  const onUpdate = onUpdateMatch ? normalizeDefault(onUpdateMatch[1]) : null;

  return {
    name,
    columnType,
    nullable,
    hasDefault,
    defaultValue,
    generated,
    storedGenerated,
    onUpdate,
    characterSet: textual ? BASELINE_CHARACTER_SET : null,
    collation: textual ? BASELINE_COLLATION : null,
  };
}

function extractBaselineColumns(sql) {
  const tables = new Map();
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;
  const nonColumnPrefixes = /^(PRIMARY\s+KEY|UNIQUE\s+KEY|KEY\s+|CONSTRAINT\s+|CHECK\s*\()/i;

  for (const match of sql.matchAll(tablePattern)) {
    const tableName = String(match[1]);
    if (tableName === "schema_migrations") continue;

    const columns = [];
    const names = new Set();
    for (const definition of splitTopLevelDefinitions(String(match[2]))) {
      const normalized = definition.trim();
      if (!normalized || nonColumnPrefixes.test(normalized)) continue;

      const column = parseExpectedColumn(tableName, normalized);
      if (names.has(column.name)) {
        throw new Error(`Coluna duplicada no baseline ${tableName}.${column.name}`);
      }
      names.add(column.name);
      columns.push(column);
    }

    if (columns.length === 0) {
      throw new Error(`Nenhuma coluna foi extraída do baseline para a tabela ${tableName}`);
    }
    tables.set(tableName, columns);
  }

  return tables;
}

function describeActual(row) {
  return {
    name: String(row.column_name),
    columnType: normalizeColumnType(row.column_type),
    nullable: String(row.is_nullable).toUpperCase() === "YES",
    defaultValue: normalizeDefault(row.column_default),
    extra: String(row.extra || "").toLowerCase(),
    generationExpression: String(row.generation_expression || "").trim(),
    characterSet: row.character_set_name == null ? null : String(row.character_set_name).toLowerCase(),
    collation: row.collation_name == null ? null : String(row.collation_name).toLowerCase(),
  };
}

function validateColumnDefinition(tableName, expected, actual, problems) {
  const label = `${tableName}.${expected.name}`;

  if (actual.columnType !== expected.columnType) {
    problems.push(`${label}: tipo=${actual.columnType || "desconhecido"}; esperado ${expected.columnType}`);
  }
  if (!expected.generated && actual.nullable !== expected.nullable) {
    problems.push(`${label}: nullable=${actual.nullable ? "YES" : "NO"}; esperado ${expected.nullable ? "YES" : "NO"}`);
  }

  if (actual.characterSet !== expected.characterSet) {
    problems.push(
      `${label}: charset=${actual.characterSet ?? "ausente"}; esperado ${expected.characterSet ?? "ausente"}`,
    );
  }
  if (actual.collation !== expected.collation) {
    problems.push(
      `${label}: collation=${actual.collation ?? "ausente"}; esperado ${expected.collation ?? "ausente"}`,
    );
  }

  const actualGenerated = actual.extra.includes("generated") || Boolean(actual.generationExpression);
  const actualStored = actual.extra.includes("stored generated");
  if (actualGenerated !== expected.generated) {
    problems.push(`${label}: generated=${actualGenerated}; esperado ${expected.generated}`);
  } else if (expected.generated) {
    if (!actual.generationExpression) {
      problems.push(`${label}: expressão GENERATED ausente`);
    }
    if (expected.storedGenerated && !actualStored) {
      problems.push(`${label}: coluna GENERATED não está STORED`);
    }
  }

  if (!expected.generated) {
    if (expected.hasDefault) {
      if (actual.defaultValue !== expected.defaultValue) {
        problems.push(
          `${label}: default=${actual.defaultValue ?? "NULL"}; esperado ${expected.defaultValue ?? "NULL"}`,
        );
      }
    } else if (actual.defaultValue !== null) {
      problems.push(`${label}: possui default inesperado ${actual.defaultValue}`);
    }
  }

  const actualOnUpdateMatch = /on update\s+(current_timestamp(?:\(\d+\))?)/i.exec(actual.extra);
  const actualOnUpdate = actualOnUpdateMatch ? normalizeDefault(actualOnUpdateMatch[1]) : null;
  if (actualOnUpdate !== expected.onUpdate) {
    problems.push(`${label}: ON UPDATE=${actualOnUpdate ?? "ausente"}; esperado ${expected.onUpdate ?? "ausente"}`);
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
  const expectedByTable = extractBaselineColumns(sql);
  if (expectedByTable.size === 0) {
    throw new Error("Não foi possível extrair as colunas do baseline 001_schema.sql");
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
        console.log("[segempat-api] histórico de migrations já existe; validação de colunas do baseline legado dispensada");
        return;
      }
    }

    const tableNames = [...expectedByTable.keys()];
    const placeholders = tableNames.map(() => "?").join(",");
    const [rows] = await connection.execute(
      `SELECT table_name,
              column_name,
              column_type,
              is_nullable,
              column_default,
              extra,
              generation_expression,
              character_set_name,
              collation_name
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

    const actualByTable = new Map();
    for (const row of rows) {
      const tableName = String(row.table_name);
      if (!actualByTable.has(tableName)) actualByTable.set(tableName, new Map());
      const actual = describeActual(row);
      actualByTable.get(tableName).set(actual.name, actual);
    }

    const problems = [];
    let expectedColumnCount = 0;
    for (const [tableName, expectedColumns] of expectedByTable) {
      expectedColumnCount += expectedColumns.length;
      const actualColumns = actualByTable.get(tableName);
      if (!actualColumns) {
        problems.push(`${tableName}: tabela ausente`);
        continue;
      }

      const expectedNames = new Set(expectedColumns.map(({ name }) => name));
      const unexpectedColumns = [...actualColumns.keys()].filter((name) => !expectedNames.has(name));
      if (unexpectedColumns.length > 0) {
        problems.push(`${tableName}: colunas inesperadas [${unexpectedColumns.join(", ")}]`);
      }

      for (const expected of expectedColumns) {
        const actual = actualColumns.get(expected.name);
        if (!actual) {
          problems.push(`${tableName}.${expected.name}: coluna ausente`);
          continue;
        }
        validateColumnDefinition(tableName, expected, actual, problems);
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Baseline MySQL legado possui colunas divergentes do 001_schema.sql: ${problems.join("; ")}. ` +
        "O runner não deve registrar o baseline automaticamente nesse estado.",
      );
    }

    console.log(
      `[segempat-api] definições de colunas do baseline legado OK; ${expectedByTable.size} tabelas e ` +
      `${expectedColumnCount} colunas exatas, inclusive charset/collation`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] validação de colunas do baseline legado falhou", error?.message || error);
  process.exit(1);
});
