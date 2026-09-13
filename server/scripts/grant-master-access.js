/**
 * Concessão explícita de Administrador Master — execução exclusiva pela TI.
 *
 * Exemplo:
 *   CONFIRM_MASTER_ACCESS=SIM MATRICULA=970 TI_OPERATOR="Nome do analista TI" \
 *     node scripts/grant-master-access.js
 *
 * O comando não recebe senha. Ele promove uma conta funcional ativa para Master,
 * limpa exceções individuais, preserva compatibilidade administrativa, revoga as
 * sessões anteriores e registra a operação na trilha de auditoria.
 */
import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "../src/db.js";

const confirmation = String(process.env["CONFIRM_MASTER_ACCESS"] || "").trim().toUpperCase();
const matricula = String(process.env["MATRICULA"] || "").trim();
const tiOperator = String(process.env["TI_OPERATOR"] || "").trim();

function fail(message) {
  console.error(`[grant-master-access] ${message}`);
  process.exitCode = 1;
}

if (confirmation !== "SIM") fail("operação bloqueada; defina CONFIRM_MASTER_ACCESS=SIM");
if (!matricula) fail("MATRICULA é obrigatória");
if (matricula.length > 64) fail("MATRICULA excede 64 caracteres");
if (!tiOperator) fail("TI_OPERATOR é obrigatório para rastreabilidade");
if (tiOperator.length > 255) fail("TI_OPERATOR excede 255 caracteres");

if (!process.exitCode) {
  try {
    const result = await withTransaction(async (connection) => {
      const [accounts] = await connection.execute(
        `SELECT u.id AS user_id,
                u.matricula,
                u.status AS account_status,
                e.id AS employee_id,
                e.full_name,
                e.status AS employee_status,
                ual.level_code
           FROM app_users u
           LEFT JOIN employees e
             ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
           LEFT JOIN user_access_levels ual ON ual.user_id = u.id
          WHERE LOWER(TRIM(u.matricula)) = LOWER(TRIM(?))
          LIMIT 1
          FOR UPDATE`,
        [matricula],
      );
      const account = accounts[0];
      if (!account) throw new Error("conta de acesso não encontrada");
      if (account.account_status !== "Ativo") throw new Error("conta de acesso inativa");
      if (!account.employee_id) throw new Error("conta sem cadastro funcional vinculado");
      if (account.employee_status !== "Ativo") throw new Error("cadastro funcional inativo");

      const previousLevel = account.level_code || "operator";

      await connection.execute(
        `INSERT INTO user_access_levels (user_id, level_code, updated_by, updated_at)
         VALUES (?, 'master', NULL, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE level_code = 'master', updated_by = NULL, updated_at = UTC_TIMESTAMP(3)`,
        [account.user_id],
      );
      await connection.execute(`DELETE FROM user_permission_overrides WHERE user_id = ?`, [account.user_id]);
      await connection.execute(
        `INSERT IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')`,
        [randomUUID(), account.user_id],
      );
      await connection.execute(
        `UPDATE app_users
            SET session_epoch = session_epoch + 1, updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?`,
        [account.user_id],
      );
      await connection.execute(
        `INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, details, created_at)
         VALUES (?, NULL, 'TI_GRANT_MASTER_ACCESS', 'app_users', ?, ?, UTC_TIMESTAMP(3))`,
        [
          randomUUID(),
          account.user_id,
          JSON.stringify({
            matricula: account.matricula,
            employee_id: account.employee_id,
            employee_name: account.full_name,
            previous_access_level: previousLevel,
            new_access_level: "master",
            permissions_reset_to_master_default: true,
            sessions_revoked: true,
            executed_by_ti: tiOperator,
            explicit_confirmation: true,
            via: "server/scripts/grant-master-access.js",
          }),
        ],
      );

      return {
        userId: account.user_id,
        matricula: account.matricula,
        name: account.full_name,
        previousLevel,
      };
    });

    console.log(
      `[grant-master-access] concluído: ${result.name} (${result.matricula}) ${result.previousLevel} -> master; sessões anteriores revogadas`,
    );
  } catch (error) {
    fail(error?.message || String(error));
  } finally {
    await pool.end();
  }
}
