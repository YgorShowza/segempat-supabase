import { Router } from "express";
import { audit } from "../audit.js";
import { config } from "../config.js";
import { withTransaction } from "../db.js";
import { requireAdmin } from "../session.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  notFound,
  optionalDate,
  requireMonth,
  requireOneOf,
  requireText,
  trimOrNull,
  uuid,
} from "../util.js";

export const cronogramaCreateIntegrityRouter = Router();

const STATUSES = ["Pendente", "Realizado", "Justificado"];
const TARGET_SECTORS = ["CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"];
const MAX_BULK = 1000;

function operationalDateFromUtc(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw badRequest("Tentativa aprovada possui data de conclusão inválida");
  const date = value instanceof Date
    ? value
    : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) throw badRequest("Tentativa aprovada possui data de conclusão inválida");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readInput(raw) {
  const status = requireOneOf(raw?.status, STATUSES, "Situação", "Pendente");
  const input = {
    month: requireMonth(raw?.month),
    employee_id: requireText(raw?.employee_id, "Colaborador"),
    theme: requireText(raw?.theme, "Tema"),
    exam_id: trimOrNull(raw?.exam_id),
    status,
    justification: trimOrNull(raw?.justification),
    planned_date: optionalDate(raw?.planned_date, "Data planejada"),
    completion_date: optionalDate(raw?.completion_date, "Data de conclusão"),
    notes: trimOrNull(raw?.notes),
    question_bank_ids: Array.isArray(raw?.question_bank_ids)
      ? raw.question_bank_ids.map((value) => String(value).trim()).filter(Boolean)
      : [],
  };
  if (status === "Justificado" && !input.justification) {
    throw badRequest("Motivo é obrigatório para lançamento justificado");
  }
  return input;
}

async function loadEmployee(connection, employeeId) {
  const [rows] = await connection.execute(
    `SELECT id, full_name, matricula, sector, status, access_profile
       FROM employees
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
    [employeeId],
  );
  const employee = rows[0];
  if (!employee) throw notFound("Colaborador não encontrado");
  if (employee.status !== "Ativo") throw badRequest("O colaborador precisa estar ativo");
  if (employee.access_profile === "Inspetor") throw badRequest("O cronograma operacional não pode ser vinculado a Inspetor");
  if (!TARGET_SECTORS.includes(employee.sector)) throw badRequest("Setor operacional inválido");
  return employee;
}

async function validateQuestionLinks(connection, questionIds, employeeSector) {
  if (!questionIds.length) return [];
  if (new Set(questionIds).size !== questionIds.length) throw badRequest("Existem questões duplicadas vinculadas ao lançamento");
  if (questionIds.length > 100) throw badRequest("Limite de 100 questões vinculadas por lançamento");
  const placeholders = questionIds.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT id
       FROM question_bank
      WHERE id IN (${placeholders})
        AND active = 1
        AND (target_sector = 'Todos' OR target_sector = ?)`,
    [...questionIds, employeeSector],
  );
  if (rows.length !== questionIds.length) {
    throw badRequest(`Uma ou mais questões vinculadas estão inativas, inexistentes ou incompatíveis com o setor ${employeeSector}`);
  }
  return questionIds;
}

async function loadExam(connection, examId, employeeSector) {
  if (!examId) return null;
  const [rows] = await connection.execute(
    `SELECT id, title, status, target_sector
       FROM exams
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
    [examId],
  );
  const exam = rows[0];
  if (!exam) throw notFound("Prova vinculada não encontrada");
  if (exam.status !== "Publicada") throw badRequest("Apenas prova publicada pode ser vinculada a novo lançamento");
  if (exam.target_sector !== "Todos" && exam.target_sector !== employeeSector) {
    throw badRequest(`A prova vinculada não é destinada ao setor ${employeeSector}`);
  }
  return exam;
}

async function approvedAttempt(connection, examId, matricula) {
  const [rows] = await connection.execute(
    `SELECT finished_at
       FROM exam_attempts
      WHERE exam_id = ?
        AND LOWER(TRIM(matricula)) = LOWER(TRIM(?))
        AND passed = 1
      ORDER BY finished_at ASC
      LIMIT 1
      FOR UPDATE`,
    [examId, matricula],
  );
  return rows[0] ?? null;
}

async function prepareEntry(connection, raw) {
  const input = readInput(raw);
  const employee = await loadEmployee(connection, input.employee_id);
  const exam = await loadExam(connection, input.exam_id, employee.sector);
  const questionIds = await validateQuestionLinks(connection, input.question_bank_ids, employee.sector);

  let type = "Planejado";
  let completionDate = null;
  let justification = null;

  if (input.status === "Justificado") {
    justification = input.justification;
  } else if (input.status === "Realizado") {
    type = "Realizado";
    if (exam) {
      const attempt = await approvedAttempt(connection, exam.id, employee.matricula);
      if (!attempt) {
        throw conflict("Lançamento vinculado a prova só pode ser criado como realizado após aprovação da prova pelo colaborador");
      }
      completionDate = operationalDateFromUtc(attempt.finished_at);
    } else {
      if (!input.completion_date) throw badRequest("Atividade realizada sem prova vinculada exige data de conclusão");
      completionDate = input.completion_date;
    }
  }

  return {
    id: uuid(),
    month: input.month,
    employee_id: employee.id,
    employee_name: employee.full_name,
    employee_matricula: employee.matricula,
    employee_sector: employee.sector,
    theme: input.theme,
    exam_id: exam?.id ?? null,
    exam_title: exam?.title ?? null,
    type,
    status: input.status,
    justification,
    planned_date: input.planned_date,
    completion_date: completionDate,
    notes: input.notes,
    question_bank_ids: questionIds,
  };
}

async function insertPrepared(connection, entry, createdBy) {
  await connection.execute(
    `INSERT INTO cronograma_entries
     (id, month, employee_id, employee_name, employee_matricula, employee_sector, theme,
      exam_id, exam_title, type, status, justification, planned_date, completion_date, notes,
      question_bank_ids, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [
      entry.id,
      entry.month,
      entry.employee_id,
      entry.employee_name,
      entry.employee_matricula,
      entry.employee_sector,
      entry.theme,
      entry.exam_id,
      entry.exam_title,
      entry.type,
      entry.status,
      entry.justification,
      entry.planned_date,
      entry.completion_date,
      entry.notes,
      JSON.stringify(entry.question_bank_ids),
      createdBy,
    ],
  );
}

cronogramaCreateIntegrityRouter.post(
  "/bulk",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (!rawEntries.length) return res.status(204).end();
    if (rawEntries.length > MAX_BULK) throw badRequest(`Limite de ${MAX_BULK} lançamentos por operação`);

    const ids = await withTransaction(async (connection) => {
      const prepared = [];
      for (const raw of rawEntries) prepared.push(await prepareEntry(connection, raw));
      for (const entry of prepared) await insertPrepared(connection, entry, req.user.id);
      await audit(req.user.id, "BULK_INSERT", "cronograma_entries", prepared[0]?.id ?? "", {
        count: prepared.length,
        atomic: true,
        identity_derived_server_side: true,
        exam_links_validated_server_side: true,
        exam_title_derived_server_side: true,
        status_semantics_server_side: true,
        exam_completion_guard: true,
        question_links_validated_server_side: true,
      }, connection);
      return prepared.map((entry) => entry.id);
    });

    res.status(201).json({ ids, count: ids.length });
  }),
);

cronogramaCreateIntegrityRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = await withTransaction(async (connection) => {
      const entry = await prepareEntry(connection, req.body);
      await insertPrepared(connection, entry, req.user.id);
      await audit(req.user.id, "INSERT", "cronograma_entries", entry.id, {
        month: entry.month,
        employee_id: entry.employee_id,
        atomic: true,
        identity_derived_server_side: true,
        exam_links_validated_server_side: true,
        exam_title_derived_server_side: true,
        status_semantics_server_side: true,
        exam_completion_guard: true,
        question_links_validated_server_side: true,
      }, connection);
      return entry.id;
    });

    res.status(201).json({ id });
  }),
);
