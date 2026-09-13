import { hasAnyPermission, hasPermission } from "./authorization.js";

const SAFE_READ_METHODS = new Set(["GET", "HEAD"]);

function apiPath(req) {
  try {
    return new URL(req.originalUrl || req.url || "/", "http://segempat.local").pathname;
  } catch {
    return String(req.path || req.url || "");
  }
}

function numericQuestionCount(value, questions) {
  const explicit = Number(value);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return Array.isArray(questions) ? questions.length : 0;
}

export function redactExamRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  if (!("id" in record) || !("title" in record) || !("questions" in record)) return record;

  const questions = Array.isArray(record.questions) ? record.questions : [];
  return {
    ...record,
    questions: [],
    question_count: numericQuestionCount(record.question_count, questions),
  };
}

export function redactExamPayload(payload) {
  return Array.isArray(payload) ? payload.map(redactExamRecord) : redactExamRecord(payload);
}

export function redactQuestionBankRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  if (!("id" in record) || !("question_text" in record)) return record;

  const {
    correct_index: _correctIndex,
    correct_answer: _correctAnswer,
    explanation: _explanation,
    ...safeRecord
  } = record;
  return safeRecord;
}

export function redactQuestionBankPayload(payload) {
  return Array.isArray(payload) ? payload.map(redactQuestionBankRecord) : redactQuestionBankRecord(payload);
}

function installJsonRedaction(res, redact) {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(redact(payload));
}

/**
 * Compatibility guard for shared administrative reads.
 *
 * Some management views legitimately need exam/question-bank metadata even when
 * the current profile does not manage those domains. The global authorization
 * layer may therefore allow the read, but this middleware prevents those shared
 * reads from exposing answer keys or model answers. Domain managers keep the
 * complete payload required to author and maintain assessments.
 */
export function enforceSensitiveReadRedaction(req, res, next) {
  if (!req.user || !SAFE_READ_METHODS.has(String(req.method || "GET").toUpperCase())) return next();

  const path = apiPath(req);
  const examRead = path === "/api/exams" || path === "/api/exams/" || /^\/api\/exams\/[^/]+\/?$/.test(path);
  if (examRead && !hasPermission(req.user, "exams.manage")) {
    installJsonRedaction(res, redactExamPayload);
    return next();
  }

  const questionBankRead = path === "/api/question-bank" || path === "/api/question-bank/";
  if (questionBankRead && !hasAnyPermission(req.user, ["question_bank.manage", "exams.manage"])) {
    installJsonRedaction(res, redactQuestionBankPayload);
  }

  return next();
}
