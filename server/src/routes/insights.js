import { Router } from "express";
import { query, queryOne } from "../db.js";
import { hasAnyPermission } from "../authorization.js";
import { requireAdmin } from "../session.js";
import { asBool, asyncHandler, badRequest, forbidden, notFound, parseJson } from "../util.js";

export const insightsRouter = Router();

const OPERATIONAL_INSIGHT_PERMISSIONS = [
  "dashboard.view",
  "attention.view",
  "team.view",
  "risk.view",
  "analytics.view",
  "reports.view",
];

function requireAnyInsightPermission(permissions) {
  return (req, _res, next) => {
    if (!hasAnyPermission(req.user, permissions)) {
      return next(forbidden("Seu nível de acesso não possui permissão para consultar esta visão gerencial"));
    }
    return next();
  };
}

function operationalYearBounds(year) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw badRequest("Ano inválido");
  return {
    start: `${year}-01-01 03:00:00`,
    end: `${year + 1}-01-01 03:00:00`,
    firstMonth: `${year}-01`,
    lastMonth: `${year}-12`,
  };
}

function mapEmployee(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    matricula: row.matricula,
    sector: row.sector,
    access_profile: row.access_profile,
    status: row.status,
    level: Number(row.level ?? 1),
    points: Number(row.points ?? 0),
    first_access: asBool(row.first_access),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapExamMetadata(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    exam_type: row.exam_type,
    target_sector: row.target_sector,
    min_approval_pct: Number(row.min_approval_pct ?? 70),
    scheduled_date: row.scheduled_date,
    status: row.status,
    questions: [],
    question_count: Number(row.question_count ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapAttemptSummary(row) {
  return {
    id: row.id,
    exam_id: row.exam_id,
    user_id: row.user_id,
    matricula: row.matricula,
    score: Number(row.score ?? 0),
    passed: asBool(row.passed),
    certificate_code: row.certificate_code ?? null,
    signature_path: null,
    signature_name: null,
    signed_at: row.signed_at ?? null,
    signature_agreed: asBool(row.signature_agreed),
    finished_at: row.finished_at,
    created_at: row.created_at,
  };
}

function mapCronogramaEntry(row) {
  return {
    ...row,
    question_bank_ids: parseJson(row.question_bank_ids, []),
  };
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function buildSafeQuestionEvidence(questions, answers) {
  return questions.map((question, index) => {
    const id = String(question?.id ?? `q-${index + 1}`);
    const type = String(question?.type || "Múltipla escolha");
    const statement = String(question?.statement || question?.question || `Questão ${index + 1}`);
    const rawAnswer = answers?.[id];
    const options = Array.isArray(question?.options) ? question.options.map((item) => String(item ?? "")) : [];
    if (type === "Múltipla escolha") {
      const selectedIndex = Number(rawAnswer);
      const correctIndex = Number(question?.correct_index);
      const answer = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < options.length
        ? options[selectedIndex]
        : rawAnswer == null ? "Não respondida" : String(rawAnswer);
      return {
        id,
        order: index + 1,
        type,
        statement,
        answer,
        correct: Number.isInteger(selectedIndex) && Number.isInteger(correctIndex) && selectedIndex === correctIndex,
      };
    }
    const answer = rawAnswer == null || String(rawAnswer).trim() === "" ? "Não respondida" : String(rawAnswer);
    const expected = normalizeText(question?.model_answer);
    return { id, order: index + 1, type, statement, answer, correct: Boolean(expected) && normalizeText(answer) === expected };
  });
}

insightsRouter.get(
  "/operational-snapshot",
  requireAdmin,
  requireAnyInsightPermission(OPERATIONAL_INSIGHT_PERMISSIONS),
  asyncHandler(async (req, res) => {
    const year = Number(req.query["year"] ?? new Date().getUTCFullYear());
    const bounds = operationalYearBounds(year);

    const [employees, exams, attempts, cronograma] = await Promise.all([
      query(`SELECT id, full_name, matricula, sector, access_profile, status, level, points, first_access, created_at, updated_at
               FROM employees
              ORDER BY full_name ASC`),
      query(`SELECT id, title, description, exam_type, target_sector, min_approval_pct, scheduled_date, status,
                    JSON_LENGTH(questions) AS question_count, created_at, updated_at
               FROM exams
              ORDER BY created_at DESC`),
      query(`SELECT id, exam_id, user_id, matricula, score, passed, certificate_code, signature_agreed, signed_at, finished_at, created_at
               FROM exam_attempts
              WHERE finished_at >= ? AND finished_at < ?
              ORDER BY finished_at DESC`, [bounds.start, bounds.end]),
      query(`SELECT id, month, employee_id, employee_name, employee_matricula, employee_sector, theme, exam_id, exam_title,
                    type, status, justification, planned_date, completion_date, notes, question_bank_ids, created_by, created_at, updated_at
               FROM cronograma_entries
              WHERE month >= ? AND month <= ?
              ORDER BY month ASC, employee_name ASC`, [bounds.firstMonth, bounds.lastMonth]),
    ]);

    res.json({
      employees: employees.map(mapEmployee),
      exams: exams.map(mapExamMetadata),
      attempts: attempts.map(mapAttemptSummary),
      cronograma: cronograma.map(mapCronogramaEntry),
    });
  }),
);

insightsRouter.get(
  "/attention-support",
  requireAdmin,
  requireAnyInsightPermission(["attention.view"]),
  asyncHandler(async (_req, res) => {
    const [certificateRows, trainingRows] = await Promise.all([
      query(`SELECT a.id, a.exam_id, a.user_id, a.matricula, a.score, a.passed, a.certificate_code,
                    a.signature_agreed, a.signed_at, a.finished_at, a.created_at,
                    e.title AS exam_title, e.exam_type,
                    c.id AS certificate_id, c.verification_code, c.revoked, c.revoked_at, c.revoked_reason,
                    COALESCE(emp.full_name, a.signature_name, a.matricula, 'Colaborador') AS employee_name,
                    COALESCE(emp.sector, '—') AS employee_sector,
                    CASE WHEN a.signature_path IS NOT NULL AND a.signature_path <> '' THEN 1 ELSE 0 END AS has_signature
               FROM exam_attempts a
               JOIN exams e ON e.id = a.exam_id
               LEFT JOIN certificates c ON c.attempt_id = a.id
               LEFT JOIN employees emp ON LOWER(TRIM(emp.matricula)) = LOWER(TRIM(a.matricula))
              ORDER BY a.finished_at DESC`),
      query(`SELECT id, employee_id, employee_name, employee_matricula, cycle_days, last_training_date,
                    window_start, window_end, status, created_at, updated_at
               FROM training_schedules
              ORDER BY employee_name ASC`),
    ]);

    const certificates = certificateRows.map((row) => ({
      id: row.id,
      exam_id: row.exam_id,
      user_id: row.user_id,
      matricula: row.matricula,
      score: Number(row.score ?? 0),
      passed: asBool(row.passed),
      certificate_code: row.certificate_code,
      signature_agreed: asBool(row.signature_agreed),
      has_signature: asBool(row.has_signature),
      signed_at: row.signed_at,
      finished_at: row.finished_at,
      created_at: row.created_at,
      exam_title: row.exam_title,
      exam_type: row.exam_type,
      employee_name: row.employee_name,
      employee_sector: row.employee_sector,
      certificate_revoked: asBool(row.revoked),
      revoked_at: row.revoked_at,
      revoked_reason: row.revoked_reason,
      formally_issued: Boolean(
        asBool(row.passed) &&
        row.certificate_code &&
        asBool(row.signature_agreed) &&
        asBool(row.has_signature) &&
        row.signed_at &&
        row.certificate_id &&
        row.verification_code === row.certificate_code &&
        !asBool(row.revoked)
      ),
    }));

    const training = trainingRows.map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      employee_matricula: row.employee_matricula,
      cycle_days: Number(row.cycle_days),
      last_training_date: row.last_training_date,
      window_start: row.window_start,
      window_end: row.window_end,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    res.json({ certificates, training });
  }),
);

insightsRouter.get(
  "/exam-attempts/:attemptId/evidence",
  requireAdmin,
  requireAnyInsightPermission(["analytics.view"]),
  asyncHandler(async (req, res) => {
    const attempt = await queryOne(
      `SELECT a.*, e.title AS exam_title, e.questions,
              COALESCE(emp.full_name, a.signature_name, a.matricula, 'Colaborador') AS employee_name,
              COALESCE(emp.sector, '—') AS employee_sector
         FROM exam_attempts a
         JOIN exams e ON e.id = a.exam_id
         LEFT JOIN employees emp ON LOWER(TRIM(emp.matricula)) = LOWER(TRIM(a.matricula))
        WHERE a.id = ? LIMIT 1`,
      [req.params.attemptId],
    );
    if (!attempt) throw notFound("Evidência da avaliação não encontrada");

    const questions = parseJson(attempt.questions, []);
    const answers = parseJson(attempt.answers, {});
    const evidence = buildSafeQuestionEvidence(Array.isArray(questions) ? questions : [], answers && typeof answers === "object" ? answers : {});
    const correctCount = evidence.filter((item) => item.correct).length;

    res.json({
      attempt_id: attempt.id,
      exam_id: attempt.exam_id,
      exam_title: attempt.exam_title,
      employee_name: attempt.employee_name,
      matricula: attempt.matricula,
      sector: attempt.employee_sector,
      score: Number(attempt.score ?? 0),
      passed: asBool(attempt.passed),
      certificate_code: attempt.certificate_code,
      finished_at: attempt.finished_at,
      signed_at: attempt.signed_at,
      signature_name: attempt.signature_name,
      total_questions: evidence.length,
      correct_count: correctCount,
      accuracy_pct: evidence.length ? Math.round((correctCount / evidence.length) * 100) : 0,
      questions: evidence,
    });
  }),
);
