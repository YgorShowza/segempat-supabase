import { config } from "../src/config.js";
import { pool } from "../src/db.js";

function fail(message) {
  throw new Error(`[runtime-grants] ${message}`);
}

async function main() {
  const client = await pool.connect();
  try {
    const roleResult = await client.query(
      `SELECT current_user AS role_name,
              r.rolsuper,
              r.rolcreaterole,
              r.rolcreatedb,
              r.rolreplication,
              r.rolbypassrls
         FROM pg_roles r
        WHERE r.rolname = current_user`,
    );
    const role = roleResult.rows[0];
    if (!role) fail("não foi possível identificar a role PostgreSQL de runtime");

    const schemaResult = await client.query(
      `SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS can_use,
              has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`,
    );
    const schema = schemaResult.rows[0];
    if (!schema?.can_use) fail("role de runtime não possui USAGE no schema public");

    const dangerousResult = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM pg_tables
        WHERE schemaname = 'public'
          AND (
            has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'TRUNCATE')
            OR has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'TRIGGER')
            OR has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'REFERENCES')
          )`,
    );
    const dangerousTablePrivileges = Number(dangerousResult.rows[0]?.total || 0);

    const elevated = Boolean(
      role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls || schema.can_create || dangerousTablePrivileges > 0,
    );

    if (config.nodeEnv === "production" && elevated) {
      fail(
        `role ${role.role_name} está acima do menor privilégio; produção exige role dedicada sem SUPERUSER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS, sem CREATE no schema e sem TRUNCATE/TRIGGER/REFERENCES`,
      );
    }

    if (config.nodeEnv === "test" && elevated) {
      console.log(`[runtime-grants] ambiente de teste usa role elevada (${role.role_name}); gate estrito permanece obrigatório em produção`);
    } else {
      console.log(`[runtime-grants] PostgreSQL runtime OK; role=${role.role_name}; schema=public; least_privilege=true`);
    }
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("[segempat-api] validação de privilégios PostgreSQL de runtime falhou", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
