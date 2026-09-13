import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrateScript = path.join(here, "migrate.js");
const POST_MIGRATION_VALIDATORS = [
  "check-practical-generation-integrity.js",
  "check-governance-integrity.js",
  "check-occurrence-record-integrity.js",
];
const nodeEnv = String(process.env["NODE_ENV"] || "production").trim().toLowerCase();
const runtimeUser = String(process.env["MYSQL_USER"] || "").trim();
const runtimePassword = String(process.env["MYSQL_PASSWORD"] || "");
const migrationUser = String(process.env["MYSQL_MIGRATION_USER"] || "").trim();
const migrationPassword = String(process.env["MYSQL_MIGRATION_PASSWORD"] || "");

function fail(message) {
  console.error(`[segempat-api] migration credential gate: ${message}`);
  process.exit(1);
}

const hasMigrationUser = migrationUser.length > 0;
const hasMigrationPassword = migrationPassword.length > 0;
if (hasMigrationUser !== hasMigrationPassword) {
  fail("MYSQL_MIGRATION_USER e MYSQL_MIGRATION_PASSWORD devem ser fornecidos juntos");
}

if (nodeEnv === "production") {
  if (!hasMigrationUser || !hasMigrationPassword) {
    fail("produção exige credencial de migration controlada pela TI; forneça MYSQL_MIGRATION_USER e MYSQL_MIGRATION_PASSWORD somente durante a execução da migration");
  }
  if (migrationUser.toLowerCase() === runtimeUser.toLowerCase()) {
    fail("MYSQL_MIGRATION_USER deve ser diferente de MYSQL_USER em produção para preservar a segregação de privilégios");
  }
}

const selectedUser = hasMigrationUser ? migrationUser : runtimeUser;
const selectedPassword = hasMigrationPassword ? migrationPassword : runtimePassword;
if (!selectedUser || !selectedPassword) {
  fail("credencial MySQL de migration ausente");
}

if (nodeEnv === "production" && ["change_me", "changeme", "password", "senha"].includes(selectedPassword.trim().toLowerCase())) {
  fail("MYSQL_MIGRATION_PASSWORD contém valor de exemplo/placeholder");
}

console.log(
  `[segempat-api] migration credential gate OK; runtime_user=${runtimeUser || "ausente"}; migration_user=${selectedUser}; segregated=${selectedUser.toLowerCase() !== runtimeUser.toLowerCase() ? "yes" : "no"}`,
);

const migrationEnv = {
  ...process.env,
  MYSQL_USER: selectedUser,
  MYSQL_PASSWORD: selectedPassword,
};

const result = spawnSync(process.execPath, [migrateScript], {
  cwd: path.resolve(here, ".."),
  stdio: "inherit",
  env: migrationEnv,
});

if (result.error) {
  console.error(`[segempat-api] não foi possível iniciar o runner de migrations: ${result.error.message}`);
  process.exit(1);
}
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

for (const validator of POST_MIGRATION_VALIDATORS) {
  console.log(`[segempat-api] auditoria estrutural pós-migration: ${validator}`);
  const validation = spawnSync(process.execPath, [path.join(here, validator)], {
    cwd: path.resolve(here, ".."),
    stdio: "inherit",
    env: {
      ...migrationEnv,
      SEGEMPAT_SCHEMA_AUDIT_PRIVILEGED: "1",
    },
  });
  if (validation.error) {
    console.error(`[segempat-api] não foi possível iniciar ${validator}: ${validation.error.message}`);
    process.exit(1);
  }
  if ((validation.status ?? 1) !== 0) {
    console.error(`[segempat-api] auditoria estrutural pós-migration falhou em ${validator}`);
    process.exit(validation.status ?? 1);
  }
}

console.log("[segempat-api] auditorias estruturais pós-migration concluídas com credencial de migration");
process.exit(0);
