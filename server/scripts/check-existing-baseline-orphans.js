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

function extractBaselineForeignKeys(sql) {
  const foreignKeys = [];
  const tablePattern = /\bCREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi;

  for (const tableMatch of sql.matchAll(tablePattern)) {
    const tableName = String(tableMatch[1]);
    const body = String(tableMatch[2]);
    const constraintPattern = /\bCONSTRAINT\s+([A-Za-z0-9_]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([A-Za-z0-9_]+)\s*\(([^)]+)\)/gi;

    for (const match of body.matchAll(constraintPattern)) {
      const columns = splitIdentifiers(match[2]);
      const referencedColumns = splitIdentifiers(match[4]);
      if (columns.length === 0 || columns.length !== referencedColumns.length) {
        throw new Error(`Foreign key ${match[1]} do baseline possui definição de colunas inválida`);
      }

      foreignKeys.push({
        constraintName: String(match[1]),
        tableName,
        referencedTableName: String(match[3]),
        columns: columns.map((columnName, index) => ({
          columnName,
          referencedColumnName: referencedColumns[index],
        })),
      });
    }
  }

  if (foreignKeys.length === 0) {
    throw new Error("Nenhuma foreign key foi extraída do baseline 001_schema.sql");
  }
  return foreignKeys;
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
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
  const foreignKeys = extractBaselineForeignKeys(sql);
  const requiredTables = [...new Set(
    foreignKeys.flatMap(({ tableName, referencedTableName }) => [tableName, referencedTableName]),
  )];

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
        console.log("[segempat-api] histórico de migrations já existe; auditoria de órfãos do baseline legado dispensada");
        return;
      }
    }

    const placeholders = requiredTables.map(() => "?").join(",");
    const [tableRows] = await connection.execute(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${placeholders})`,
      requiredTables,
    );
    const foundTables = new Set(tableRows.map((row) => String(row.table_name)));

    if (foundTables.size === 0) {
      console.log("[segempat-api] banco novo detectado; não há baseline legado para auditar órfãos");
      return;
    }

    const missingTables = requiredTables.filter((tableName) => !foundTables.has(tableName));
    if (missingTables.length > 0) {
      throw new Error(
        `Baseline MySQL legado incompleto durante auditoria de órfãos; tabelas ausentes: ${missingTables.join(", ")}`,
      );
    }

    const orphaned = [];
    for (const foreignKey of foreignKeys) {
      const childTable = quoteIdentifier(foreignKey.tableName);
      const parentTable = quoteIdentifier(foreignKey.referencedTableName);
      const joinCondition = foreignKey.columns
        .map(({ columnName, referencedColumnName }) =>
          `child.${quoteIdentifier(columnName)} = parent.${quoteIdentifier(referencedColumnName)}`,
        )
        .join(" AND ");
      const populatedChildColumns = foreignKey.columns
        .map(({ columnName }) => `child.${quoteIdentifier(columnName)} IS NOT NULL`)
        .join(" AND ");
      const parentProbe = `parent.${quoteIdentifier(foreignKey.columns[0].referencedColumnName)} IS NULL`;

      const [rows] = await connection.query(
        `SELECT COUNT(*) AS total
           FROM ${childTable} AS child
           LEFT JOIN ${parentTable} AS parent
             ON ${joinCondition}
          WHERE ${populatedChildColumns}
            AND ${parentProbe}`,
      );
      const total = Number(rows?.[0]?.total ?? 0);
      if (total > 0) orphaned.push(`${foreignKey.constraintName}=${total}`);
    }

    if (orphaned.length > 0) {
      throw new Error(
        `Baseline MySQL legado contém registros órfãos: ${orphaned.join(", ")}. ` +
        "Não é seguro registrar 001_schema.sql antes de corrigir os dados.",
      );
    }

    console.log(
      `[segempat-api] integridade de dados do baseline legado OK; ${foreignKeys.length} foreign key(s) sem registros órfãos`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[segempat-api] auditoria de órfãos do baseline legado falhou", error?.message || error);
  process.exit(1);
});
