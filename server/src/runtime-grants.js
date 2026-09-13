const ALLOWED_DATA_PRIVILEGES = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);

function normalizeIdentifier(value) {
  return String(value || "").replace(/`/g, "").trim().toLowerCase();
}

function parsePrivilegeList(grant) {
  const match = /^GRANT\s+(.+?)\s+ON\s+/i.exec(grant);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function parseScope(grant) {
  const match = /\sON\s+(.+?)\s+TO\s+/i.exec(grant);
  return match ? normalizeIdentifier(match[1]) : null;
}

export function validateRuntimeGrantStatements(grants, database) {
  const problems = [];
  const expectedDatabase = normalizeIdentifier(database);

  if (!expectedDatabase) return ["database esperado está vazio"];
  if (!Array.isArray(grants) || grants.length === 0) return ["SHOW GRANTS não retornou privilégios para MYSQL_USER"];

  for (const rawGrant of grants) {
    const grant = String(rawGrant || "").trim();
    if (!grant) continue;
    const upper = grant.toUpperCase();

    if (upper.includes("WITH GRANT OPTION")) {
      problems.push("GRANT OPTION não é permitido para MYSQL_USER de runtime");
      continue;
    }

    const scope = parseScope(grant);
    if (!scope) {
      // Linhas sem ON normalmente representam atribuição de role. Quando há role
      // ativa, SHOW GRANTS ... USING expande seus privilégios efetivos nas demais linhas.
      continue;
    }

    const privileges = parsePrivilegeList(grant);
    const usageOnly = privileges.length === 1 && privileges[0] === "USAGE";
    if (scope === "*.*") {
      if (!usageOnly) problems.push(`privilégio global não permitido: ${grant}`);
      continue;
    }

    const scopeInsideDatabase = scope === `${expectedDatabase}.*` || scope.startsWith(`${expectedDatabase}.`);
    if (!scopeInsideDatabase) {
      problems.push(`acesso fora do database ${database} não permitido: ${grant}`);
      continue;
    }

    for (const privilege of privileges) {
      if (!ALLOWED_DATA_PRIVILEGES.has(privilege)) {
        problems.push(`privilégio de runtime não permitido no SEGEMPAT: ${privilege}`);
      }
    }
  }

  return [...new Set(problems)];
}
