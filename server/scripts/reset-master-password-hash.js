import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "../src/db.js";

const confirmation = String(process.env["CONFIRM_MASTER_PASSWORD_RESET"] || "").trim().toUpperCase();
const matricula = String(process.env["MASTER_RESET_MATRICULA"] || "").trim();
const passwordHash = String(process.env["MASTER_RESET_BCRYPT_HASH"] || "").trim();

function fail(message) {
  console.error(`[reset-master-password] ${message}`);
  process.exit(1);
}

if (confirmation !== "SIM") fail("operação bloqueada; defina CONFIRM_MASTER_PASSWORD_RESET=SIM");
if (!matricula) fail("MASTER_RESET_MATRICULA é obrigatória");
if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) fail("MASTER_RESET_BCRYPT_HASH inválido");

try {
  const result = await withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT u.id, u.status, ual.level_code
         FROM app_users u
         JOIN user_access_levels ual ON ual.user_id = u.id
        WHERE LOWER(TRIM(u.matricula)) = LOWER(TRIM(?))
        LIMIT 1
        FOR UPDATE`,
      [matricula],
    );
    const account = rows[0];
    if (!account || account.status !== "Ativo") throw new Error("conta Master ativa não encontrada");
    if (account.level_code !== "master") throw new Error("conta alvo não possui nível master");

    await connection.execute(
      `UPDATE app_users
          SET password_hash = ?, session_epoch = session_epoch + 1, updated_at = UTC_TIMESTAMP(3)
        WHERE id = ?`,
      [passwordHash, account.id],
    );
    await connection.execute(`DELETE FROM password_reset_codes WHERE user_id = ?`, [account.id]);
    await connection.execute(
      `INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, details, created_at)
       VALUES (?, NULL, 'TI_PASSWORD_RESET', 'app_users', ?, ?, UTC_TIMESTAMP(3))`,
      [randomUUID(), account.id, JSON.stringify({ matricula, sessions_revoked: true, method: "controlled-bcrypt-hash" })],
    );
    return { id: account.id };
  });

  console.log(`[reset-master-password] senha do Administrador Master redefinida com sucesso (${result.id})`);
} catch (error) {
  fail(error?.message || String(error));
} finally {
  await pool.end();
}
