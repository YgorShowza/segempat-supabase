/**
 * Cria (ou reabilita) o primeiro Administrador Master do SEGEMPAT direto no MySQL.
 *
 * Uso recomendado (senha via stdin, sem gravá-la no histórico do shell):
 *   read -rsp 'Senha temporária: ' SENHA_TMP; echo
 *   printf '%s' "$SENHA_TMP" | CONFIRM_BOOTSTRAP_ADMIN=SIM SENHA_STDIN=SIM \
 *     MATRICULA=970 NOME="Nome do Inspetor" SETOR=Administrativo node scripts/bootstrap-admin.js
 *   unset SENHA_TMP
 *
 * Para automação controlada, SENHA continua suportada como variável de ambiente,
 * mas nunca deve ser escrita em documentação, issue, commit ou log compartilhado.
 * A senha nunca é gravada em texto: apenas o hash bcrypt vai para app_users.
 */
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "../src/db.js";

const confirmation = String(process.env["CONFIRM_BOOTSTRAP_ADMIN"] || "").trim().toUpperCase();
const matricula = String(process.env["MATRICULA"] || "").trim();
const nome = String(process.env["NOME"] || "").trim();
const setor = String(process.env["SETOR"] || "Administrativo").trim();
const senhaStdin = String(process.env["SENHA_STDIN"] || "").trim().toUpperCase() === "SIM";

function fail(message) {
  console.error(`[bootstrap-admin] ${message}`);
  process.exit(1);
}

function readPassword() {
  const envPassword = String(process.env["SENHA"] || "");
  if (senhaStdin && envPassword) fail("use SENHA_STDIN=SIM ou SENHA, nunca os dois ao mesmo tempo");
  if (!senhaStdin) return envPassword;
  if (process.stdin.isTTY) fail("SENHA_STDIN=SIM exige que a senha seja enviada por pipe/stdin");
  return fs.readFileSync(0, "utf8").replace(/[\r\n]+$/, "");
}

const senha = readPassword();

if (confirmation !== "SIM") {
  fail("operação privilegiada bloqueada; defina CONFIRM_BOOTSTRAP_ADMIN=SIM para confirmar conscientemente o bootstrap do Administrador Master");
}
if (!matricula) fail("MATRICULA é obrigatória");
if (matricula.length > 64) fail("MATRICULA excede 64 caracteres");
if (!nome) fail("NOME é obrigatório");
if (nome.length > 255) fail("NOME excede 255 caracteres");
if (!setor) fail("SETOR é obrigatório");
if (setor.length > 80) fail("SETOR excede 80 caracteres");
if (senha.length < 8) fail("SENHA deve ter ao menos 8 caracteres");
if (senha.length > 128) fail("SENHA excede 128 caracteres");

try {
  const result = await withTransaction(async (connection) => {
    const key = matricula.toLowerCase();

    const [employees] = await connection.execute(
      `SELECT * FROM employees WHERE LOWER(TRIM(matricula)) = ? LIMIT 1 FOR UPDATE`,
      [key],
    );
    let employee = employees[0];

    if (!employee) {
      const employeeId = randomUUID();
      await connection.execute(
        `INSERT INTO employees (id, full_name, matricula, sector, access_profile, status,
                                level, points, first_access, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Inspetor', 'Ativo', 1, 0, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [employeeId, nome, matricula, setor],
      );
      employee = { id: employeeId, matricula, full_name: nome };
    } else {
      await connection.execute(
        `UPDATE employees SET full_name = ?, sector = ?, access_profile = 'Inspetor',
                              status = 'Ativo', first_access = 0, updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?`,
        [nome, setor, employee.id],
      );
    }

    const passwordHash = await bcrypt.hash(senha, 12);
    const [accounts] = await connection.execute(
      `SELECT id FROM app_users WHERE LOWER(TRIM(matricula)) = ? LIMIT 1 FOR UPDATE`,
      [key],
    );

    let userId = accounts[0]?.id;
    if (userId) {
      await connection.execute(
        `UPDATE app_users
            SET matricula = ?, password_hash = ?, status = 'Ativo',
                session_epoch = session_epoch + 1, updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?`,
        [employee.matricula, passwordHash, userId],
      );
    } else {
      userId = randomUUID();
      await connection.execute(
        `INSERT INTO app_users (id, matricula, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Ativo', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [userId, employee.matricula, passwordHash],
      );
    }

    const [profilesByMatricula] = await connection.execute(
      `SELECT id FROM profiles WHERE LOWER(TRIM(matricula)) = ? LIMIT 1 FOR UPDATE`,
      [key],
    );
    const conflictingProfile = profilesByMatricula[0];
    if (conflictingProfile && conflictingProfile.id !== userId) {
      throw new Error(`matrícula ${employee.matricula} já está vinculada ao profile de outro usuário (${conflictingProfile.id})`);
    }

    const [profilesByUser] = await connection.execute(
      `SELECT id, matricula FROM profiles WHERE id = ? LIMIT 1 FOR UPDATE`,
      [userId],
    );
    const currentProfile = profilesByUser[0];
    if (currentProfile) {
      await connection.execute(
        `UPDATE profiles SET matricula = ?, nome = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
        [employee.matricula, nome, userId],
      );
    } else {
      await connection.execute(
        `INSERT INTO profiles (id, matricula, nome, created_at, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [userId, employee.matricula, nome],
      );
    }

    await connection.execute(
      `INSERT IGNORE INTO user_roles (id, user_id, role)
       VALUES (?, ?, 'admin')`,
      [randomUUID(), userId],
    );

    await connection.execute(
      `INSERT INTO user_access_levels (user_id, level_code, updated_by, updated_at)
       VALUES (?, 'master', NULL, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE level_code = 'master', updated_by = NULL, updated_at = UTC_TIMESTAMP(3)`,
      [userId],
    );
    await connection.execute(`DELETE FROM user_permission_overrides WHERE user_id = ?`, [userId]);

    await connection.execute(
      `UPDATE registration_activation_codes
          SET used_at = COALESCE(used_at, UTC_TIMESTAMP(3))
        WHERE employee_id = ?`,
      [employee.id],
    );

    await connection.execute(
      `INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, details, created_at)
       VALUES (?, ?, 'BOOTSTRAP_ADMIN', 'app_users', ?, ?, UTC_TIMESTAMP(3))`,
      [randomUUID(), userId, userId, JSON.stringify({
        matricula: employee.matricula,
        employee_id: employee.id,
        access_level: "master",
        least_privilege_model: "granular",
        via: "scripts/bootstrap-admin.js",
        explicit_confirmation: true,
        activation_codes_revoked: true,
        sessions_revoked: Boolean(accounts[0]?.id),
      })],
    );

    return { userId, employeeId: employee.id, matricula: employee.matricula };
  });

  console.log(`[bootstrap-admin] Administrador Master pronto: matrícula ${result.matricula} (usuário ${result.userId})`);
} catch (error) {
  fail(error?.message || String(error));
} finally {
  await pool.end();
}
