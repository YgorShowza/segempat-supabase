import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { query, queryOne, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin, requireAuth } from "../session.js";
import {
  asBool,
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  notFound,
  optionalDate,
  parseJson,
  requireOneOf,
  requireText,
  trimOrNull,
  uuid,
} from "../util.js";

export const examsRouter = Router();
export const myExamsRouter = Router();

const EXAM_TYPES = ["Múltipla escolha", "Discursiva", "Mista"];
const EXAM_STATUS = ["Rascunho", "Publicada"];
const TARGET_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"];

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function operationalYearUtcBounds(year = Number(localDate().slice(0, 4))) {
  return {
    start: `${year}-01-01 03:00:00`,
    end: `${year + 1}-01-01 03:00:00`,
  };
}

function mapAttempt(row) {
  if (!row) return null;
  return {
    ...row,
    score: Number(row.score ?? 0),
    passed: asBool(row.passed),
    signature_agreed: asBool(row.signature_agreed),
  };
}

function mapExam(row, { sanitize = false, metadataOnly = false } = {}) {
  const questions = parseJson(row.questions, []);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    exam_type: row.exam_type,
    target_sector: row.target_sector,
    min_approval_pct: Number(row.min_approval_pct ?? 70),
    scheduled_date: row.scheduled_date,
    status: row.status,
    questions: metadataOnly
      ? []
      : questions.map((question) => {
          if (!sanitize) return question;
          const { correct_index: _correctIndex, model_answer: _modelAnswer, ...safeQuestion } = question;
          return safeQuestion;
        }),
    question_count: questions.length,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateQuestions(value) {
  if (!Array.isArray(value) || value.length === 0) throw badRequest("A prova precisa ter ao menos uma questão");
  if (value.length > 200) throw badRequest("A prova excede o limite de 200 questões");
  const ids = new Set();
  const questions = value.map((raw, index) => {
    const type = requireOneOf(raw?.type, ["Múltipla escolha", "Discursiva"], `Tipo da questão ${index + 1}`);
    const statement = requireText(raw?.statement, `Enunciado da questão ${index + 1}`).slice(0, 5000);
    const points = Number(raw?.points ?? 1);
    if (!Number.isFinite(points) || points <= 0 || points > 100) throw badRequest(`Pontuação inválida na questão ${index + 1}`);
    const id = String(raw?.id || uuid()).trim().slice(0, 100);
    if (!id || ids.has(id)) throw badRequest(`Identificador duplicado ou inválido na questão ${index + 1}`);
    ids.add(id);

    if (type === "Múltipla escolha") {
      const options = Array.isArray(raw?.options) ? raw.options.map((item) => String(item ?? "").trim().slice(0, 2000)) : [];
      if (options.length < 2 || options.length > 20 || options.some((item) => !item)) {
        throw badRequest(`A questão ${index + 1} precisa de 2 a 20 alternativas preenchidas`);
      }
      const correctIndex = Number(raw?.correct_index);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        throw badRequest(`Alternativa correta inválida na questão ${index + 1}`);
      }
      return { id, type, statement, options, correct_index: correctIndex, points };
    }

    return {
      id,
      type,
      statement,
      options: [],
      correct_index: 0,
      model_answer: (trimOrNull(raw?.model_answer) ?? "").slice(0, 5000),
      points,
    };
  });
  return questions;
}

function readExamInput(body, { partial = false } = {}) {
  const input = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);

  if (!partial || has("title")) input.title = requireText(body?.title, "Título").slice(0, 255);
  if (!partial || has("description")) input.description = trimOrNull(body?.description);
  if (!partial || has("exam_type")) input.exam_type = requireOneOf(body?.exam_type, EXAM_TYPES, "Tipo de prova", "Múltipla escolha");
  if (!partial || has("target_sector")) input.target_sector = requireOneOf(body?.target_sector, TARGET_SECTORS, "Setor alvo", "Todos");
  if (!partial || has("min_approval_pct")) {
    const min = Number(body?.min_approval_pct ?? 70);
    if (!Number.isInteger(min) || min < 0 || min > 100) throw badRequest("Percentual mínimo deve estar entre 0 e 100");
    input.min_approval_pct = min;
  }
  if (!partial || has("scheduled_date")) input.scheduled_date = optionalDate(body?.scheduled_date, "Data agendada");
  if (!partial || has("status")) input.status = requireOneOf(body?.status, EXAM_STATUS, "Situação", "Rascunho");
  if (!partial || has("questions")) input.questions = validateQuestions(body?.questions);

  if (partial && Object.keys(input).length === 0) throw badRequest("Nenhum campo para atualizar");
  return input;
}

function sectorAllowed(exam, user) {
  return exam.target_sector === "Todos" || exam.target_sector === user.setor;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeAnswers(questions, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("Respostas inválidas");
  const questionById = new Map(questions.map((question) => [String(question.id), question]));
  const entries = Object.entries(value);
  if (entries.length > questions.length) throw badRequest("Foram enviadas respostas para questões desconhecidas");
  const normalized = {};
  for (const [id, answer] of entries) {
    const question = questionById.get(id);
    if (!question) throw badRequest("Foi enviada resposta para uma questão que não pertence à prova");
    if (question.type === "Múltipla escolha") {
      const selected = Number(answer);
      if (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) throw badRequest("Alternativa selecionada inválida");
      normalized[id] = selected;
    } else {
      normalized[id] = String(answer ?? "").slice(0, 10000);
    }
  }
  return normalized;
}

function calculateResult(questions, answers, minApprovalPct) {
  const maxPoints = questions.reduce((sum, question) => sum + Number(question.points || 1), 0);
  let earned = 0;

  for (const question of questions) {
    const answer = answers[question.id];
    if (question.type === "Múltipla escolha") {
      if (Number(answer) === Number(question.correct_index)) earned += Number(question.points || 1);
      continue;
    }
    const expected = normalizeText(question.model_answer);
    if (expected && normalizeText(answer) === expected) earned += Number(question.points || 1);
  }

  const percent = maxPoints > 0 ? (earned / maxPoints) * 100 : 0;
  const score = Math.round((percent / 10) * 100) / 100;
  return { score, percent, passed: percent >= Number(minApprovalPct || 0) };
}

function certificateCode() {
  const stamp = localDate().replaceAll("-", "");
  return `SEG-${stamp}-${uuid().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

examsRouter.get("/", requireAdmin, asyncHandler(async (_req, res) => {
  const rows = await query(`SELECT * FROM exams ORDER BY created_at DESC`);
  res.json(rows.map((row) => mapExam(row)));
}));

examsRouter.get("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const row = await queryOne(`SELECT * FROM exams WHERE id = ?`, [req.params.id]);
  if (!row) throw notFound("Prova não encontrada");
  res.json(mapExam(row));
}));

examsRouter.post("/", requireAdmin, asyncHandler(async (req, res) => {
  const input = readExamInput(req.body);
  const id = uuid();

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO exams
       (id, title, description, exam_type, target_sector, min_approval_pct, scheduled_date, status, questions, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [id, input.title, input.description, input.exam_type, input.target_sector, input.min_approval_pct, input.scheduled_date, input.status, JSON.stringify(input.questions), req.user.id],
    );
    await audit(req.user.id, "INSERT", "exams", id, { title: input.title, atomic: true }, connection);
  });

  res.status(201).json({ id });
}));

examsRouter.patch("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const input = readExamInput(req.body, { partial: true });
  const fields = Object.keys(input);
  const values = fields.map((field) => (field === "questions" ? JSON.stringify(input[field]) : input[field]));

  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT id FROM exams WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
    const existing = rows[0];
    if (!existing) throw notFound("Prova não encontrada");

    const evidenceChangingFields = fields.filter((field) => field !== "status");
    if (evidenceChangingFields.length > 0) {
      const [historyRows] = await connection.execute(
        `SELECT id FROM exam_attempts WHERE exam_id = ? LIMIT 1 FOR UPDATE`,
        [existing.id],
      );
      if (historyRows[0]) {
        throw conflict("Prova com tentativas registradas não pode ter conteúdo ou configuração alterados. Use apenas Publicar/Despublicar para preservar a evidência histórica.");
      }
    }

    await connection.execute(
      `UPDATE exams SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [...values, existing.id],
    );
    await audit(req.user.id, "UPDATE", "exams", existing.id, { changed: fields, atomic: true, evidence_guard_atomic: true }, connection);
  });

  res.status(204).end();
}));

examsRouter.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT id, title FROM exams WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
    const existing = rows[0];
    if (!existing) throw notFound("Prova não encontrada");

    const [historyRows] = await connection.execute(
      `SELECT COUNT(*) AS total FROM exam_attempts WHERE exam_id = ?`,
      [existing.id],
    );
    if (Number(historyRows[0]?.total ?? 0) > 0) {
      throw conflict("Prova possui tentativas registradas. Despublique a prova para preservar o histórico operacional.");
    }

    await connection.execute(`DELETE FROM exams WHERE id = ?`, [existing.id]);
    await audit(req.user.id, "DELETE", "exams", existing.id, { title: existing.title, atomic: true, history_guard_atomic: true }, connection);
  });

  res.status(204).end();
}));

myExamsRouter.get("/exams", requireAuth, asyncHandler(async (req, res) => {
  const today = localDate();
  const rows = await query(
    `SELECT * FROM exams
      WHERE status = 'Publicada'
        AND (target_sector = 'Todos' OR target_sector = ?)
        AND (scheduled_date IS NULL OR scheduled_date <= ?)
      ORDER BY scheduled_date DESC, created_at DESC`,
    [req.user.setor ?? "", today],
  );
  res.json(rows.map((row) => mapExam(row, { metadataOnly: true })));
}));

myExamsRouter.get("/exams/:id", requireAuth, asyncHandler(async (req, res) => {
  const row = await queryOne(`SELECT * FROM exams WHERE id = ? AND status = 'Publicada'`, [req.params.id]);
  if (!row || !sectorAllowed(row, req.user)) throw notFound("Prova indisponível");
  if (row.scheduled_date && String(row.scheduled_date) > localDate()) throw forbidden("Prova ainda não liberada");
  res.json(mapExam(row, { sanitize: true }));
}));

myExamsRouter.get("/exam-attempts", requireAuth, asyncHandler(async (req, res) => {
  const rows = await query(`SELECT * FROM exam_attempts WHERE user_id = ? ORDER BY finished_at DESC`, [req.user.id]);
  res.json(rows.map(mapAttempt));
}));

myExamsRouter.get("/exam-attempts/year/:year", requireAuth, asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw badRequest("Ano inválido");
  const bounds = operationalYearUtcBounds(year);
  const rows = await query(
    `SELECT * FROM exam_attempts WHERE user_id = ? AND finished_at >= ? AND finished_at < ? ORDER BY finished_at DESC`,
    [req.user.id, bounds.start, bounds.end],
  );
  res.json(rows.map(mapAttempt));
}));

myExamsRouter.post("/exams/:id/attempts", requireAuth, asyncHandler(async (req, res) => {
  const exam = await queryOne(`SELECT * FROM exams WHERE id = ? AND status = 'Publicada'`, [req.params.id]);
  if (!exam || !sectorAllowed(exam, req.user)) throw notFound("Prova indisponível");
  if (exam.scheduled_date && String(exam.scheduled_date) > localDate()) throw forbidden("Prova ainda não liberada");

  const questions = parseJson(exam.questions, []);
  if (!Array.isArray(questions) || !questions.length) throw badRequest("Prova sem questões válidas");
  const answers = normalizeAnswers(questions, req.body?.answers ?? {});
  const result = calculateResult(questions, answers, exam.min_approval_pct);
  const attemptId = uuid();
  const code = result.passed ? certificateCode() : null;
  const completionDate = localDate();
  const bounds = operationalYearUtcBounds();

  await withTransaction(async (connection) => {
    const [approvedRows] = await connection.execute(
      `SELECT id FROM exam_attempts
        WHERE user_id = ? AND exam_id = ? AND passed = 1
          AND finished_at >= ? AND finished_at < ?
        LIMIT 1 FOR UPDATE`,
      [req.user.id, exam.id, bounds.start, bounds.end],
    );
    if (approvedRows[0]) {
      throw conflict("Esta prova já foi aprovada neste ano operacional");
    }

    await connection.execute(
      `INSERT INTO exam_attempts
       (id, exam_id, user_id, matricula, score, passed, answers, finished_at, created_at, updated_at, certificate_code, signature_agreed)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), ?, 0)`,
      [attemptId, exam.id, req.user.id, req.user.matricula, result.score, result.passed ? 1 : 0, JSON.stringify(answers), code],
    );

    let cronogramaChanged = 0;
    if (result.passed) {
      const [cronogramaResult] = await connection.execute(
        `UPDATE cronograma_entries
            SET status = 'Realizado',
                type = 'Realizado',
                completion_date = ?,
                justification = NULL,
                updated_at = UTC_TIMESTAMP(3)
          WHERE exam_id = ?
            AND LOWER(TRIM(employee_matricula)) = LOWER(TRIM(?))
            AND status <> 'Realizado'`,
        [completionDate, exam.id, req.user.matricula],
      );
      cronogramaChanged = Number(cronogramaResult.affectedRows || 0);
    }

    await audit(req.user.id, "EXAM_ATTEMPT", "exam_attempts", attemptId, {
      exam_id: exam.id,
      score: result.score,
      passed: result.passed,
      answers_validated_server_side: true,
      repeated_approval_guard_atomic: true,
      operational_year_bounds_utc: bounds,
      cronograma_synchronized_atomically: result.passed,
      cronograma_changed: cronogramaChanged,
    }, connection);
  });

  const row = await queryOne(`SELECT * FROM exam_attempts WHERE id = ?`, [attemptId]);
  res.status(201).json(mapAttempt(row));
}));

myExamsRouter.post("/exam-attempts/:attemptId/signature", requireAuth, asyncHandler(async (req, res) => {
  if (config.storage.driver !== "filesystem") throw badRequest("Driver de armazenamento ainda não suportado nesta API");
  const attempt = await queryOne(
    `SELECT a.*, e.title AS exam_title FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = ? AND a.user_id = ?`,
    [req.params.attemptId, req.user.id],
  );
  if (!attempt) throw notFound("Tentativa não encontrada");
  if (!asBool(attempt.passed) || !attempt.certificate_code) {
    throw forbidden("Assinatura disponível somente para tentativa aprovada");
  }
  if (asBool(attempt.signature_agreed) || attempt.signed_at || attempt.signature_path) {
    throw forbidden("Tentativa já assinada; a evidência não pode ser substituída");
  }

  const signerName = requireText(req.user.nome, "Nome do usuário autenticado").slice(0, 255);
  const dataUrl = requireText(req.body?.pngDataUrl, "Assinatura");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw badRequest("Formato de assinatura inválido");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 100 || bytes.length > 1_500_000) throw badRequest("Tamanho de assinatura inválido");
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw badRequest("Conteúdo da assinatura não é PNG válido");

  const fileName = `${attempt.id}-${Date.now()}-${uuid().slice(0, 8)}.png`;
  const relativePath = path.posix.join("exam-signatures", req.user.id, fileName);
  const absolutePath = path.resolve(config.storage.path, relativePath);
  const storageRoot = path.resolve(config.storage.path);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) throw badRequest("Caminho de assinatura inválido");
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, bytes, { mode: 0o600, flag: "wx" });

  try {
    await withTransaction(async (connection) => {
      const [lockedAttempts] = await connection.execute(
        `SELECT passed, certificate_code, signature_agreed, signed_at, signature_path
           FROM exam_attempts
          WHERE id = ? AND user_id = ?
          LIMIT 1 FOR UPDATE`,
        [attempt.id, req.user.id],
      );
      const lockedAttempt = lockedAttempts[0];
      if (!lockedAttempt) throw notFound("Tentativa não encontrada");
      if (!asBool(lockedAttempt.passed) || !lockedAttempt.certificate_code) {
        throw forbidden("Assinatura disponível somente para tentativa aprovada");
      }
      if (asBool(lockedAttempt.signature_agreed) || lockedAttempt.signed_at || lockedAttempt.signature_path) {
        throw forbidden("Tentativa já assinada; a evidência não pode ser substituída");
      }

      const [existingCertificates] = await connection.execute(
        `SELECT id FROM certificates WHERE attempt_id = ? LIMIT 1 FOR UPDATE`,
        [attempt.id],
      );
      if (existingCertificates[0]) {
        throw forbidden("Certificado já emitido; a evidência de assinatura é imutável");
      }

      await connection.execute(
        `UPDATE exam_attempts
            SET signature_path = ?, signature_name = ?, signed_at = UTC_TIMESTAMP(3), signature_agreed = 1, updated_at = UTC_TIMESTAMP(3)
          WHERE id = ? AND user_id = ?`,
        [relativePath, signerName, attempt.id, req.user.id],
      );

      await connection.execute(
        `INSERT INTO certificates
         (id, attempt_id, user_id, matricula, employee_name, exam_id, exam_title, score, verification_code, issued_at, revoked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), 0, UTC_TIMESTAMP(3))`,
        [uuid(), attempt.id, req.user.id, req.user.matricula, req.user.nome, attempt.exam_id, attempt.exam_title, attempt.score, attempt.certificate_code],
      );

      await audit(req.user.id, "SIGN_EXAM_ATTEMPT", "exam_attempts", attempt.id, {
        signature_path: relativePath,
        signer_derived_server_side: true,
        evidence_immutable_after_issuance: true,
      }, connection);
    });
  } catch (error) {
    await fs.unlink(absolutePath).catch(() => {});
    throw error;
  }

  const row = await queryOne(`SELECT * FROM exam_attempts WHERE id = ?`, [attempt.id]);
  res.json(mapAttempt(row));
}));
