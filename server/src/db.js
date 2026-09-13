import fs from "node:fs";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

function sslOptions() {
  if (!config.db.ssl) return false;
  if (config.db.caPath) {
    if (!fs.existsSync(config.db.caPath)) {
      throw new Error(`[segempat-api] certificado CA do PostgreSQL não encontrado: ${config.db.caPath}`);
    }
    return { ca: fs.readFileSync(config.db.caPath, "utf8"), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

function normalizedConnectionString() {
  const url = new URL(config.db.url);
  // A política TLS é controlada explicitamente por POSTGRES_SSL/CA. Removemos
  // opções SSL da URL para que uma connection string copiada do Supabase não
  // sobrescreva silenciosamente a validação definida pela API.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(key);
  }
  return url.toString();
}

export const pool = new Pool({
  connectionString: normalizedConnectionString(),
  ssl: sslOptions(),
  max: config.db.poolSize,
  application_name: "segempat-api",
});

const UNSUPPORTED_MYSQL_SQL = [
  /\bON\s+DUPLICATE\s+KEY\b/i,
  /\bINSERT\s+IGNORE\b/i,
  /\bLAST_INSERT_ID\s*\(/i,
  /\bDATE_FORMAT\s*\(/i,
  /\bDATE_SUB\s*\(/i,
  /\bDATE_ADD\s*\(/i,
  /\bJSON_EXTRACT\s*\(/i,
  /\bJSON_UNQUOTE\s*\(/i,
  /\bIFNULL\s*\(/i,
];

function assertNoUnsupportedMysqlSyntax(sql) {
  const found = UNSUPPORTED_MYSQL_SQL.find((pattern) => pattern.test(sql));
  if (found) {
    throw new Error(`[segempat-api] SQL MySQL ainda não portado para PostgreSQL: ${String(found)}`);
  }
}

function normalizeCommonSql(sql) {
  return String(sql)
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\bUTC_TIMESTAMP\(3\)/gi, "CURRENT_TIMESTAMP(3)")
    .replace(/\bUTC_TIMESTAMP\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bJSON_ARRAY\(\)/gi, "'[]'::jsonb")
    .replace(/\bJSON_OBJECT\(\)/gi, "'{}'::jsonb");
}

function postgresPlaceholders(sql) {
  let output = "";
  let parameter = 0;
  let quote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (quote) {
      output += char;
      if (char === quote) {
        if (next === quote) {
          output += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }

    if (char === "?") {
      parameter += 1;
      output += `$${parameter}`;
      continue;
    }

    output += char;
  }

  return output;
}

export function toPostgresSql(sql) {
  assertNoUnsupportedMysqlSyntax(sql);
  return postgresPlaceholders(normalizeCommonSql(sql));
}

function mysqlCompatibleResult(result) {
  if (result.command === "SELECT" || result.command === "SHOW") return result.rows;
  return {
    affectedRows: result.rowCount ?? 0,
    changedRows: result.rowCount ?? 0,
    insertId: 0,
    warningStatus: 0,
    rows: result.rows,
  };
}

async function run(client, sql, params = []) {
  const result = await client.query(toPostgresSql(sql), params);
  return mysqlCompatibleResult(result);
}

function compatibleConnection(client) {
  return {
    async execute(sql, params = []) {
      return [await run(client, sql, params)];
    },
    async query(sql, params = []) {
      return [await run(client, sql, params)];
    },
    async beginTransaction() {
      await client.query("BEGIN");
    },
    async commit() {
      await client.query("COMMIT");
    },
    async rollback() {
      await client.query("ROLLBACK");
    },
    release() {
      client.release();
    },
  };
}

async function getInitializedConnection() {
  const client = await pool.connect();
  try {
    await client.query("SET TIME ZONE 'UTC'");
    return compatibleConnection(client);
  } catch (error) {
    client.release(true);
    throw error;
  }
}

export async function query(sql, params = []) {
  const connection = await getInitializedConnection();
  try {
    const [rows] = await connection.execute(sql, params);
    return rows;
  } finally {
    connection.release();
  }
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql, params = []) {
  const connection = await getInitializedConnection();
  try {
    const [result] = await connection.execute(sql, params);
    return result;
  } finally {
    connection.release();
  }
}

/** Executa um callback dentro de uma transação PostgreSQL com rollback automático. */
export async function withTransaction(callback) {
  const connection = await getInitializedConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* conexão já perdida */
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function healthcheck() {
  await query("SELECT 1");
  return true;
}
