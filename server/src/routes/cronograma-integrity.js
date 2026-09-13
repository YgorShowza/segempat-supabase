import { Router } from "express";
import { withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin } from "../session.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  notFound,
  optionalDate,
  parseJson,
  requireMonth,
  requireOneOf,
  requireText,
  trimOrNull,
} from "../util.js";
import { config } from "../config.js";

export const cronogramaIntegrityRouter = Router();

const STATUSES = ["Pendente", "Realizado", "Justificado"];
const TYPES = ["Planejado", "Realizado"];
const TARGET_SECTORS = ["CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"];

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

function readPatch(body) {
  const input = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);
  if (has("month")) input.month = requireMonth(body.month);
  if (has("employee_id")) input.employee_id = requireText(body.employee_id, "Colaborador");
  if (has("theme")) input.theme = requireText(body.theme, "Tema");
  if (has("exam_id")) input.exam_id = trimOrNull(body.exam_id);
  if (has("type")) input.type = requireOneOf(body.type, TYPES, "Tipo");
  if (has("status")) input.status = requireOneOf(body.status, STATUSES, "Situação");
  if (has("justification")) input.justification = trimOrNull(body.justification);
  if (has("planned_date")) input.planned_date = optionalDate(body.planned_date, "Data planejada");
  if (has("completion_date")) input.completion_date = optionalDate(body.completion_date, "Data de conclusão");
  if (has("notes")) input.notes = trimOrNull(body.notes);
  if (has("question_bank_ids")) {
    if (!Array.isArray(body.question_bank_ids)) throw badRequest("Questões vinculadas inválidas");
    input.question_bank_ids = body.question_bank_ids.map((value) => String(value).trim()).filter(Boolean);
  }
  if (!Object.keys(input).length) throw badRequest("Nenhum campo para atualizar");
  return input;
}

async function loadOperationalEmployee(connection, employeeId) {
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
  const ids = Array.isArray(questionIds) ? questionIds.map((value) => String(value).trim()).filter(Boolean) : [];
  if (!ids.length) return [];
  if (new Set(ids).size !== ids.length) throw badRequest("Existem questões duplicadas vinculadas ao lançamento");
  if (ids.length > 100) throw badRequest("Limite de 100 questões vinculadas por lançamento");

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT id
       FROM question_bank
      WHERE id IN (${placeholders})
        AND active = 1
        AND (target_sector = 'Todos' OR target_sector = ?)`,
    [...ids, employeeSector],
  );
  if (rows.length !== ids.length) {
    throw badRequest(`Uma ou mais questões vinculadas estão inativas, inexistentes ou incompatíveis com o setor ${employeeSector}`);
  }
  return ids;
}

async function loadExam(connection, examId, employeeSector, { requirePublished = false } = {}) {
  if (!examId) return null;
  const [rows] = await connection.execute(
    `SELECT id, title, status, target_sector
       FROM exams
      WHERE id = ?
      LIMIT 1`,
    [examId],
  );
  const exam = rows[0];
  if (!exam) throw notFound("Prova vinculada não encontrada");
  if (requirePublished && exam.status !== "Publicada") {
    throw badRequest("Apenas prova publicada pode ser vinculada ao cronograma");
  }
  if (exam.target_sector !== "Todos" && exam.target_sector !== employeeSector) {
    throw badRequest(`A prova vinculada não é destinada ao setor ${employeeSector}`);
  }
  return exam;
}

async function firstApprovedAttempt(connection, examId, matricula) {
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

cronogramaIntegrityRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rawPatch = readPatch(req.body);

    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM cronograma_entries WHERE id = ? LIMIT 1 FOR UPDATE`,
        [req.params.id],
      );
      const existing = rows[0];
      if (!existing) throw notFound("Registro do cronograma não encontrado");

      if (existing.status === "Realizado" || existing.status === "Justificado") {
        const allowedHistoricalFields = existing.status === "Justificado"
          ? new Set(["justification", "notes"])
          : new Set(["notes"]);
        const blockedFields = Object.keys(rawPatch).filter((field) => !allowedHistoricalFields.has(field));
        if (blockedFields.length) {
          throw conflict(
            existing.status === "Realizado"
              ? "Lançamento realizado é histórico operacional; somente observações podem ser complementadas"
              : "Lançamento justificado é histórico operacional; somente justificativa e observações podem ser complementadas",
          );
        }
      }

      const patch = { ...rawPatch };
      let effectiveEmployee = {
        id: existing.employee_id,
        full_name: existing.employee_name,
        matricula: existing.employee_matricula,
        sector: existing.employee_sector,
      };

      if (Object.prototype.hasOwnProperty.call(patch, "employee_id")) {
        effectiveEmployee = await loadOperationalEmployee(connection, patch.employee_id);
        patch.employee_id = effectiveEmployee.id;
        patch.employee_name = effectiveEmployee.full_name;
        patch.employee_matricula = effectiveEmployee.matricula;
        patch.employee_sector = effectiveEmployee.sector;
      }

      const examChanged = Object.prototype.hasOwnProperty.call(patch, "exam_id");
      const effectiveExamId = examChanged ? patch.exam_id : existing.exam_id;
      const exam = await loadExam(connection, effectiveExamId, effectiveEmployee.sector, { requirePublished: examChanged && Boolean(effectiveExamId) });
      if (examChanged) patch.exam_title = exam?.title ?? null;

      if (Object.prototype.hasOwnProperty.call(patch, "question_bank_ids") || Object.prototype.hasOwnProperty.call(patch, "employee_id")) {
        const ids = Object.prototype.hasOwnProperty.call(patch, "question_bank_ids")
          ? patch.question_bank_ids
          : parseJson(existing.question_bank_ids, []);
        patch.question_bank_ids = await validateQuestionLinks(connection, ids, effectiveEmployee.sector);
      }

      const effectiveStatus = Object.prototype.hasOwnProperty.call(patch, "status") ? patch.status : existing.status;
      const effectiveJustification = Object.prototype.hasOwnProperty.call(patch, "justification")
        ? patch.justification
        : trimOrNull(existing.justification);

      if (effectiveStatus === "Justificado") {
        if (!effectiveJustification) throw badRequest("Motivo é obrigatório para lançamento justificado");
        patch.justification = effectiveJustification;
        patch.type = "Planejado";
        patch.completion_date = null;
      } else if (effectiveStatus === "Pendente") {
        patch.justification = null;
        patch.type = "Planejado";
        patch.completion_date = null;
      } else if (effectiveStatus === "Realizado") {
        patch.justification = null;
        patch.type = "Realizado";
        if (effectiveExamId) {
          const attempt = await firstApprovedAttempt(connection, effectiveExamId, effectiveEmployee.matricula);
          if (!attempt) {
            throw conflict("Lançamento vinculado a prova só pode ser concluído após aprovação da prova pelo colaborador");
          }
          patch.completion_date = operationalDateFromUtc(attempt.finished_at);
        } else {
          const completionDate = Object.prototype.hasOwnProperty.call(patch, "completion_date")
            ? patch.completion_date
            : existing.completion_date;
          if (!completionDate) throw badRequest("Informe a data de conclusão para atividade realizada sem prova vinculada");
          patch.completion_date = completionDate;
        }
      }

      const fields = Object.keys(patch);
      const values = fields.map((field) => field === "question_bank_ids" ? JSON.stringify(patch[field]) : patch[field]);
      await connection.execute(
        `UPDATE cronograma_entries
            SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?`,
        [...values, existing.id],
      );
      await audit(req.user.id, "UPDATE", "cronograma_entries", existing.id, {
        changed: fields,
        atomic: true,
        status_semantics_server_side: true,
        exam_completion_guard: Boolean(effectiveExamId),
        completion_date_server_derived: effectiveStatus === "Realizado" && Boolean(effectiveExamId),
        identity_derived_server_side: Object.prototype.hasOwnProperty.call(rawPatch, "employee_id"),
        history_guard: existing.status === "Realizado" || existing.status === "Justificado",
      }, connection);
    });

    res.status(204).end();
  }),
);

cronogramaIntegrityRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id, status, theme, employee_id, exam_id
           FROM cronograma_entries
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [req.params.id],
      );
      const existing = rows[0];
      if (!existing) throw notFound("Registro do cronograma não encontrado");
      if (existing.status === "Realizado" || existing.status === "Justificado") {
        throw conflict("Lançamento realizado ou justificado faz parte do histórico operacional e não pode ser excluído");
      }

      await connection.execute(`DELETE FROM cronograma_entries WHERE id = ?`, [existing.id]);
      await audit(req.user.id, "DELETE", "cronograma_entries", existing.id, {
        status: existing.status,
        theme: existing.theme,
        employee_id: existing.employee_id,
        exam_id: existing.exam_id,
        atomic: true,
        history_guard: true,
      }, connection);
    });

    res.status(204).end();
  }),
);
