import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function readContract(filename) {
  for (const candidate of [`.github/contracts/${filename}`, `.github/workflows/${filename}`]) {
    if (fs.existsSync(candidate)) return read(candidate);
  }
  throw new Error(`Contrato CI não encontrado: ${filename}`);
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[password-reset-privilege-boundary] ausente: ${label}`);
    process.exitCode = 1;
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    console.error(`[password-reset-privilege-boundary] proibido: ${label}`);
    process.exitCode = 1;
  }
}

const policy = read("server/src/password-reset-policy.js");
const access = read("server/src/routes/access.js");
const auth = read("server/src/routes/auth.js");
const gateway = read("src/lib/backend/access-gateway.ts");
const ui = read("src/components/access/AccessActivationAdmin.tsx");
const workflow = readContract("password-recovery.yml");

requireText(policy, 'PASSWORD_RESET_PERMISSION = "access.password_reset"', "permissão de recuperação centralizada");
requireText(policy, 'target.code === "master"', "Master bloqueado no fluxo administrativo de recuperação");
requireText(policy, "Recuperação de Administrador Master é exclusiva da TI", "mensagem de procedimento exclusivo da TI");
requireText(policy, "actor.rank <= target.rank", "hierarquia exige emissor estritamente superior");
requireText(policy, "actor.permissions.includes(PASSWORD_RESET_PERMISSION)", "permissão atual do emissor é revalidada");
requireText(policy, "lockEffectiveAuthorization", "nível e overrides são bloqueados dentro da transação");
requireText(policy, "FOR UPDATE", "locks transacionais no motor da política");
requireText(policy, "effectivePermissions", "exceções atuais participam da decisão");

requireText(access, "passwordResetAuthority(req.user, targetAuthorization)", "estado de autoridade exposto na listagem administrativa");
requireText(access, "password_reset_allowed", "API informa se recuperação é permitida para o ator atual");
requireText(access, "password_reset_block_reason", "API informa motivo seguro de bloqueio administrativo");
requireText(access, "lockActiveUserAuthorization(connection, req.user.id)", "emissor é revalidado na emissão/revogação");
requireText(access, "lockEffectiveAuthorization(connection, account.id", "alvo é revalidado na emissão/revogação");
requireText(access, "if (!authority.allowed) throw forbidden(authority.reason)", "backend bloqueia emissão fora da hierarquia");
requireText(access, "actor_access_level", "auditoria registra nível do emissor");
requireText(access, "target_access_level", "auditoria registra nível do alvo");
requireText(access, "strict_hierarchy: true", "auditoria marca regra de hierarquia");
requireText(access, "master_recovery_ti_only: true", "auditoria marca proteção do Master");

requireText(auth, "SELECT code_hash, failed_attempts, created_by", "consumo vincula código ao emissor original");
requireText(auth, "lockActiveUserAuthorization(connection, token.created_by)", "consumo revalida emissor atual");
requireText(auth, "passwordResetAuthority(issuerAuthorization, targetAuthorization)", "consumo revalida hierarquia atual");
requireText(auth, "SET locked_at = COALESCE(locked_at, UTC_TIMESTAMP(3))", "código perde validade definitivamente se a autoridade deixa de valer");
requireText(auth, "strict_hierarchy_revalidated: true", "sucesso audita revalidação da hierarquia");
requireText(auth, "session_epoch = session_epoch + 1", "reset continua revogando sessões anteriores");
requireText(auth, "MAX_RESET_CODE_ATTEMPTS = 5", "limite de tentativas continua protegido");
forbidText(auth, "Recuperação de Administrador Master é exclusiva da TI", "endpoint público não deve revelar nível privilegiado do alvo");

requireText(gateway, "password_reset_allowed?: boolean", "contrato frontend recebe autoridade de recuperação");
requireText(gateway, "password_reset_block_reason?: string | null", "contrato frontend recebe motivo de bloqueio");
requireText(gateway, 'access_level?: "master" | "admin" | "inspector" | "operator" | null', "contrato frontend recebe nível do alvo");

requireText(ui, "const resetAllowed = row.password_reset_allowed !== false", "UI respeita autoridade calculada pelo backend");
requireText(ui, "row.password_reset_block_reason", "UI explica bloqueio de recuperação");
requireText(ui, "recoveryUnavailableInDemo || !resetAllowed", "revogação administrativa respeita a hierarquia");
requireText(ui, "row.account_active === false || !resetAllowed", "emissão administrativa respeita conta ativa e hierarquia");
requireText(ui, "row.access_level_label.toUpperCase()", "UI identifica o nível da conta alvo");

requireText(workflow, "node scripts/check-password-reset-privilege-boundary.mjs", "contrato de hierarquia executado no CI");
requireText(workflow, "node --check server/src/password-reset-policy.js", "sintaxe do motor da política protegida no CI");
requireText(workflow, "node --check server/src/routes/access.js", "sintaxe da emissão administrativa protegida no CI");
requireText(workflow, "node --check server/src/routes/auth.js", "sintaxe do consumo público protegida no CI");

if (process.exitCode) process.exit(process.exitCode);
console.log("SEGEMPAT password reset privilege boundary contract: OK");
