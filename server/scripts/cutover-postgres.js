import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config.js";
import { pool, query, queryOne } from "../src/db.js";

const failures = [];
const warnings = [];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function scalar(sql, params = []) {
  const row = await queryOne(sql, params);
  return Number(row?.total ?? 0);
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function checkDatabaseSafety() {
  const session = await queryOne(
    `SELECT current_database() AS database_name,
            current_setting('TimeZone') AS time_zone,
            current_setting('server_encoding') AS server_encoding,
            current_setting('session_replication_role') AS replication_role`,
  );
  if (!session?.database_name) fail("nenhum database PostgreSQL selecionado");
  if (!["UTC", "ETC/UTC", "+00:00"].includes(String(session?.time_zone || "").toUpperCase())) {
    fail(`sessão PostgreSQL fora de UTC: ${session?.time_zone || "desconhecido"}`);
  }
  if (String(session?.server_encoding || "").toUpperCase() !== "UTF8") {
    fail(`server_encoding PostgreSQL deve ser UTF8; detectado: ${session?.server_encoding || "desconhecido"}`);
  }
  if (String(session?.replication_role || "").toLowerCase() !== "origin") {
    fail(`session_replication_role deve ser origin; detectado: ${session?.replication_role || "desconhecido"}`);
  }

  const invalidFks = await scalar(
    `SELECT COUNT(*) AS total
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.contype = 'f'
        AND NOT c.convalidated`,
  );
  if (invalidFks > 0) fail(`${invalidFks} foreign key(s) PostgreSQL não estão validadas`);

  const invalidChecks = await scalar(
    `SELECT COUNT(*) AS total
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.contype = 'c'
        AND NOT c.convalidated`,
  );
  if (invalidChecks > 0) fail(`${invalidChecks} CHECK constraint(s) PostgreSQL não estão validadas`);
}

async function checkIdentityAndAccess() {
  const employees = await scalar(`SELECT COUNT(*) AS total FROM employees`);
  const activeEmployees = await scalar(`SELECT COUNT(*) AS total FROM employees WHERE status = 'Ativo'`);
  const users = await scalar(`SELECT COUNT(*) AS total FROM app_users`);
  const orphanUsers = await scalar(
    `SELECT COUNT(*) AS total
       FROM app_users u
       LEFT JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
      WHERE e.id IS NULL`,
  );
  const missingProfiles = await scalar(
    `SELECT COUNT(*) AS total
       FROM app_users u
       LEFT JOIN profiles p ON p.id = u.id
      WHERE p.id IS NULL`,
  );
  const profileMismatch = await scalar(
    `SELECT COUNT(*) AS total
       FROM app_users u
       JOIN profiles p ON p.id = u.id
      WHERE LOWER(TRIM(p.matricula)) <> LOWER(TRIM(u.matricula))`,
  );
  const privilegedWithoutLegacyRole = await scalar(
    `SELECT COUNT(*) AS total
       FROM user_access_levels ual
       JOIN app_users u ON u.id = ual.user_id
       LEFT JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
      WHERE ual.level_code IN ('master', 'admin', 'inspector')
        AND u.status = 'Ativo'
        AND r.user_id IS NULL`,
  );
  const legacyRoleWithoutPrivilege = await scalar(
    `SELECT COUNT(*) AS total
       FROM user_roles r
       JOIN app_users u ON u.id = r.user_id
       LEFT JOIN user_access_levels ual ON ual.user_id = u.id
      WHERE r.role = 'admin'
        AND u.status = 'Ativo'
        AND COALESCE(ual.level_code, '') NOT IN ('master', 'admin', 'inspector')`,
  );
  const activeMasters = await scalar(
    `SELECT COUNT(*) AS total
       FROM user_access_levels ual
       JOIN app_users u ON u.id = ual.user_id
       JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
      WHERE ual.level_code = 'master'
        AND u.status = 'Ativo'
        AND e.status = 'Ativo'`,
  );

  if (employees === 0) fail("nenhum colaborador foi carregado");
  if (activeEmployees === 0) fail("não há colaborador ativo");
  if (users === 0) fail("não há conta de acesso cadastrada");
  if (orphanUsers > 0) fail(`${orphanUsers} conta(s) não possuem colaborador correspondente por matrícula`);
  if (missingProfiles > 0) fail(`${missingProfiles} conta(s) não possuem profile correspondente`);
  if (profileMismatch > 0) fail(`${profileMismatch} profile(s) possuem matrícula divergente da conta`);
  if (privilegedWithoutLegacyRole > 0) fail(`${privilegedWithoutLegacyRole} conta(s) privilegiada(s) estão sem role legada de compatibilidade`);
  if (legacyRoleWithoutPrivilege > 0) fail(`${legacyRoleWithoutPrivilege} conta(s) possuem role admin sem nível granular privilegiado`);
  if (activeMasters < 1) fail("nenhum Administrador Master ativo encontrado para continuidade operacional");

  console.log(`[cutover-pg] identidade employees=${employees} active=${activeEmployees} users=${users} masters=${activeMasters}`);
}

async function checkOperationalSnapshots() {
  const occurrenceMismatch = await scalar(
    `SELECT COUNT(*) AS total
       FROM occurrences o
       JOIN employees e ON e.id = o.employee_id
      WHERE o.employee_id IS NOT NULL
        AND (
          COALESCE(o.employee_name, '') <> COALESCE(e.full_name, '')
          OR LOWER(TRIM(COALESCE(o.employee_matricula, ''))) <> LOWER(TRIM(COALESCE(e.matricula, '')))
        )`,
  );
  const practicalMismatch = await scalar(
    `SELECT COUNT(*) AS total
       FROM practical_evaluations p
       JOIN employees e ON e.id = p.employee_id
      WHERE COALESCE(p.employee_name, '') <> COALESCE(e.full_name, '')
         OR LOWER(TRIM(COALESCE(p.employee_matricula, ''))) <> LOWER(TRIM(COALESCE(e.matricula, '')))
         OR COALESCE(p.employee_sector, '') <> COALESCE(e.sector, '')`,
  );
  const pendingActivationInactive = await scalar(
    `SELECT COUNT(*) AS total
       FROM registration_activation_codes r
       JOIN employees e ON e.id = r.employee_id
      WHERE r.used_at IS NULL AND e.status <> 'Ativo'`,
  );
  const pendingActivationWithAccount = await scalar(
    `SELECT COUNT(*) AS total
       FROM registration_activation_codes r
       JOIN employees e ON e.id = r.employee_id
       JOIN app_users u ON LOWER(TRIM(u.matricula)) = LOWER(TRIM(e.matricula))
      WHERE r.used_at IS NULL`,
  );

  if (occurrenceMismatch > 0) fail(`${occurrenceMismatch} ocorrência(s) possuem snapshot de identidade divergente`);
  if (practicalMismatch > 0) fail(`${practicalMismatch} avaliação(ões) prática(s) possuem snapshot funcional divergente`);
  if (pendingActivationInactive > 0) fail(`${pendingActivationInactive} código(s) de ativação pendente(s) pertencem a colaborador inativo`);
  if (pendingActivationWithAccount > 0) fail(`${pendingActivationWithAccount} código(s) de ativação pendente(s) pertencem a matrícula com conta`);
}

async function checkTrainingCoverage() {
  const sectors = await query(
    `SELECT DISTINCT sector
       FROM employees
      WHERE status = 'Ativo' AND access_profile <> 'Inspetor'
      ORDER BY sector`,
  );
  if (sectors.length === 0) {
    warn("não há setores operacionais ativos para validar cobertura de treinamento");
    return;
  }

  for (const row of sectors) {
    const sector = String(row.sector);
    const quick = await scalar(
      `SELECT COUNT(*) AS total
         FROM question_bank
        WHERE active = 1
          AND jsonb_typeof(options) = 'array'
          AND jsonb_array_length(options) >= 2
          AND (target_sector = 'Todos' OR target_sector = ?)`,
      [sector],
    );
    const daily = await scalar(
      `SELECT COUNT(*) AS total
         FROM question_bank
        WHERE active = 1
          AND bank_type = 'treinamento_dinamico'
          AND jsonb_typeof(options) = 'array'
          AND jsonb_array_length(options) >= 2
          AND (target_sector = 'Todos' OR target_sector = ?)`,
      [sector],
    );
    const simulations = await scalar(
      `SELECT COUNT(*) AS total
         FROM question_bank
        WHERE active = 1
          AND bank_type = 'simulacoes'
          AND jsonb_typeof(options) = 'array'
          AND jsonb_array_length(options) >= 2
          AND (target_sector = 'Todos' OR target_sector = ?)`,
      [sector],
    );

    if (quick < 5) fail(`setor ${sector}: Teste Rápido exige ao menos 5 questões compatíveis; encontradas ${quick}`);
    if (daily < 3) fail(`setor ${sector}: Desafio Diário exige ao menos 3 questões; encontradas ${daily}`);
    if (simulations < 1) fail(`setor ${sector}: não há questões de simulação ativas`);
    console.log(`[cutover-pg] questões sector=${sector} quick=${quick} daily=${daily} simulations=${simulations}`);
  }
}

async function checkExamEvidence() {
  const invalidSignatureState = await scalar(
    `SELECT COUNT(*) AS total
       FROM exam_attempts a
      WHERE (a.signature_agreed = 1 OR a.signed_at IS NOT NULL OR a.signature_path IS NOT NULL OR a.signature_name IS NOT NULL)
        AND (
          a.passed <> 1
          OR a.certificate_code IS NULL
          OR a.signature_agreed <> 1
          OR a.signed_at IS NULL
          OR a.signature_path IS NULL
          OR a.signature_name IS NULL
        )`,
  );
  const malformedCertificates = await scalar(
    `SELECT COUNT(*) AS total
       FROM certificates c
       JOIN exam_attempts a ON a.id = c.attempt_id
      WHERE a.passed <> 1
         OR a.signature_agreed <> 1
         OR a.signed_at IS NULL
         OR a.signature_path IS NULL
         OR a.signature_name IS NULL
         OR a.certificate_code IS NULL
         OR c.verification_code <> a.certificate_code
         OR c.user_id <> a.user_id
         OR c.exam_id <> a.exam_id
         OR COALESCE(c.matricula, '') <> COALESCE(a.matricula, '')
         OR c.score <> a.score`,
  );
  const signedWithoutCertificate = await scalar(
    `SELECT COUNT(*) AS total
       FROM exam_attempts a
       LEFT JOIN certificates c ON c.attempt_id = a.id
      WHERE a.passed = 1
        AND a.signature_agreed = 1
        AND a.signed_at IS NOT NULL
        AND a.signature_path IS NOT NULL
        AND a.signature_name IS NOT NULL
        AND a.certificate_code IS NOT NULL
        AND c.id IS NULL`,
  );
  const malformedRevocation = await scalar(
    `SELECT COUNT(*) AS total
       FROM certificates
      WHERE (revoked = 1 AND revoked_at IS NULL)
         OR (revoked = 0 AND (revoked_at IS NOT NULL OR revoked_reason IS NOT NULL))`,
  );

  if (invalidSignatureState > 0) fail(`${invalidSignatureState} tentativa(s) possuem estado de assinatura incompatível`);
  if (malformedCertificates > 0) fail(`${malformedCertificates} certificado(s) divergem da tentativa aprovada/assinada`);
  if (signedWithoutCertificate > 0) fail(`${signedWithoutCertificate} tentativa(s) aprovadas/assinadas estão sem certificado`);
  if (malformedRevocation > 0) fail(`${malformedRevocation} certificado(s) possuem estado de revogação inconsistente`);

  const storageRoot = path.resolve(config.storage.path);
  const storageRootReal = await fs.realpath(storageRoot);
  const rows = await query(
    `SELECT id, signature_path
       FROM exam_attempts
      WHERE signature_agreed = 1
        AND signed_at IS NOT NULL
        AND signature_path IS NOT NULL`,
  );

  for (const row of rows) {
    const relativePath = String(row.signature_path || "").trim();
    const absolutePath = path.resolve(storageRoot, relativePath);
    if (!relativePath || !isPathInside(storageRoot, absolutePath)) {
      fail(`assinatura ${row.id} possui caminho inválido`);
      continue;
    }
    try {
      const realPath = await fs.realpath(absolutePath);
      if (!isPathInside(storageRootReal, realPath)) {
        fail(`assinatura ${row.id} escapa do storage configurado`);
        continue;
      }
      const stat = await fs.stat(realPath);
      if (!stat.isFile() || stat.size < 100 || stat.size > 1_500_000) {
        fail(`assinatura ${row.id} possui tamanho/formato físico inválido`);
        continue;
      }
      const handle = await fs.open(realPath, "r");
      try {
        const header = Buffer.alloc(PNG_SIGNATURE.length);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (bytesRead !== PNG_SIGNATURE.length || !header.equals(PNG_SIGNATURE)) {
          fail(`assinatura ${row.id} não possui cabeçalho PNG válido`);
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error?.code === "ENOENT") fail(`arquivo de assinatura ${row.id} não existe no storage`);
      else throw error;
    }
  }
  console.log(`[cutover-pg] evidências assinaturas_registradas=${rows.length}`);
}

async function main() {
  try {
    await checkDatabaseSafety();
    await checkIdentityAndAccess();
    await checkOperationalSnapshots();
    await checkTrainingCoverage();
    await checkExamEvidence();

    for (const message of warnings) console.warn(`[cutover-pg][AVISO] ${message}`);
    if (failures.length > 0) {
      for (const message of failures) console.error(`[cutover-pg][FALHA] ${message}`);
      throw new Error(`[cutover-pg] auditoria reprovada com ${failures.length} pendência(s)`);
    }

    console.log(`[cutover-pg] OK — integridade funcional PostgreSQL aprovada${warnings.length ? ` com ${warnings.length} aviso(s)` : ""}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
