import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../supabase/migrations");
const nodeEnv = String(process.env.NODE_ENV || "production").trim().toLowerCase();
const runtimeUrl = String(process.env.DATABASE_URL || "").trim();
const migrationUrl = String(process.env.SEGEMPAT_MIGRATION_DATABASE_URL || runtimeUrl).trim();
const sslEnabled = String(process.env.POSTGRES_SSL ?? (nodeEnv === "production" ? "true" : "false")).trim().toLowerCase() === "true";
const caPath = String(process.env.POSTGRES_SSL_CA_PATH || "").trim() || null;

function fail(message) {
  console.error(`[segempat-migrate] ${message}`);
  process.exit(1);
}

if (!migrationUrl) fail("SEGEMPAT_MIGRATION_DATABASE_URL ou DATABASE_URL é obrigatório");
try {
  const parsed = new URL(migrationUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("protocolo inválido");
} catch {
  fail("connection string PostgreSQL inválida");
}
if (nodeEnv === "production" && !sslEnabled) fail("POSTGRES_SSL=true é obrigatório em produção");
if (nodeEnv === "production" && !process.env.SEGEMPAT_MIGRATION_DATABASE_URL) {
  fail("produção exige SEGEMPAT_MIGRATION_DATABASE_URL separada da credencial runtime");
}
if (nodeEnv === "production" && runtimeUrl && migrationUrl === runtimeUrl) {
  fail("a credencial de migration deve ser diferente da DATABASE_URL de runtime em produção");
}

function sslOptions() {
  if (!sslEnabled) return false;
  if (caPath) {
    if (!path.isAbsolute(caPath) && nodeEnv === "production") fail("POSTGRES_SSL_CA_PATH deve ser absoluto em produção");
    if (!fsSync.existsSync(caPath)) fail(`certificado CA não encontrado: ${caPath}`);
    return { ca: fsSync.readFileSync(caPath, "utf8"), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

function normalizedConnectionString(value) {
  const url = new URL(value);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  return url.toString();
}

function migrationVersion(fileName) {
  const match = /^(\d{3,})_.+\.sql$/i.exec(fileName);
  return match ? match[1] : null;
}

async function loadMigrations() {
  const files = (await fs.readdir(migrationsDir))
    .map((fileName) => ({ fileName, version: migrationVersion(fileName) }))
    .filter((entry) => entry.version)
    .sort((a, b) => {
      const left = BigInt(a.version);
      const right = BigInt(b.version);
      return left < right ? -1 : left > right ? 1 : a.fileName.localeCompare(b.fileName, "en");
    });

  if (!files.length) throw new Error("nenhuma migration PostgreSQL encontrada em supabase/migrations");
  const duplicateVersions = files.filter((entry, index) => index > 0 && entry.version === files[index - 1].version);
  if (duplicateVersions.length) throw new Error(`versão de migration duplicada: ${duplicateVersions[0].version}`);

  return Promise.all(files.map(async (entry) => {
    const sql = await fs.readFile(path.join(migrationsDir, entry.fileName), "utf8");
    return {
      ...entry,
      sql,
      checksum: createHash("sha256").update(sql, "utf8").digest("hex"),
    };
  }));
}

const migrations = await loadMigrations();
const pool = new Pool({
  connectionString: normalizedConnectionString(migrationUrl),
  ssl: sslOptions(),
  max: 1,
  application_name: "segempat-migrator",
});
const client = await pool.connect();

try {
  await client.query("SET TIME ZONE 'UTC'");
  await client.query("SELECT pg_advisory_lock(hashtext('segempat:migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(32) PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL UNIQUE,
      checksum_sha256 CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);

  const appliedResult = await client.query(
    "SELECT version, file_name, checksum_sha256 FROM schema_migrations ORDER BY version ASC",
  );
  const appliedByVersion = new Map(appliedResult.rows.map((row) => [String(row.version), row]));

  for (const migration of migrations) {
    const existing = appliedByVersion.get(migration.version);
    if (existing) {
      if (existing.file_name !== migration.fileName || existing.checksum_sha256 !== migration.checksum) {
        throw new Error(`migration aplicada diverge do código: ${migration.version}:${migration.fileName}`);
      }
      console.log(`[segempat-migrate] já aplicada: ${migration.fileName}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      console.log(`[segempat-migrate] aplicando: ${migration.fileName}`);
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO schema_migrations (version, file_name, checksum_sha256, applied_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP(3))`,
        [migration.version, migration.fileName, migration.checksum],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  const final = await client.query("SELECT COUNT(*)::int AS total FROM schema_migrations");
  if (Number(final.rows[0]?.total || 0) !== migrations.length) {
    throw new Error("histórico de migrations não corresponde à árvore de código");
  }
  console.log(`[segempat-migrate] ${migrations.length} migration(s) PostgreSQL validadas/aplicadas com sucesso`);
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext('segempat:migrations'))");
  } catch {
    // conexão encerrada antes do unlock; o PostgreSQL libera advisory locks na sessão.
  }
  client.release();
  await pool.end();
}
