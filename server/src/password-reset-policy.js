import { effectivePermissions, fallbackLevel, levelDefinition } from "./authorization.js";

export const PASSWORD_RESET_PERMISSION = "access.password_reset";

function asAuthorization(value) {
  const code = String(value?.code ?? value?.accessLevel ?? "operator").trim().toLowerCase();
  const level = levelDefinition(code);
  const rankValue = Number(value?.rank ?? value?.accessRank);
  return {
    code: level.code,
    label: value?.label ?? value?.accessLevelLabel ?? level.label,
    rank: Number.isFinite(rankValue) ? rankValue : level.rank,
    permissions: Array.isArray(value?.permissions) ? value.permissions : [],
  };
}

/**
 * Regra de autoridade para recuperação administrativa de senha.
 *
 * - Administrador Master nunca é recuperado pelo fluxo administrativo do app;
 *   qualquer recuperação dessa identidade é procedimento exclusivo da TI.
 * - O emissor precisa manter a permissão de recuperação no momento da operação.
 * - O nível do emissor precisa ser estritamente superior ao nível do alvo.
 */
export function passwordResetAuthority(actorValue, targetValue) {
  const actor = asAuthorization(actorValue);
  const target = asAuthorization(targetValue);

  if (target.code === "master") {
    return {
      allowed: false,
      reason: "Recuperação de Administrador Master é exclusiva da TI.",
      actor,
      target,
    };
  }

  if (actor.code !== "master" && !actor.permissions.includes(PASSWORD_RESET_PERMISSION)) {
    return {
      allowed: false,
      reason: "Seu nível de acesso não possui permissão para recuperação de senha.",
      actor,
      target,
    };
  }

  if (actor.rank <= target.rank) {
    return {
      allowed: false,
      reason: "Seu nível não pode redefinir uma conta de nível igual ou superior.",
      actor,
      target,
    };
  }

  return { allowed: true, reason: null, actor, target };
}

/**
 * Recarrega e bloqueia nível + exceções dentro da transação corrente. Isso impede
 * que uma promoção/redução concorrente torne a decisão de reset obsoleta no meio
 * da emissão ou do consumo do código.
 */
export async function lockEffectiveAuthorization(connection, userId, { legacyInspector = false } = {}) {
  const [assignments] = await connection.execute(
    `SELECT level_code
       FROM user_access_levels
      WHERE user_id = ?
      LIMIT 1
      FOR UPDATE`,
    [userId],
  );
  const assignment = assignments[0] ?? null;

  let legacyAdmin = false;
  if (!assignment) {
    const [legacyRoles] = await connection.execute(
      `SELECT id
         FROM user_roles
        WHERE user_id = ? AND role = 'admin'
        LIMIT 1
        FOR UPDATE`,
      [userId],
    );
    legacyAdmin = Boolean(legacyRoles[0]);
  }

  const levelCode = assignment?.level_code || fallbackLevel({ legacyAdmin, legacyInspector });
  const level = levelDefinition(levelCode);
  const [overrides] = assignment
    ? await connection.execute(
        `SELECT permission_code, allowed
           FROM user_permission_overrides
          WHERE user_id = ?
          FOR UPDATE`,
        [userId],
      )
    : [[]];

  return {
    code: level.code,
    label: level.label,
    rank: level.rank,
    permissions: effectivePermissions(level.code, overrides),
  };
}

/** Bloqueia conta, cadastro funcional e autorização efetiva do usuário emissor. */
export async function lockActiveUserAuthorization(connection, userId) {
  const [accounts] = await connection.execute(
    `SELECT id, matricula, status
       FROM app_users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
    [userId],
  );
  const account = accounts[0];
  if (!account || account.status !== "Ativo") return null;

  const [employees] = await connection.execute(
    `SELECT status, access_profile
       FROM employees
      WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?))
      LIMIT 1
      FOR UPDATE`,
    [account.matricula],
  );
  const employee = employees[0];
  if (!employee || employee.status !== "Ativo") return null;

  const authorization = await lockEffectiveAuthorization(connection, account.id, {
    legacyInspector: employee.access_profile === "Inspetor",
  });
  return {
    ...authorization,
    userId: account.id,
    matricula: account.matricula,
  };
}
