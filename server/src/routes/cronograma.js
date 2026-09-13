import { Router } from "express";
import { config } from "../config.js";
import { execute, query, queryOne, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin, requireAuth } from "../session.js";
import {
  asBool,
  asyncHandler,
  badRequest,
  notFound,
  optionalDate,
  parseJson,
  requireBoolean,
  requireMonth,
  requireOneOf,
  requireText,
  trimOrNull,
  uuid,
} from "../util.js";

export const cronogramaRouter = Router();

const STATUSES = ["Pendente", "Realizado", "Justificado"];
const TYPES = ["Planejado", "Realizado"];
const TARGET_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"];
const SUSPENSION_TYPES = ["mes_suspenso", "ausencia_operador"];

function mapEntry(row) {
  return { ...row, question_bank_ids: parseJson(row.question_bank_ids, []) };
}

function mapRecurring(row) {
  return { ...row, active: asBool(row.active) };
}

function operationalDateFromUtc(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw badRequest("Tentativa de prova possui data de conclusão inválida");
  const date = value instanceof Date
    ? value
    : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) throw badRequest("Tentativa de prova possui data de conclusão inválida");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function operationalEmployee(employeeId) {
  const id = requireText(employeeId, "Colaborador");
  const employee = await queryOne(
    `SELECT id, full_name, matricula, sector, status, access_profile FROM employees WHERE id = ?`,
    [id],
  );
  if (!employee) throw notFound("Colaborador não encontrado");
  if (employee.status !== "Ativo") throw badRequest("O colaborador precisa estar ativo");
  if (employee.access_profile === "Inspetor") throw badRequest("O cronograma operacional não pode ser vinculado a Inspetor");
  return employee;
}

async function validateQuestionLinks(questionIds, employeeSector) {
  const ids = Array.isArray(questionIds) ? questionIds.map((value) => String(value).trim()).filter(Boolean) : [];
  if (!ids.length) return [];
  if (new Set(ids).size !== ids.length) throw badRequest("Existem questões duplicadas vinculadas ao lançamento");
  if (ids.length > 100) throw badRequest("Limite de 100 questões vinculadas por lançamento");

  const placeholders = ids.map(() => "?").join(",");
  const rows = await query(
    `SELECT id FROM question_bank
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

function readEntryInput(body, { partial = false } = {}) {
  const input = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);
  if (!partial || has("month")) input.month = requireMonth(body?.month);
  if (!partial || has("employee_id")) input.employee_id = requireText(body?.employee_id, "Colaborador");
  if (!partial || has("theme")) input.theme = requireText(body?.theme, "Tema");
  if (!partial || has("exam_id")) input.exam_id = trimOrNull(body?.exam_id);
  if (!partial || has("exam_title")) input.exam_title = trimOrNull(body?.exam_title);
  if (!partial || has("type")) input.type = requireOneOf(body?.type, TYPES, "Tipo", "Planejado");
  if (!partial || has("status")) input.status = requireOneOf(body?.status, STATUSES, "Situação", "Pendente");
  if (!partial || has("justification")) input.justification = trimOrNull(body?.justification);
  if (!partial || has("planned_date")) input.planned_date = optionalDate(body?.planned_date, "Data planejada");
  if (!partial || has("completion_date")) input.completion_date = optionalDate(body?.completion_date, "Data de conclusão");
  if (!partial || has("notes")) input.notes = trimOrNull(body?.notes);
  if (!partial || has("question_bank_ids")) input.question_bank_ids = Array.isArray(body?.question_bank_ids) ? body.question_bank_ids.map(String) : [];
  if (partial && Object.keys(input).length === 0) throw badRequest("Nenhum campo para atualizar");
  return input;
}

function validateEntryStatusSemantics(input, existing = null) {
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const status = has("status") ? input.status : existing?.status;
  const justification = has("justification") ? input.justification : trimOrNull(existing?.justification);

  if (status === "Justificado") {
    if (!justification) throw badRequest("Motivo é obrigatório para lançamento justificado");
    input.justification = justification;
  } else if (status) {
    input.justification = null;
  }
  return input;
}

async function deriveEntryIdentity(input) {
  const employee = await operationalEmployee(input.employee_id);
  const employeeSector = requireOneOf(employee.sector, TARGET_SECTORS.filter((value) => value !== "Todos"), "Setor");
  return {
    ...input,
    employee_id: employee.id,
    employee_name: employee.full_name,
    employee_matricula: employee.matricula,
    employee_sector: employeeSector,
    question_bank_ids: await validateQuestionLinks(input.question_bank_ids, employeeSector),
  };
}

function entryVisibilityClause(req) {
  if (req.user.isAdmin) return { sql: "", params: [] };
  return { sql: " AND LOWER(TRIM(employee_matricula)) = LOWER(TRIM(?))", params: [req.user.matricula] };
}

cronogramaRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const month = requireMonth(req.query["month"]);
    const visible = entryVisibilityClause(req);
    const rows = await query(
      `SELECT * FROM cronograma_entries WHERE month = ?${visible.sql}
       ORDER BY planned_date IS NULL, planned_date ASC, employee_name ASC`,
      [month, ...visible.params],
    );
    res.json(rows.map(mapEntry));
  }),
);

cronogramaRouter.get(
  "/year/:year",
  requireAuth,
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) throw badRequest("Ano inválido");
    const visible = entryVisibilityClause(req);
    const rows = await query(
      `SELECT * FROM cronograma_entries WHERE month >= ? AND month <= ?${visible.sql}
       ORDER BY month ASC, employee_name ASC`,
      [`${year}-01`, `${year}-12`, ...visible.params],
    );
    res.json(rows.map(mapEntry));
  }),
);

cronogramaRouter.post(
  "/bulk",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (!entries.length) return res.status(204).end();
    if (entries.length > 1000) throw badRequest("Limite de 1000 lançamentos por operação");

    const prepared = [];
    for (const raw of entries) {
      prepared.push({ id: uuid(), input: await deriveEntryIdentity(validateEntryStatusSemantics(readEntryInput(raw))) });
    }

    const created = await withTransaction(async (connection) => {
      const ids = [];
      for (const { id, input } of prepared) {
        await connection.execute(
          `INSERT INTO cronograma_entries
           (id, month, employee_id, employee_name, employee_matricula, employee_sector, theme, exam_id, exam_title, type, status,
            justification, planned_date, completion_date, notes, question_bank_ids, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
          [id, input.month, input.employee_id, input.employee_name, input.employee_matricula, input.employee_sector, input.theme,
            input.exam_id, input.exam_title, input.type, input.status, input.justification, input.planned_date, input.completion_date,
            input.notes, JSON.stringify(input.question_bank_ids), req.user.id],
        );
        ids.push(id);
      }
      await audit(req.user.id, "BULK_INSERT", "cronograma_entries", ids[0] ?? "", {
        count: ids.length,
        identity_derived_server_side: true,
        question_links_validated_server_side: true,
        status_semantics_validated_server_side: true,
        atomic: true,
      }, connection);
      return ids;
    });

    res.status(201).json({ ids: created, count: created.length });
  }),
);

cronogramaRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = await deriveEntryIdentity(validateEntryStatusSemantics(readEntryInput(req.body)));
    const id = uuid();
    await execute(
      `INSERT INTO cronograma_entries
       (id, month, employee_id, employee_name, employee_matricula, employee_sector, theme, exam_id, exam_title, type, status,
        justification, planned_date, completion_date, notes, question_bank_ids, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [id, input.month, input.employee_id, input.employee_name, input.employee_matricula, input.employee_sector, input.theme,
        input.exam_id, input.exam_title, input.type, input.status, input.justification, input.planned_date, input.completion_date,
        input.notes, JSON.stringify(input.question_bank_ids), req.user.id],
    );
    await audit(req.user.id, "INSERT", "cronograma_entries", id, {
      month: input.month,
      employee_id: input.employee_id,
      identity_derived_server_side: true,
      question_links_validated_server_side: true,
      status_semantics_validated_server_side: true,
    });
    res.status(201).json({ id });
  }),
);

cronogramaRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(`SELECT * FROM cronograma_entries WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound("Registro do cronograma não encontrado");
    const input = validateEntryStatusSemantics(readEntryInput(req.body, { partial: true }), existing);
    if (Object.prototype.hasOwnProperty.call(input, "employee_id")) {
      const employee = await operationalEmployee(input.employee_id);
      input.employee_id = employee.id;
      input.employee_name = employee.full_name;
      input.employee_matricula = employee.matricula;
      input.employee_sector = requireOneOf(employee.sector, TARGET_SECTORS.filter((value) => value !== "Todos"), "Setor");
    }
    if (Object.prototype.hasOwnProperty.call(input, "question_bank_ids") || Object.prototype.hasOwnProperty.call(input, "employee_id")) {
      const effectiveSector = input.employee_sector ?? existing.employee_sector;
      const effectiveQuestionIds = Object.prototype.hasOwnProperty.call(input, "question_bank_ids")
        ? input.question_bank_ids
        : parseJson(existing.question_bank_ids, []);
      input.question_bank_ids = await validateQuestionLinks(effectiveQuestionIds, effectiveSector);
    }
    const fields = Object.keys(input);
    const values = fields.map((field) => field === "question_bank_ids" ? JSON.stringify(input[field]) : input[field]);
    await execute(`UPDATE cronograma_entries SET ${fields.map((f) => `${f} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`, [...values, req.params.id]);
    await audit(req.user.id, "UPDATE", "cronograma_entries", req.params.id, {
      changed: fields,
      identity_derived_server_side: Object.prototype.hasOwnProperty.call(input, "employee_id"),
      question_links_validated_server_side: fields.includes("question_bank_ids"),
      status_semantics_validated_server_side: true,
    });
    res.status(204).end();
  }),
);

cronogramaRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(`SELECT id FROM cronograma_entries WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound("Registro do cronograma não encontrado");
    await execute(`DELETE FROM cronograma_entries WHERE id = ?`, [req.params.id]);
    await audit(req.user.id, "DELETE", "cronograma_entries", req.params.id);
    res.status(204).end();
  }),
);

cronogramaRouter.post(
  "/sync-exam-attempts",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const month = req.body?.month ? requireMonth(req.body.month) : null;
    const rows = await query(
      `SELECT c.id, MIN(a.finished_at) AS finished_at
         FROM cronograma_entries c
         JOIN exam_attempts a
           ON a.exam_id = c.exam_id
          AND LOWER(TRIM(a.matricula)) = LOWER(TRIM(c.employee_matricula))
          AND a.passed = 1
        WHERE c.exam_id IS NOT NULL
          AND c.status <> 'Realizado'
          ${month ? "AND c.month = ?" : ""}
        GROUP BY c.id`,
      month ? [month] : [],
    );

    const updates = rows.map((row) => ({
      id: row.id,
      completionDate: operationalDateFromUtc(row.finished_at),
    }));

    if (!updates.length) return res.json({ changed: 0 });

    const changed = await withTransaction(async (connection) => {
      let count = 0;
      for (const update of updates) {
        const [result] = await connection.execute(
          `UPDATE cronograma_entries
              SET status = 'Realizado', type = 'Realizado', completion_date = ?, justification = NULL, updated_at = UTC_TIMESTAMP(3)
            WHERE id = ? AND status <> 'Realizado'`,
          [update.completionDate, update.id],
        );
        count += Number(result.affectedRows || 0);
      }
      await audit(req.user.id, "SYNC_EXAMS", "cronograma_entries", month ?? "all", {
        changed: count,
        candidates: updates.length,
        atomic: true,
        set_based_lookup: true,
        first_approved_attempt: true,
        completion_date_timezone: config.timezone,
      }, connection);
      return count;
    });

    res.json({ changed });
  }),
);

cronogramaRouter.get(
  "/recurring-models",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rows = await query(`SELECT * FROM cronograma_recurring_models ORDER BY active DESC, theme ASC`);
    res.json(rows.map(mapRecurring));
  }),
);

cronogramaRouter.post(
  "/recurring-models",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = uuid();
    const theme = requireText(req.body?.theme, "Tema");
    const targetSector = requireOneOf(req.body?.target_sector, TARGET_SECTORS, "Setor alvo");
    const active = Object.prototype.hasOwnProperty.call(req.body ?? {}, "active")
      ? requireBoolean(req.body.active, "Situação ativa", { asInteger: true })
      : 1;
    await execute(
      `INSERT INTO cronograma_recurring_models (id, theme, target_sector, recurrence, active, created_by, created_by_name, created_at, updated_at)
       VALUES (?, ?, ?, 'monthly', ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [id, theme, targetSector, active, req.user.id, req.user.nome],
    );
    await audit(req.user.id, "INSERT", "cronograma_recurring_models", id, { theme, creator_derived_server_side: true });
    res.status(201).json({ id });
  }),
);

cronogramaRouter.patch(
  "/recurring-models/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(`SELECT id FROM cronograma_recurring_models WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound("Modelo recorrente não encontrado");
    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "theme")) { fields.push("theme"); values.push(requireText(req.body.theme, "Tema")); }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "target_sector")) { fields.push("target_sector"); values.push(requireOneOf(req.body.target_sector, TARGET_SECTORS, "Setor alvo")); }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "active")) { fields.push("active"); values.push(requireBoolean(req.body.active, "Situação ativa", { asInteger: true })); }
    if (!fields.length) throw badRequest("Nenhum campo para atualizar");
    await execute(`UPDATE cronograma_recurring_models SET ${fields.map((f) => `${f} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`, [...values, req.params.id]);
    await audit(req.user.id, "UPDATE", "cronograma_recurring_models", req.params.id, { changed: fields });
    res.status(204).end();
  }),
);

cronogramaRouter.delete(
  "/recurring-models/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(`SELECT id FROM cronograma_recurring_models WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound("Modelo recorrente não encontrado");
    await execute(`DELETE FROM cronograma_recurring_models WHERE id = ?`, [req.params.id]);
    await audit(req.user.id, "DELETE", "cronograma_recurring_models", req.params.id);
    res.status(204).end();
  }),
);

cronogramaRouter.get(
  "/suspensions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const month = requireMonth(req.query["month"]);
    let rows;
    if (req.user.isAdmin) {
      rows = await query(`SELECT * FROM cronograma_suspensions WHERE month = ? ORDER BY type ASC, date_start IS NULL, date_start ASC`, [month]);
    } else {
      rows = await query(
        `SELECT * FROM cronograma_suspensions WHERE month = ? AND (type = 'mes_suspenso' OR LOWER(TRIM(employee_matricula)) = LOWER(TRIM(?))) ORDER BY type ASC, date_start IS NULL, date_start ASC`,
        [month, req.user.matricula],
      );
    }
    res.json(rows);
  }),
);

cronogramaRouter.post(
  "/suspensions",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = uuid();
    const type = requireOneOf(req.body?.type, SUSPENSION_TYPES, "Tipo de suspensão");
    const month = requireMonth(req.body?.month);
    const reason = requireText(req.body?.reason, "Motivo");
    let employee = null;
    if (type === "ausencia_operador") employee = await operationalEmployee(req.body?.employee_id);
    const dateStart = optionalDate(req.body?.date_start, "Data inicial");
    const dateEnd = optionalDate(req.body?.date_end, "Data final");
    if (dateStart && dateEnd && dateEnd < dateStart) throw badRequest("Data final não pode ser anterior à data inicial");
    await execute(
      `INSERT INTO cronograma_suspensions
       (id, type, month, reason, notes, employee_id, employee_name, employee_matricula, date_start, date_end, created_by, created_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [id, type, month, reason, trimOrNull(req.body?.notes), employee?.id ?? null, employee?.full_name ?? null, employee?.matricula ?? null,
        dateStart, dateEnd, req.user.id, req.user.nome],
    );
    await audit(req.user.id, "INSERT", "cronograma_suspensions", id, { type, month, employee_id: employee?.id ?? null, identity_derived_server_side: true });
    res.status(201).json({ id });
  }),
);

cronogramaRouter.patch(
  "/suspensions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(`SELECT * FROM cronograma_suspensions WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound("Suspensão não encontrada");
    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "reason")) { fields.push("reason"); values.push(requireText(req.body.reason, "Motivo")); }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "notes")) { fields.push("notes"); values.push(trimOrNull(req.body.notes)); }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "date_start")) { fields.push("date_start"); values.push(optionalDate(req.body.date_start, "Data inicial")); }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "date_end")) { fields.push("date_end"); values.push(optionalDate(req.body.date_end, "Data final")); }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "employee_id")) {
      if (existing.type !== "ausencia_operador") throw badRequest("Suspensão mensal não possui colaborador vinculado");
      const employee = await operationalEmployee(req.body.employee_id);
      fields.push("employee_id", "employee_name", "employee_matricula");
      values.push(employee.id, employee.full_name, employee.matricula);
    }
    if (!fields.length) throw badRequest("Nenhum campo para atualizar");

    const effectiveStartIndex = fields.indexOf("date_start");
    const effectiveEndIndex = fields.indexOf("date_end");
    const effectiveStart = effectiveStartIndex >= 0 ? values[effectiveStartIndex] : existing.date_start;
    const effectiveEnd = effectiveEndIndex >= 0 ? values[effectiveEndIndex] : existing.date_end;
    if (effectiveStart && effectiveEnd) {
      const start = new Date(effectiveStart).toISOString().slice(0, 10);
      const end = new Date(effectiveEnd).toISOString().slice(0, 10);
      if (end < start) throw badRequest("Data final não pode ser anterior à data inicial");
    }

    await execute(`UPDATE cronograma_suspensions SET ${fields.map((f) => `${f} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`, [...values, req.params.id]);
    await audit(req.user.id, "UPDATE", "cronograma_suspensions", req.params.id, { changed: fields, identity_derived_server_side: fields.includes("employee_id") });
    res.status(204).end();
  }),
);

cronogramaRouter.delete(
  "/suspensions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(`SELECT id FROM cronograma_suspensions WHERE id = ?`, [req.params.id]);
    if (!existing) throw notFound("Suspensão não encontrada");
    await execute(`DELETE FROM cronograma_suspensions WHERE id = ?`, [req.params.id]);
    await audit(req.user.id, "DELETE", "cronograma_suspensions", req.params.id);
    res.status(204).end();
  }),
);
