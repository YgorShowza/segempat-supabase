import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { healthcheck, pool } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function runApprovedMasterPasswordReset() {
  const enabled = String(process.env["SEGEMPAT_MASTER_PASSWORD_RESET_ON_START"] || "")
    .trim()
    .toUpperCase() === "SIM";
  if (!enabled) return;

  const scriptPath = path.resolve(here, "../scripts/reset-master-password-hash.js");
  const result = spawnSync(process.execPath, [scriptPath], {
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error("reset controlado da senha do Administrador Master falhou");
  }
}

async function start() {
  runApprovedMasterPasswordReset();
  await healthcheck();

  const app = createApp();
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`[segempat-api] ouvindo na porta ${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`[segempat-api] encerrando por ${signal}`);
    server.close(async () => {
      try {
        await pool.end();
      } finally {
        process.exit(0);
      }
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("[segempat-api] falha ao iniciar", error);
  process.exit(1);
});
