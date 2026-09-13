import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { validateRuntimeGrantStatements } from "../src/runtime-grants.js";

function grantText(row) {
  return Object.values(row ?? {}).map((value) => String(value ?? "")).find(Boolean) || "";
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const [roleRows] = await connection.query("SELECT CURRENT_ROLE() AS current_role");
    const roles = String(roleRows?.[0]?.current_role || "NONE").trim();
    const usingClause = roles && roles.toUpperCase() !== "NONE" ? ` USING ${roles}` : "";
    const [grantRows] = await connection.query(`SHOW GRANTS FOR CURRENT_USER${usingClause}`);
    const grants = grantRows.map(grantText).filter(Boolean);
    const problems = validateRuntimeGrantStatements(grants, config.db.database);

    if (problems.length) {
      throw new Error(`MYSQL_USER não está em menor privilégio: ${problems.join("; ")}`);
    }

    console.log(
      `[segempat-api] grants de runtime OK; database=${config.db.database}; privilégios permitidos=SELECT,INSERT,UPDATE,DELETE; roles=${roles}`,
    );
  } finally {
    connection.release();
  }
}

main()
  .catch((error) => {
    console.error("[segempat-api] validação de grants de runtime falhou", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
