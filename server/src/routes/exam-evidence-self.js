import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../session.js";
import { asBool, asyncHandler, notFound, parseJson } from "../util.js";

export const myExamEvidenceRouter = Router();

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildQuestionEvidence(questions, answers) {
  return questions.map((question, index) => {
    const id = String(question?.id ?? `q-${index + 1}`);
    const type = String(question?.type || "Múltipla escolha");
    const statement = String(question?.statement || question?.question || `Questão ${index + 1}`);
    const rawAnswer = answers?.[id];
    const options = Array.isArray(question?.options) ? question.options.map((item) => String(item ?? "")) : [];

    if (type === "Múltipla escolha") {
      const selectedIndex = Number(rawAnswer);
      const correctIndex = Number(question?.correct_index);
      const answerText = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < options.length
        ? options[selectedIndex]
        : rawAnswer == null ? "Não respondida" : String(rawAnswer);
      const correct = Number.isInteger(selectedIndex) && Number.isInteger(correctIndex) && selectedIndex === correctIndex;
      return { id, order: index + 1, type, statement, answer: answerText, correct };
    }

    const answerText = rawAnswer == null || String(rawAnswer).trim() === "" ? "Não respondida" : String(rawAnswer);
    const expected = normalizeText(question?.model_answer);
    const correct = Boolean(expected) && normalizeText(answerText) === expected;
    return { id, order: index + 1, type, statement, answer: answerText, correct };
  });
}

myExamEvidenceRouter.get(
  "/certificate-states",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT c.attempt_id, c.verification_code, c.issued_at, c.revoked, c.revoked_at, c.revoked_reason
         FROM certificates c
        WHERE c.user_id = ?
        ORDER BY c.issued_at DESC`,
      [req.user.id],
    );
    res.json(rows.map((row) => ({
      attempt_id: row.attempt_id,
      verification_code: row.verification_code,
      issued_at: row.issued_at,
      revoked: asBool(row.revoked),
      revoked_at: row.revoked_at,
      revoked_reason: row.revoked_reason,
    })));
  }),
);

myExamEvidenceRouter.get(
  "/exam-attempts/:attemptId/evidence",
  requireAuth,
  asyncHandler(async (req, res) => {
    const attempt = await queryOne(
      `SELECT a.*, e.title AS exam_title, e.questions, e.min_approval_pct,
              COALESCE(emp.full_name, a.signature_name, a.matricula, ?) AS employee_name,
              COALESCE(emp.sector, ?) AS employee_sector
         FROM exam_attempts a
         JOIN exams e ON e.id = a.exam_id
         LEFT JOIN employees emp ON LOWER(TRIM(emp.matricula)) = LOWER(TRIM(a.matricula))
        WHERE a.id = ? AND a.user_id = ?
        LIMIT 1`,
      [req.user.nome || "Colaborador", req.user.setor || "—", req.params.attemptId, req.user.id],
    );
    if (!attempt) throw notFound("Evidência da avaliação não encontrada");

    const questions = parseJson(attempt.questions, []);
    const answers = parseJson(attempt.answers, {});
    const evidence = buildQuestionEvidence(Array.isArray(questions) ? questions : [], answers && typeof answers === "object" ? answers : {});
    const correctCount = evidence.filter((item) => item.correct).length;
    const total = evidence.length;

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
      total_questions: total,
      correct_count: correctCount,
      accuracy_pct: total ? Math.round((correctCount / total) * 100) : 0,
      questions: evidence,
    });
  }),
);
