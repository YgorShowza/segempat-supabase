import { execute } from "./db.js";
import { uuid } from "./util.js";

/**
 * Auditoria escrita sempre no servidor. O cliente nunca cria logs confiáveis.
 * Aceita uma conexão de transação para gravar junto da operação crítica.
 */
export async function audit(actorId, action, entity, entityId, details = null, connection = null) {
  const sql = `INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, details, created_at)
               VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`;
  const params = [
    uuid(),
    actorId ?? null,
    action,
    entity,
    entityId ? String(entityId) : "",
    JSON.stringify(details ?? {}),
  ];

  if (connection) {
    await connection.execute(sql, params);
    return;
  }
  await execute(sql, params);
}
