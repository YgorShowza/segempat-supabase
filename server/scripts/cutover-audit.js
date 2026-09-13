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

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function scalar(sql, params = []) {
  const row = await queryOne(sql, params);
  return Number(row?.total ?? 0);
}

async function checkIdentity() {
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
  const profileMatriculaMismatch = await scalar(
    `SELECT COUNT(*) AS total
       FROM app_users u
       JOIN profiles p ON p.id = u.id
      WHERE LOWER(TRIM(p.matricula)) <> LOWER(TRIM(u.matricula))`,
  );
  const invalidAdminRole = await scalar(
    `SELECT COUNT(DISTINCT u.id) AS total
       FROM app_users u
       JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
       LEFT JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
      WHERE e.id IS NULL
         OR e.access_profile <> 'Inspetor'
         OR e.status <> 'Ativo'
         OR u.status <> 'Ativo'`,
  );
  const activeInspectorWithoutAdmin = await scalar(
    `SELECT COUNT(*) AS total
       FROM app_users u
       JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
       LEFT JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
      WHERE u.status = 'Ativo'
        AND e.status = 'Ativo'
        AND e.access_profile = 'Inspetor'
        AND r.user_id IS NULL`,
  );
  const activeUsersWithInactiveEmployee = await scalar(
    `SELECT COUNT(*) AS total
       FROM app_users u
       JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula))
      WHERE u.status = 'Ativo' AND e.status <> 'Ativo'`,
  );

  if (employees === 0) fail("nenhum colaborador foi migrado");
  if (activeEmployees === 0) fail("não há colaborador ativo no banco migrado");
  if (orphanUsers > 0) fail(`${orphanUsers} conta(s) não possuem colaborador correspondente por matrícula`);
  if (missingProfiles > 0) fail(`${missingProfiles} conta(s) não possuem profile correspondente`);
  if (profileMatriculaMismatch > 0) fail(`${profileMatriculaMismatch} profile(s) possuem matrícula divergente da conta`);
  if (invalidAdminRole > 0) fail(`${invalidAdminRole} conta(s) mantêm role admin sem Inspetor ativo correspondente`);
  if (activeInspectorWithoutAdmin > 0) fail(`${activeInspectorWithoutAdmin} Inspetor(es) ativo(s) com conta ativa estão sem role admin`);
  if (activeUsersWithInactiveEmployee > 0) warn(`${activeUsersWithInactiveEmployee} conta(s) ativas pertencem a colaborador inativo; o login será bloqueado pela API`);

  console.log(`[cutover] identidade employees=${employees} active_employees=${activeEmployees} users=${users}`);
}

async function checkOperationalIntegrity() {
  const orphanOccurrenceEmployees = await scalar(
    `SELECT COUNT(*) AS total
       FROM occurrences o
       LEFT JOIN employees e ON e.id = o.employee_id
      WHERE o.employee_id IS NOT NULL
        AND e.id IS NULL`,
  );
  const orphanOccurrenceCreators = await scalar(
    `SELECT COUNT(*) AS total
       FROM occurrences o
       LEFT JOIN app_users u ON u.id = o.created_by
      WHERE o.created_by IS NOT NULL
        AND u.id IS NULL`,
  );
  const orphanPracticalEmployees = await scalar(
    `SELECT COUNT(*) AS total
       FROM practical_evaluations p
       LEFT JOIN employees e ON e.id = p.employee_id
      WHERE e.id IS NULL`,
  );
  const orphanPracticalEvaluators = await scalar(
    `SELECT COUNT(*) AS total
       FROM practical_evaluations p
       LEFT JOIN app_users u ON u.id = p.evaluator_id
      WHERE p.evaluator_id IS NOT NULL
        AND u.id IS NULL`,
  );
  const orphanPracticalTemplateCreators = await scalar(
    `SELECT COUNT(*) AS total
       FROM practical_eval_templates t
       LEFT JOIN app_users u ON u.id = t.created_by
      WHERE t.created_by IS NOT NULL
        AND u.id IS NULL`,
  );
  const orphanActivationEmployees = await scalar(
    `SELECT COUNT(*) AS total
       FROM registration_activation_codes r
       LEFT JOIN employees e ON e.id = r.employee_id
      WHERE e.id IS NULL`,
  );
  const orphanActivationCreators = await scalar(
    `SELECT COUNT(*) AS total
       FROM registration_activation_codes r
       LEFT JOIN app_users u ON u.id = r.created_by
      WHERE r.created_by IS NOT NULL
        AND u.id IS NULL`,
  );
  const occurrenceIdentityMismatch = await scalar(
    `SELECT COUNT(*) AS total
       FROM occurrences o
       JOIN employees e ON e.id = o.employee_id
      WHERE o.employee_id IS NOT NULL
        AND (
          COALESCE(o.employee_name, '') <> COALESCE(e.full_name, '')
          OR LOWER(TRIM(COALESCE(o.employee_matricula, ''))) <> LOWER(TRIM(COALESCE(e.matricula, '')))
        )`,
  );
  const practicalIdentityMismatch = await scalar(
    `SELECT COUNT(*) AS total
       FROM practical_evaluations p
       JOIN employees e ON e.id = p.employee_id
      WHERE COALESCE(p.employee_name, '') <> COALESCE(e.full_name, '')
         OR LOWER(TRIM(COALESCE(p.employee_matricula, ''))) <> LOWER(TRIM(COALESCE(e.matricula, '')))
         OR COALESCE(p.employee_sector, '') <> COALESCE(e.sector, '')`,
  );
  const pendingActivationForInactiveEmployee = await scalar(
    `SELECT COUNT(*) AS total
       FROM registration_activation_codes r
       JOIN employees e ON e.id = r.employee_id
      WHERE r.used_at IS NULL
        AND e.status <> 'Ativo'`,
  );
  const pendingActivationWithAccount = await scalar(
    `SELECT COUNT(*) AS total
       FROM registration_activation_codes r
       JOIN employees e ON e.id = r.employee_id
       JOIN app_users u ON LOWER(TRIM(u.matricula)) = LOWER(TRIM(e.matricula))
      WHERE r.used_at IS NULL`,
  );

  if (orphanOccurrenceEmployees > 0) fail(`${orphanOccurrenceEmployees} ocorrência(s) referenciam colaborador inexistente`);
  if (orphanOccurrenceCreators > 0) fail(`${orphanOccurrenceCreators} ocorrência(s) referenciam criador inexistente`);
  if (orphanPracticalEmployees > 0) fail(`${orphanPracticalEmployees} avaliação(ões) prática(s) referenciam colaborador inexistente`);
  if (orphanPracticalEvaluators > 0) fail(`${orphanPracticalEvaluators} avaliação(ões) prática(s) referenciam avaliador inexistente`);
  if (orphanPracticalTemplateCreators > 0) fail(`${orphanPracticalTemplateCreators} modelo(s) de avaliação prática referenciam criador inexistente`);
  if (orphanActivationEmployees > 0) fail(`${orphanActivationEmployees} código(s) de ativação referenciam colaborador inexistente`);
  if (orphanActivationCreators > 0) fail(`${orphanActivationCreators} código(s) de ativação referenciam criador inexistente`);
  if (occurrenceIdentityMismatch > 0) {
    fail(`${occurrenceIdentityMismatch} ocorrência(s) possuem snapshot de identidade divergente do colaborador relacionado`);
  }
  if (practicalIdentityMismatch > 0) {
    fail(`${practicalIdentityMismatch} avaliação(ões) prática(s) possuem snapshot funcional divergente do colaborador relacionado`);
  }
  if (pendingActivationForInactiveEmployee > 0) {
    fail(`${pendingActivationForInactiveEmployee} código(s) de ativação pendente(s) pertencem a colaborador inativo`);
  }
  if (pendingActivationWithAccount > 0) {
    fail(`${pendingActivationWithAccount} código(s) de ativação pendente(s) pertencem a matrícula que já possui conta`);
  }

  console.log(
    `[cutover] operação orphan_refs=${orphanOccurrenceEmployees + orphanOccurrenceCreators + orphanPracticalEmployees + orphanPracticalEvaluators + orphanPracticalTemplateCreators + orphanActivationEmployees + orphanActivationCreators} occurrence_identity_mismatch=${occurrenceIdentityMismatch} practical_identity_mismatch=${practicalIdentityMismatch} pending_activation_inactive=${pendingActivationForInactiveEmployee} pending_activation_with_account=${pendingActivationWithAccount}`,
  );
}

async function checkTrainingQuestionCoverage() {
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

  const difficulties = ["Básico", "Intermediário", "Avançado"];
  for (const row of sectors) {
    const sector = String(row.sector);
    const quick = await scalar(
      `SELECT COUNT(*) AS total
         FROM question_bank
        WHERE active = 1
          AND JSON_LENGTH(options) >= 2
          AND (target_sector = 'Todos' OR target_sector = ?)`,
      [sector],
    );
    const daily = await scalar(
      `SELECT COUNT(*) AS total
         FROM question_bank
        WHERE active = 1
          AND bank_type = 'treinamento_dinamico'
          AND JSON_LENGTH(options) >= 2
          AND (target_sector = 'Todos' OR target_sector = ?)`,
      [sector],
    );
    const stress = await scalar(
      `SELECT COUNT(*) AS total
         FROM question_bank
        WHERE active = 1
          AND bank_type = 'simulacoes'
          AND JSON_LENGTH(options) >= 2
          AND (target_sector = 'Todos' OR target_sector = ?)`,
      [sector],
    );

    if (quick < 5) fail(`setor ${sector}: Teste Rápido exige ao menos 5 questões compatíveis; encontradas ${quick}`);
    if (daily < 3) fail(`setor ${sector}: Desafio Diário exige ao menos 3 questões treinamento_dinamico; encontradas ${daily}`);
    if (stress < 1) fail(`setor ${sector}: não há questões simulacoes para Simulador/Stress Test`);

    for (const difficulty of difficulties) {
      const count = await scalar(
        `SELECT COUNT(*) AS total
           FROM question_bank
          WHERE active = 1
            AND bank_type = 'simulacoes'
            AND difficulty = ?
            AND JSON_LENGTH(options) >= 2
            AND (target_sector = 'Todos' OR target_sector = ?)`,
        [difficulty, sector],
      );
      if (count < 1) fail(`setor ${sector}: Simulador sem cenário ativo na dificuldade ${difficulty}`);
    }

    console.log(`[cutover] questões sector=${sector} quick=${quick} daily=${daily} simulations=${stress}`);
  }
}

async function checkStoredSignatureFiles() {
  const storageRoot = path.resolve(config.storage.path);
  const storageRootReal = await fs.realpath(storageRoot);
  const rows = await query(
    `SELECT id, signature_path
       FROM exam_attempts
      WHERE signature_agreed = 1
        AND signed_at IS NOT NULL
        AND signature_path IS NOT NULL`,
  );

  let missing = 0;
  let invalidPath = 0;
  let invalidPng = 0;
  let invalidSize = 0;
  for (const row of rows) {
    const relativePath = String(row.signature_path || "").trim();
    const absolutePath = path.resolve(storageRoot, relativePath);
    if (!relativePath || !isPathInside(storageRoot, absolutePath)) {
      invalidPath += 1;
      continue;
    }
    try {
      const realPath = await fs.realpath(absolutePath);
      if (!isPathInside(storageRootReal, realPath)) {
        invalidPath += 1;
        continue;
      }
      const stat = await fs.stat(realPath);
      if (!stat.isFile() || stat.size < 100 || stat.size > 1_500_000) {
        invalidSize += 1;
        continue;
      }
      const handle = await fs.open(realPath, "r");
      try {
        const header = Buffer.alloc(PNG_SIGNATURE.length);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (bytesRead !== PNG_SIGNATURE.length || !header.equals(PNG_SIGNATURE)) invalidPng += 1;
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error?.code === "ENOENT") missing += 1;
      else throw error;
    }
  }

  if (invalidPath > 0) fail(`${invalidPath} assinatura(s) possuem caminho inválido ou escapam do storage configurado`);
  if (missing > 0) fail(`${missing} arquivo(s) de assinatura registrados no MySQL não existem no storage`);
  if (invalidSize > 0) fail(`${invalidSize} arquivo(s) de assinatura possuem tamanho inválido ou não são arquivos regulares`);
  if (invalidPng > 0) fail(`${invalidPng} arquivo(s) de assinatura registrados não possuem assinatura PNG completa`);
  console.log(`[cutover] evidências assinaturas_registradas=${rows.length}`);
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

  if (invalidSignatureState > 0) fail(`${invalidSignatureState} tentativa(s) possuem estado de assinatura incompatível com aprovação/certificado`);
  if (malformedCertificates > 0) fail(`${malformedCertificates} certificado(s) divergem da tentativa assinada/aprovada`);
  if (signedWithoutCertificate > 0) fail(`${signedWithoutCertificate} tentativa(s) aprovadas e assinadas estão sem certificado correspondente`);
  if (malformedRevocation > 0) fail(`${malformedRevocation} certificado(s) possuem estado de revogação inconsistente`);
  await checkStoredSignatureFiles();
}

async function checkForeignKeySession() {
  const row = await queryOne(`SELECT @@FOREIGN_KEY_CHECKS AS enabled`);
  if (Number(row?.enabled) !== 1) fail("FOREIGN_KEY_CHECKS está desabilitado na sessão de auditoria");
}

async function main() {
  try {
    await checkForeignKeySession();
    await checkIdentity();
    await checkOperationalIntegrity();
    await checkTrainingQuestionCoverage();
    await checkExamEvidence();

    for (const message of warnings) console.warn(`[cutover][AVISO] ${message}`);
    if (failures.length > 0) {
      for (const message of failures) console.error(`[cutover][FALHA] ${message}`);
      throw new Error(`[cutover] auditoria reprovada com ${failures.length} pendência(s)`);
    }
    console.log(`[cutover] OK — integridade funcional mínima aprovada${warnings.length ? ` com ${warnings.length} aviso(s)` : ""}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
