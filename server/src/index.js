import { createApp } from "./app.js";
import { config } from "./config.js";
import { healthcheck, pool } from "./db.js";

async function start() {
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
