import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { healthcheck, query, queryOne } from "./db.js";
import { attachUser } from "./session.js";
import { enforceGranularApiPermissions } from "./authorization.js";
import { enforceSensitiveReadRedaction } from "./sensitive-read-redaction.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { accessRouter } from "./routes/access.js";
import { authorizationRouter } from "./routes/authorization.js";
import { insightsRouter } from "./routes/insights.js";
import { examsRouter, myExamsRouter } from "./routes/exams.js";
import { examEvidenceRouter } from "./routes/exam-evidence.js";
import { myExamEvidenceRouter } from "./routes/exam-evidence-self.js";
import { cronogramaCreateIntegrityRouter } from "./routes/cronograma-create-integrity.js";
import { cronogramaIntegrityRouter } from "./routes/cronograma-integrity.js";
import { cronogramaRouter } from "./routes/cronograma.js";
import { cronogramaImportRouter } from "./routes/cronograma-import.js";
import { questionBankRouter } from "./routes/question-bank.js";
import { trainingRouter, adminTrainingRouter, myTrainingRouter } from "./routes/training.js";
import { practicalIntegrityRouter } from "./routes/practical-integrity.js";
import { occurrenceIntegrityRouter } from "./routes/occurrence-integrity.js";
import { operationsRouter } from "./routes/operations.js";
import { myPracticalRouter } from "./routes/practical-self.js";
import { HttpError } from "./util.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../database/mysql");

const READINESS_TABLES = [
  "app_users",
  "employees",
  "profiles",
  "user_roles",
  "registration_activation_codes",
  "password_reset_codes",
  "access_levels",
  "access_permissions",
  "access_level_permissions",
  "user_access_levels",
  "user_permission_overrides",
  "exams",
  "exam_attempts",
  "certificates",
  "cronograma_entries",
  "cronograma_recurring_models",
  "cronograma_suspensions",
  "knowledge_items",
  "question_bank",
  "training_modules",
  "training_activity_attempts",
  "training_schedules",
  "practical_eval_templates",
  "practical_evaluations",
  "occurrences",
  "audit_logs",
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
let expectedMigrationsPromise = null;

function migrationVersion(fileName) {
  const match = /^(\d{3,})_.+\.sql$/i.exec(fileName);
  return match ? match[1] : null;
}

async function expectedMigrations() {
  if (!expectedMigrationsPromise) {
    expectedMigrationsPromise = (async () => {
      const migrations = (await fs.readdir(migrationsDir))
        .map((fileName) => ({ fileName, version: migrationVersion(fileName) }))
        .filter((entry) => entry.version)
        .sort((a, b) => {
          const left = BigInt(a.version);
          const right = BigInt(b.version);
          return left < right ? -1 : left > right ? 1 : a.fileName.localeCompare(b.fileName, "en");
        });
      if (migrations.length === 0) throw new Error("Nenhuma migration MySQL versionada encontrada no deploy");

      return Promise.all(
        migrations.map(async (migration) => {
          const sql = await fs.readFile(path.join(migrationsDir, migration.fileName), "utf8");
          return {
            ...migration,
            checksum: createHash("sha256").update(sql, "utf8").digest("hex"),
          };
        }),
      );
    })().catch((error) => {
      expectedMigrationsPromise = null;
      throw error;
    });
  }
  return expectedMigrationsPromise;
}

async function verifyMigrationReadiness() {
  const expected = await expectedMigrations();
  const applied = await query(
    `SELECT version, file_name, checksum_sha256, applied_at
       FROM schema_migrations
      ORDER BY CAST(version AS UNSIGNED) ASC, version ASC`,
  );

  if (applied.length !== expected.length) {
    return {
      ready: false,
      reason: "history-length-mismatch",
      expectedCount: expected.length,
      appliedCount: applied.length,
    };
  }

  for (let index = 0; index < expected.length; index += 1) {
    const code = expected[index];
    const database = applied[index];
    if (
      String(database?.version) !== String(code.version) ||
      String(database?.file_name) !== code.fileName ||
      String(database?.checksum_sha256) !== code.checksum
    ) {
      return {
        ready: false,
        reason: "history-mismatch",
        expected: `${code.version}:${code.fileName}`,
        applied: database ? `${database.version}:${database.file_name}` : null,
      };
    }
  }

  const latest = applied.at(-1);
  return {
    ready: true,
    latest: {
      version: String(latest.version),
      file_name: latest.file_name,
      applied_at: latest.applied_at,
    },
  };
}

async function verifyStorageReadiness() {
  const storageRoot = path.resolve(config.storage.path);
  const stat = await fs.stat(storageRoot);
  if (!stat.isDirectory()) throw new Error("Storage de evidências não é um diretório");
  await fs.access(storageRoot, fsConstants.R_OK | fsConstants.W_OK);

  const probePath = path.join(storageRoot, `.segempat-readiness-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(probePath, "segempat-readiness", { encoding: "utf8", flag: "wx", mode: 0o600 });
    const probe = await fs.readFile(probePath, "utf8");
    if (probe !== "segempat-readiness") throw new Error("Storage de evidências falhou na verificação de leitura");
  } finally {
    await fs.rm(probePath, { force: true }).catch(() => {});
  }
}

function enforceTrustedWriteOrigin(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = String(req.get("origin") || "").trim();
  if (!origin) {
    return next(new HttpError(403, "Origem da requisição é obrigatória para operações de escrita", "ORIGIN_REQUIRED"));
  }
  if (!config.allowedOrigins.includes(origin)) {
    return next(new HttpError(403, "Origem não autorizada", "ORIGIN_FORBIDDEN"));
  }
  return next();
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new HttpError(403, "Origem não autorizada", "CORS_FORBIDDEN"));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept"],
    }),
  );
  app.use(express.json({ limit: "2mb", type: "application/json" }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get("/health", (_req, res) => res.json({ ok: true, service: "segempat-api" }));

  app.get("/health/ready", async (_req, res) => {
    let phase = "database";
    try {
      await healthcheck();

      phase = "database-tls";
      const sslStatus = await queryOne("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
      const sslCipher = String(sslStatus?.Value ?? sslStatus?.value ?? "").trim();
      if (config.db.ssl && !sslCipher) {
        return res.status(503).json({ ok: false, service: "segempat-api", database: "connected", tls: "not-negotiated" });
      }

      phase = "migrations";
      const migrationStatus = await verifyMigrationReadiness();
      if (!migrationStatus.ready) {
        return res.status(503).json({
          ok: false,
          service: "segempat-api",
          database: "connected",
          migrations: "out-of-date",
          reason: migrationStatus.reason,
          expected: migrationStatus.expected ?? null,
          applied: migrationStatus.applied ?? null,
          expected_count: migrationStatus.expectedCount ?? null,
          applied_count: migrationStatus.appliedCount ?? null,
        });
      }

      phase = "schema";
      const placeholders = READINESS_TABLES.map(() => "?").join(",");
      const schema = await queryOne(
        `SELECT COUNT(*) AS total
           FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name IN (${placeholders})`,
        READINESS_TABLES,
      );
      const foundTables = Number(schema?.total ?? 0);
      if (foundTables !== READINESS_TABLES.length) {
        return res.status(503).json({ ok: false, service: "segempat-api", database: "connected", schema: "incomplete" });
      }

      phase = "storage";
      await verifyStorageReadiness();

      return res.json({
        ok: true,
        service: "segempat-api",
        database: "connected",
        tls: sslCipher ? "ready" : "off",
        schema: "ready",
        storage: "ready",
        migration: migrationStatus.latest,
      });
    } catch (error) {
      console.error(`[segempat-api] readiness falhou em ${phase}`, error?.message || error);
      return res.status(503).json({ ok: false, service: "segempat-api", dependency: phase, status: "unavailable" });
    }
  });

  app.use("/api", enforceTrustedWriteOrigin);
  app.use("/api", enforceGranularApiPermissions);
  app.use("/api", enforceSensitiveReadRedaction);

  app.use("/api/auth", authRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/access", accessRouter);
  app.use("/api/authorization", authorizationRouter);
  app.use("/api/insights", insightsRouter);
  app.use("/api/exams", examsRouter);
  app.use("/api/me", myExamsRouter);
  app.use("/api/me", myExamEvidenceRouter);
  app.use("/api/me", myPracticalRouter);
  app.use("/api/admin", examEvidenceRouter);
  app.use("/api/cronograma", cronogramaCreateIntegrityRouter);
  app.use("/api/cronograma", cronogramaIntegrityRouter);
  app.use("/api/cronograma", cronogramaImportRouter);
  app.use("/api/cronograma", cronogramaRouter);
  app.use("/api/question-bank", questionBankRouter);
  app.use("/api/training", trainingRouter);
  app.use("/api/admin/training", adminTrainingRouter);
  app.use("/api/me/training", myTrainingRouter);
  app.use("/api/operations", practicalIntegrityRouter);
  app.use("/api/operations", occurrenceIntegrityRouter);
  app.use("/api/operations", operationsRouter);

  app.use((_req, _res, next) => next(new HttpError(404, "Rota não encontrada", "NOT_FOUND")));
  app.use((error, _req, res, _next) => {
    const status = Number(error?.status) || 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    const isOperational = error instanceof HttpError;
    if (!isOperational) console.error("[segempat-api] erro não tratado", error);
    res.status(safeStatus).json({
      error: isOperational ? error.message : "Erro interno do servidor",
      code: isOperational ? error.code || "ERROR" : "INTERNAL_ERROR",
      details: isOperational ? error.details ?? null : null,
    });
  });

  return app;
}
