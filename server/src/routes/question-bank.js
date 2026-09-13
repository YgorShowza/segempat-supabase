import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin, requireAuth } from "../session.js";
import { asBool, asyncHandler, badRequest, conflict, notFound, parseJson, requireBoolean, requireOneOf, requireText, trimOrNull, uuid } from "../util.js";

export const questionBankRouter = Router();

const TARGET_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"];
const DIFFICULTIES = ["Básico", "Intermediário", "Avançado"];
const ADMIN_DIFFICULTY_TO_CANONICAL = {
  "Fácil": "Básico",
  "Médio": "Intermediário",
  "Difícil": "Avançado",
};
const CANONICAL_DIFFICULTY_TO_ADMIN = {
  "Básico": "Fácil",
  "Intermediário": "Médio",
  "Avançado": "Difícil",
};

function normalizeDifficultyInput(value) {
  const raw = String(value ?? "").trim();
  return ADMIN_DIFFICULTY_TO_CANONICAL[raw] ?? raw;
}

function mapAdmin(row) {
  return {
    ...row,
    options: parseJson(row.options, []),
    correct_index: row.correct_index === null ? null : Number(row.correct_index),
    difficulty: CANONICAL_DIFFICULTY_TO_ADMIN[row.difficulty] ?? row.difficulty,
    active: asBool(row.active),
  };
}

function mapOperational(row) {
  return {
    id: row.id,
    bank_type: row.bank_type,
    question_text: row.question_text,
    options: parseJson(row.options, []),
    target_sector: row.target_sector,
    difficulty: row.difficulty,
    theme: row.theme ?? "",
    active: asBool(row.active),
    created_at: row.created_at,
  };
}

function readInput(body, { partial = false } = {}) {
  const input = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);
  if (!partial || has("bank_type")) input.bank_type = requireText(body?.bank_type, "Tipo de banco").slice(0, 80);
  if (!partial || has("question_text")) input.question_text = requireText(body?.question_text, "Pergunta").slice(0, 4000);
  if (!partial || has("options")) {
    const options = Array.isArray(body?.options) ? body.options.map((value) => String(value ?? "").trim()) : [];
    if (options.length > 20) throw badRequest("Limite de 20 alternativas por questão");
    if (options.some((value) => !value)) throw badRequest("As alternativas não podem ficar vazias");
    if (options.some((value) => value.length > 1000)) throw badRequest("Alternativa excede o limite de caracteres");
    input.options = options;
  }
  if (!partial || has("correct_index")) {
    if (body?.correct_index === null || body?.correct_index === undefined || body?.correct_index === "") input.correct_index = null;
    else {
      const index = Number(body.correct_index);
      if (!Number.isInteger(index) || index < 0) throw badRequest("Índice da resposta correta inválido");
      input.correct_index = index;
    }
  }
  if (!partial || has("correct_answer")) input.correct_answer = trimOrNull(body?.correct_answer)?.slice(0, 4000) ?? null;
  if (!partial || has("explanation")) input.explanation = trimOrNull(body?.explanation)?.slice(0, 8000) ?? null;
  if (!partial || has("target_sector")) input.target_sector = requireOneOf(body?.target_sector, TARGET_SECTORS, "Setor alvo", "Todos");
  if (!partial || has("difficulty")) input.difficulty = requireOneOf(normalizeDifficultyInput(body?.difficulty), DIFFICULTIES, "Dificuldade", "Básico");
  if (!partial || has("theme")) input.theme = trimOrNull(body?.theme)?.slice(0, 255) ?? null;
  if (!partial || has("active")) input.active = has("active") ? requireBoolean(body.active, "Situação ativa", { asInteger: true }) : 1;
  if (partial && Object.keys(input).length === 0) throw badRequest("Nenhum campo para atualizar");
  return input;
}

function validateAnswerShape(input, existing = null) {
  const options = input.options ?? parseJson(existing?.options, []);
  const correctIndex = Object.prototype.hasOwnProperty.call(input, "correct_index") ? input.correct_index : existing?.correct_index ?? null;
  if (correctIndex !== null && Number(correctIndex) >= options.length) throw badRequest("Alternativa correta fora do intervalo");
  if (correctIndex !== null && options.length < 2) throw badRequest("Questão objetiva precisa de ao menos duas alternativas");
}

questionBankRouter.get(
  "/",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await query(`SELECT * FROM question_bank ORDER BY active DESC, created_at DESC`);
    res.json(rows.map(mapAdmin));
  }),
);

questionBankRouter.get(
  "/operational",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, bank_type, question_text, options, target_sector, difficulty, theme, active, created_at
         FROM question_bank
        WHERE active = 1 AND (target_sector = 'Todos' OR target_sector = ?)
        ORDER BY created_at DESC`,
      [req.user.setor ?? ""],
    );
    res.json(rows.map(mapOperational));
  }),
);

questionBankRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = readInput(req.body);
    validateAnswerShape(input);
    const id = uuid();

    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO question_bank
         (id, bank_type, question_text, options, correct_index, correct_answer, explanation, target_sector, difficulty, theme, active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [id, input.bank_type, input.question_text, JSON.stringify(input.options), input.correct_index, input.correct_answer, input.explanation,
          input.target_sector, input.difficulty, input.theme, input.active, req.user.id],
      );
      await audit(req.user.id, "INSERT", "question_bank", id, { bank_type: input.bank_type, difficulty: input.difficulty, atomic: true }, connection);
    });

    res.status(201).json({ id });
  }),
);

questionBankRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = readInput(req.body, { partial: true });

    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(`SELECT * FROM question_bank WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
      const existing = rows[0];
      if (!existing) throw notFound("Questão não encontrada");

      validateAnswerShape(input, existing);
      const fields = Object.keys(input);
      const values = fields.map((field) => field === "options" ? JSON.stringify(input[field]) : input[field]);
      await connection.execute(
        `UPDATE question_bank SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
        [...values, req.params.id],
      );
      await audit(req.user.id, "UPDATE", "question_bank", req.params.id, { changed: fields, atomic: true }, connection);
    });

    res.status(204).end();
  }),
);

questionBankRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(`SELECT id FROM question_bank WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
      const existing = rows[0];
      if (!existing) throw notFound("Questão não encontrada");

      const [linkedRows] = await connection.execute(
        `SELECT id
           FROM cronograma_entries
          WHERE JSON_CONTAINS(COALESCE(question_bank_ids, JSON_ARRAY()), JSON_QUOTE(?), '$')
          LIMIT 1 FOR UPDATE`,
        [existing.id],
      );
      if (linkedRows[0]) {
        throw conflict("Questão vinculada ao Cronograma não pode ser excluída. Desative-a para preservar o histórico operacional.");
      }

      await connection.execute(`DELETE FROM question_bank WHERE id = ?`, [existing.id]);
      await audit(req.user.id, "DELETE", "question_bank", existing.id, { atomic: true, cronograma_history_guard: true }, connection);
    });

    res.status(204).end();
  }),
);