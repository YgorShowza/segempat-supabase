import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const baseUrl = `http://127.0.0.1:${process.env.PORT || 8787}`;
const origin = String(process.env.SEGEMPAT_ALLOWED_ORIGINS || "").split(",")[0]?.trim();
if (!origin) throw new Error("SEGEMPAT_ALLOWED_ORIGINS é obrigatório para o smoke autenticado");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 2,
});

const employeeId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const password = `Ci-${randomBytes(18).toString("base64url")}`;
const matricula = `ci-master-${randomBytes(5).toString("hex")}`;

async function seedMaster() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO employees (id, full_name, matricula, sector, access_profile, status, level, points, first_access)
       VALUES ($1, 'SEGEMPAT CI Master', $2, 'CFTV', 'Inspetor', 'Ativo', 1, 0, 0)`,
      [employeeId, matricula],
    );
    await client.query(
      `INSERT INTO app_users (id, matricula, password_hash, status, session_epoch)
       VALUES ($1, $2, $3, 'Ativo', 0)`,
      [userId, matricula, hash],
    );
    await client.query(
      `INSERT INTO profiles (id, matricula, nome) VALUES ($1, $2, 'SEGEMPAT CI Master')`,
      [userId, matricula],
    );
    await client.query(
      `INSERT INTO user_roles (id, user_id, role) VALUES ($1, $2, 'admin')`,
      [roleId, userId],
    );
    await client.query(
      `INSERT INTO user_access_levels (user_id, level_code, updated_by) VALUES ($1, 'master', NULL)`,
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

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login não retornou cookie de sessão");
  return setCookie.split(";", 1)[0];
}

await seedMaster();

const login = await request("/api/auth/login", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ matricula, password }),
});
if (login.response.status !== 200) {
  throw new Error(`Login PostgreSQL falhou: status=${login.response.status} body=${JSON.stringify(login.body)}`);
}
const cookie = cookieFrom(login.response);

const me = await request("/api/auth/me", { headers: { Cookie: cookie } });
if (me.response.status !== 200 || !me.body?.isMaster || !me.body?.isAdmin || me.body?.accessLevel !== "master") {
  throw new Error(`Sessão Master PostgreSQL inválida: status=${me.response.status} body=${JSON.stringify(me.body)}`);
}

const list = await request("/api/employees", { headers: { Cookie: cookie } });
if (list.response.status !== 200 || !Array.isArray(list.body)) {
  throw new Error(`Leitura de equipe PostgreSQL falhou: status=${list.response.status}`);
}

const create = await request("/api/employees", {
  method: "POST",
  headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    full_name: "Colaborador CI PostgreSQL",
    matricula: `ci-operador-${randomBytes(5).toString("hex")}`,
    sector: "CFTV",
    access_profile: "Operacional",
    status: "Ativo",
  }),
});
if (create.response.status !== 201 || !create.body?.id) {
  throw new Error(`Cadastro de colaborador PostgreSQL falhou: status=${create.response.status} body=${JSON.stringify(create.body)}`);
}

const createdEmployeeId = create.body.id;
const patch = await request(`/api/employees/${createdEmployeeId}`, {
  method: "PATCH",
  headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ full_name: "Colaborador CI PostgreSQL Atualizado" }),
});
if (patch.response.status !== 204) {
  throw new Error(`Atualização de colaborador PostgreSQL falhou: status=${patch.response.status} body=${JSON.stringify(patch.body)}`);
}

const remove = await request(`/api/employees/${createdEmployeeId}`, {
  method: "DELETE",
  headers: { Cookie: cookie, Origin: origin },
});
if (remove.response.status !== 204) {
  throw new Error(`Exclusão de colaborador PostgreSQL falhou: status=${remove.response.status} body=${JSON.stringify(remove.body)}`);
}

const audit = await pool.query("SELECT count(*)::int AS total FROM audit_logs WHERE actor_id = $1", [userId]);
if (Number(audit.rows[0]?.total || 0) < 4) {
  throw new Error(`Auditoria insuficiente no smoke PostgreSQL: ${audit.rows[0]?.total ?? 0}`);
}

console.log(`Smoke autenticado PostgreSQL OK; auditoria=${audit.rows[0].total}`);
await pool.end();
