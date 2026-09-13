import fs from "node:fs";
import mysql from "mysql2/promise";
import { config } from "./config.js";

function sslOptions() {
  if (!config.db.ssl) return undefined;
  if (config.db.caPath) {
    if (!fs.existsSync(config.db.caPath)) {
      throw new Error(`[segempat-api] certificado CA do MySQL não encontrado: ${config.db.caPath}`);
    }
    return { ca: fs.readFileSync(config.db.caPath, "utf8"), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: sslOptions(),
  waitForConnections: true,
  connectionLimit: config.db.poolSize,
  queueLimit: 0,
  timezone: "Z",
  dateStrings: ["DATE"],
  namedPlaceholders: false,
  charset: "utf8mb4_unicode_ci",
});

const SESSION_INVARIANTS_SQL = `
  SET SESSION
    time_zone = '+00:00',
    foreign_key_checks = 1,
    sql_mode = CASE
      WHEN FIND_IN_SET('STRICT_TRANS_TABLES', @@SESSION.sql_mode) > 0
        OR FIND_IN_SET('STRICT_ALL_TABLES', @@SESSION.sql_mode) > 0
      THEN @@SESSION.sql_mode
      ELSE CONCAT_WS(',', NULLIF(@@SESSION.sql_mode, ''), 'STRICT_TRANS_TABLES')
    END
`;

// A inicialização precisa terminar antes da conexão ser usada. O evento `connection`
// do pool é síncrono, mas a query disparada dentro dele não bloqueia o primeiro checkout;
// portanto, cada checkout confirma explicitamente as invariantes antes da operação real.
// O modo estrito também é aplicado aqui para que a API não dependa apenas da configuração
// global do servidor MySQL ou da execução prévia do preflight. A verificação evita acumular
// STRICT_TRANS_TABLES repetidamente a cada reutilização da mesma conexão do pool.
async function getInitializedConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.query(SESSION_INVARIANTS_SQL);
    return connection;
  } catch (error) {
    connection.destroy();
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

/** Executa um callback dentro de uma transação com rollback automático. */
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
