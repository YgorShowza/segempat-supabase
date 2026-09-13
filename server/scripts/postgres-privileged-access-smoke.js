import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, max: 2 });

function runScript(fileName, extraEnv) {
  const result = spawnSync(process.execPath, [path.join(here, fileName)], {
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${fileName} falhou com status ${result.status}`);
  }
}

async function one(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
}

async function seedOperator() {
  const employeeId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO employees (id,full_name,matricula,sector,access_profile,status,level,points,first_access)
       VALUES ($1,'SEGEMPAT CI Operator','ci-priv-operator','CFTV','Operacional','Ativo',1,0,0)`,
      [employeeId],
    );
    await client.query(
      `INSERT INTO app_users (id,matricula,password_hash,status,session_epoch)
       VALUES ($1,'ci-priv-operator',$2,'Ativo',0)`,
      [userId, passwordHash],
    );
    await client.query(
      `INSERT INTO profiles (id,matricula,nome) VALUES ($1,'ci-priv-operator','SEGEMPAT CI Operator')`,
      [userId],
    );
    await client.query(
      `INSERT INTO user_access_levels (user_id,level_code,updated_by) VALUES ($1,'operator',NULL)`,
      [userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const bootstrapPassword = `ci-${randomBytes(20).toString("base64url")}`;
  runScript("bootstrap-admin.js", {
    CONFIRM_BOOTSTRAP_ADMIN: "SIM",
    MATRICULA: "ci-bootstrap-master",
    NOME: "SEGEMPAT CI Bootstrap Master",
    SETOR: "Administrativo",
    SENHA: bootstrapPassword,
  });

  const bootstrap = await one(
    `SELECT u.id, u.session_epoch, e.access_profile, ual.level_code,
            EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='admin') AS admin_role
       FROM app_users u
       JOIN employees e ON lower(trim(e.matricula))=lower(trim(u.matricula))
       JOIN user_access_levels ual ON ual.user_id=u.id
      WHERE u.matricula='ci-bootstrap-master'`,
  );
  assert(bootstrap, "bootstrap não criou conta Master");
  assert(bootstrap.level_code === "master", "bootstrap não definiu nível master");
  assert(bootstrap.access_profile === "Inspetor", "bootstrap não definiu perfil Inspetor");
  assert(bootstrap.admin_role === true, "bootstrap não preservou role administrativa de compatibilidade");
  const bootstrapAudit = await one(
    `SELECT count(*)::int AS total FROM audit_logs WHERE action='BOOTSTRAP_ADMIN' AND entity_id=$1::text`,
    [bootstrap.id],
  );
  assert(Number(bootstrapAudit?.total) === 1, "bootstrap não registrou auditoria única");

  await seedOperator();

  runScript("manage-inspector-access.js", {
    CONFIRM_PRIVILEGED_ACCESS: "SIM",
    ACTION: "GRANT",
    MATRICULA: "ci-priv-operator",
    TI_OPERATOR: "GitHub Actions CI",
  });
  let state = await one(
    `SELECT u.id, u.session_epoch, e.id AS employee_id, e.access_profile, ual.level_code,
            EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='admin') AS admin_role
       FROM app_users u
       JOIN employees e ON lower(trim(e.matricula))=lower(trim(u.matricula))
       JOIN user_access_levels ual ON ual.user_id=u.id
      WHERE u.matricula='ci-priv-operator'`,
  );
  assert(state.level_code === "inspector", "GRANT não definiu nível inspector");
  assert(state.access_profile === "Inspetor", "GRANT não definiu perfil Inspetor");
  assert(state.admin_role === true, "GRANT não criou role administrativa de compatibilidade");
  assert(Number(state.session_epoch) === 1, "GRANT não invalidou sessões anteriores");
  const grantAudit = await one(
    `SELECT count(*)::int AS total FROM audit_logs WHERE action='TI_GRANT_INSPECTOR' AND entity_id=$1::text`,
    [state.employee_id],
  );
  assert(Number(grantAudit?.total) === 1, "GRANT não registrou auditoria");

  runScript("manage-inspector-access.js", {
    CONFIRM_PRIVILEGED_ACCESS: "SIM",
    ACTION: "REVOKE",
    MATRICULA: "ci-priv-operator",
    TI_OPERATOR: "GitHub Actions CI",
  });
  state = await one(
    `SELECT u.id, u.session_epoch, e.id AS employee_id, e.access_profile, ual.level_code,
            EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='admin') AS admin_role
       FROM app_users u
       JOIN employees e ON lower(trim(e.matricula))=lower(trim(u.matricula))
       JOIN user_access_levels ual ON ual.user_id=u.id
      WHERE u.matricula='ci-priv-operator'`,
  );
  assert(state.level_code === "operator", "REVOKE não restaurou nível operator");
  assert(state.access_profile === "Operacional", "REVOKE não restaurou perfil Operacional");
  assert(state.admin_role === false, "REVOKE não removeu role administrativa de compatibilidade");
  assert(Number(state.session_epoch) === 2, "REVOKE não invalidou sessões anteriores");
  const revokeAudit = await one(
    `SELECT count(*)::int AS total FROM audit_logs WHERE action='TI_REVOKE_INSPECTOR' AND entity_id=$1::text`,
    [state.employee_id],
  );
  assert(Number(revokeAudit?.total) === 1, "REVOKE não registrou auditoria");

  runScript("grant-master-access.js", {
    CONFIRM_MASTER_ACCESS: "SIM",
    MATRICULA: "ci-priv-operator",
    TI_OPERATOR: "GitHub Actions CI",
  });
  state = await one(
    `SELECT u.id, u.session_epoch, ual.level_code,
            EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='admin') AS admin_role
       FROM app_users u
       JOIN user_access_levels ual ON ual.user_id=u.id
      WHERE u.matricula='ci-priv-operator'`,
  );
  assert(state.level_code === "master", "grant-master não definiu nível master");
  assert(state.admin_role === true, "grant-master não criou role administrativa de compatibilidade");
  assert(Number(state.session_epoch) === 3, "grant-master não invalidou sessões anteriores");
  const masterAudit = await one(
    `SELECT count(*)::int AS total FROM audit_logs WHERE action='TI_GRANT_MASTER_ACCESS' AND entity_id=$1::text`,
    [state.id],
  );
  assert(Number(masterAudit?.total) === 1, "grant-master não registrou auditoria");

  runScript("report-privileged-access.js", {});
  console.log("[privileged-access-smoke] PostgreSQL OK — bootstrap, Inspector GRANT/REVOKE, Master e auditoria validados");
} finally {
  await pool.end().catch(() => {});
}
