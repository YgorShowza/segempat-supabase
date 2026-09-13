import { pool, query } from "../src/db.js";
import { effectivePermissions, levelDefinition } from "../src/authorization.js";

const PRIVILEGED_LEVELS = new Set(["master", "admin", "inspector"]);

function statusFor(row) {
  const level = String(row.level_code || "");
  const hasAdminRole = Number(row.admin_role) === 1;
  const privileged = PRIVILEGED_LEVELS.has(level);

  if (!row.user_id && row.access_profile === "Inspetor") return "SEM_CONTA";
  if (row.employee_status !== "Ativo" || (row.user_id && row.account_status !== "Ativo")) return "INATIVO";
  if (row.user_id && !level) return "SEM_NIVEL_GRANULAR";
  if (privileged && !hasAdminRole) return "SEM_ROLE_LEGADA";
  if (!privileged && hasAdminRole) return "ROLE_ADMIN_INDEVIDA";
  if (level === "inspector" && row.access_profile !== "Inspetor") return "PERFIL_INSPETOR_DIVERGENTE";
  if (level === "operator" && row.access_profile === "Inspetor") return "INSPETOR_SEM_PRIVILEGIO";
  if (privileged || level === "operator") return "OK";
  return "REVISAR";
}

async function main() {
  const rows = await query(
    `SELECT e.id AS employee_id,
            e.full_name,
            e.matricula,
            e.access_profile,
            e.status AS employee_status,
            u.id AS user_id,
            u.status AS account_status,
            ual.level_code,
            CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS admin_role,
            latest.action AS last_privileged_action,
            latest.created_at AS last_privileged_action_at,
            COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(latest.details, '$.executed_by_ti')),
              JSON_UNQUOTE(JSON_EXTRACT(latest.details, '$.via'))
            ) AS last_privileged_actor
       FROM employees e
       LEFT JOIN app_users u
         ON LOWER(TRIM(u.matricula)) = LOWER(TRIM(e.matricula))
       LEFT JOIN user_access_levels ual
         ON ual.user_id = u.id
       LEFT JOIN user_roles r
         ON r.user_id = u.id AND r.role = 'admin'
       LEFT JOIN audit_logs latest
         ON latest.id = (
           SELECT al.id
             FROM audit_logs al
            WHERE (
                    al.entity = 'employees'
                AND al.entity_id = e.id
                AND al.action IN ('TI_GRANT_INSPECTOR', 'TI_REVOKE_INSPECTOR')
                  )
               OR (
                    u.id IS NOT NULL
                AND al.entity = 'app_users'
                AND al.entity_id = u.id
                AND al.action IN ('UPDATE_ACCESS_CONTROL', 'BOOTSTRAP_ADMIN', 'TI_GRANT_MASTER_ACCESS')
                  )
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT 1
         )
      WHERE e.access_profile = 'Inspetor'
         OR r.user_id IS NOT NULL
         OR ual.level_code IN ('master', 'admin', 'inspector')
      ORDER BY e.full_name ASC`,
  );

  const overrideRows = await query(
    `SELECT user_id, permission_code, allowed
       FROM user_permission_overrides
      ORDER BY user_id, permission_code`,
  );
  const overridesByUser = new Map();
  for (const row of overrideRows) {
    const list = overridesByUser.get(row.user_id) ?? [];
    list.push(row);
    overridesByUser.set(row.user_id, list);
  }

  const report = rows.map((row) => {
    const levelCode = row.level_code || null;
    const level = levelCode ? levelDefinition(levelCode) : null;
    const permissions = levelCode
      ? effectivePermissions(levelCode, overridesByUser.get(row.user_id) ?? [])
      : [];
    return {
      status: statusFor({ ...row, admin_role: Number(row.admin_role) }),
      nome: row.full_name,
      matricula: row.matricula,
      perfil_funcional: row.access_profile,
      nivel: level?.label ?? "Sem nível",
      permissoes: permissions.length,
      colaborador: row.employee_status,
      conta: row.account_status ?? "Sem conta",
      role_legada_admin: Number(row.admin_role) === 1 ? "sim" : "não",
      ultima_acao: row.last_privileged_action ?? "Sem registro",
      ultima_acao_em: row.last_privileged_action_at ?? "-",
      responsavel: row.last_privileged_actor ?? "-",
    };
  });

  const privilegedOk = report.filter((row) => row.status === "OK" && row.nivel !== "Operador").length;
  const anomalies = report.filter((row) => !new Set(["OK", "SEM_CONTA", "INATIVO"]).has(row.status));

  console.log(`\nSEGEMPAT · Revisão granular de acessos privilegiados`);
  console.log(`Contas privilegiadas coerentes: ${privilegedOk}`);
  console.log(`Registros para revisão: ${anomalies.length}`);
  if (report.length) console.table(report);
  else console.log("Nenhum perfil/nível privilegiado encontrado.");

  if (anomalies.length) {
    console.warn("[segempat-api] atenção: existem divergências entre nível granular, perfil funcional ou role legada que devem ser revisadas pela TI");
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error("[segempat-api] falha ao gerar revisão de privilégios", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
