import { Router } from "express";
import { withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { config } from "../config.js";
import { requireAdmin } from "../session.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  notFound,
  parseJson,
  requireBoolean,
  requireOneOf,
  requireText,
  trimOrNull,
  uuid,
} from "../util.js";

export const practicalIntegrityRouter = Router();

const PRACTICAL_STATUS = ["Planejada", "Em andamento", "Concluída"];
const MARKER_PREFIX = "[PRACTICAL:";

function operationalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function mysqlDateOrNull(value, label) {
  const text = trimOrNull(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest(`${label} inválida`);
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw badRequest(`${label} inválida`);
  return text;
}

function requireMonth(value) {
  const text = requireText(value, "Mês");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw badRequest("Mês inválido");
  return text;
}

function finiteNumber(value, label, { min = 0, max = 100 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw badRequest(`${label} inválido`);
  return number;
}

function normalizeChecklist(value) {
  if (!Array.isArray(value)) throw badRequest("Checklist inválido");
  if (value.length > 100) throw badRequest("Checklist excede o limite permitido");
  return value.map((item, index) => ({
    id: String(item?.id ?? index + 1).slice(0, 80),
    label: requireText(item?.label, `Item ${index + 1} do checklist`).slice(0, 500),
    done: requireBoolean(item?.done ?? false, `Situação do item ${index + 1}`),
  }));
}

function checklistFromTemplateTasks(raw) {
  const tasks = parseJson(raw, []);
  if (!Array.isArray(tasks)) return [];
  return tasks.map((rawTask, index) => {
    let task = rawTask;
    if (typeof rawTask === "string") {
      try { task = JSON.parse(rawTask); }
      catch { task = { title: rawTask }; }
    }
    if (!task || typeof task !== "object" || Array.isArray(task)) return null;
    const title = String(task.title ?? task.label ?? "").trim();
    if (!title) return null;
    const category = String(task.category ?? "").trim();
    return {
      id: String(task.id ?? `task_${index + 1}`).slice(0, 80),
      label: (category ? `${category} · ${title}` : title).slice(0, 500),
      done: false,
    };
  }).filter(Boolean);
}

function marker(id) {
  return `${MARKER_PREFIX}${id}]`;
}

function appendMarker(notes, id) {
  const token = marker(id);
  const current = String(notes ?? "").trim();
  if (current.includes(token)) return current || token;
  return current ? `${current}\n${token}` : token;
}

function monthFromDate(value) {
  return value ? String(value).slice(0, 7) : null;
}

function templateDueInMonth(recurrence, monthNumber) {
  if (recurrence === "once" || recurrence === "monthly") return true;
  if (recurrence === "bimonthly") return (monthNumber - 1) % 2 === 0;
  if (recurrence === "quarterly") return (monthNumber - 1) % 3 === 0;
  return false;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function dateAtDay(month, day) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function absenceCoversDate(suspension, date) {
  if (suspension.type !== "ausencia_operador") return false;
  const start = suspension.date_start ? String(suspension.date_start).slice(0, 10) : null;
  const end = suspension.date_end ? String(suspension.date_end).slice(0, 10) : null;
  if (!start && !end) return true;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function findAvailableDate(month, desiredDay, employeeId, suspensions, usedDates) {
  const totalDays = daysInMonth(month);
  for (let distance = 0; distance < totalDays; distance += 1) {
    const candidates = distance === 0 ? [desiredDay] : [desiredDay + distance, desiredDay - distance];
    for (const day of candidates) {
      if (day < 1 || day > totalDays) continue;
      const date = dateAtDay(month, day);
      if (usedDates.has(date)) continue;
      const blocked = suspensions.some((row) => row.employee_id === employeeId && absenceCoversDate(row, date));
      if (!blocked) return date;
    }
  }
  return null;
}

async function lockOperationalEmployee(connection, employeeId) {
  const [rows] = await connection.execute(
    `SELECT id,full_name,matricula,sector,status,access_profile
       FROM employees
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
    [employeeId],
  );
  const employee = rows[0];
  if (!employee) throw notFound("Colaborador não encontrado");
  if (employee.status !== "Ativo") throw badRequest("A avaliação só pode ser planejada para colaborador ativo");
  if (employee.access_profile === "Inspetor") throw badRequest("Avaliação prática operacional não pode ser criada para Inspetor");
  return employee;
}

async function findCronogramaEntry(connection, evaluation, { lock = true } = {}) {
  const token = marker(evaluation.id);
  const lockSql = lock ? " FOR UPDATE" : "";
  const [marked] = await connection.execute(
    `SELECT *
       FROM cronograma_entries
      WHERE employee_id = ?
        AND notes LIKE ?
      ORDER BY created_at ASC
      LIMIT 1${lockSql}`,
    [evaluation.employee_id, `%${token}%`],
  );
  if (marked[0]) return marked[0];

  const month = monthFromDate(evaluation.evaluation_date);
  if (!month) return null;
  const [exact] = await connection.execute(
    `SELECT *
       FROM cronograma_entries
      WHERE employee_id = ?
        AND month = ?
        AND LOWER(TRIM(theme)) = LOWER(TRIM(?))
        AND planned_date = ?
        AND exam_id IS NULL
      ORDER BY CASE status WHEN 'Pendente' THEN 0 WHEN 'Justificado' THEN 1 ELSE 2 END, created_at ASC
      LIMIT 1${lockSql}`,
    [evaluation.employee_id, month, evaluation.title, evaluation.evaluation_date],
  );
  return exact[0] ?? null;
}

async function ensureCronogramaPlan(connection, evaluation, actorId) {
  if (!evaluation.evaluation_date) return { action: "none", entryId: null };
  const month = monthFromDate(evaluation.evaluation_date);
  const existing = await findCronogramaEntry(connection, evaluation);
  const notes = appendMarker(existing?.notes, evaluation.id);

  if (existing) {
    if (existing.status === "Pendente") {
      await connection.execute(
        `UPDATE cronograma_entries
            SET month = ?, theme = ?, planned_date = ?, notes = ?, updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?`,
        [month, evaluation.title, evaluation.evaluation_date, notes, existing.id],
      );
      return { action: "linked", entryId: existing.id };
    }
    if (String(existing.notes ?? "").includes(marker(evaluation.id))) {
      throw conflict("A avaliação está vinculada a um lançamento de Cronograma já formalizado. Planeje uma nova avaliação para continuar.");
    }
  }

  const id = uuid();
  await connection.execute(
    `INSERT INTO cronograma_entries
     (id, month, employee_id, employee_name, employee_matricula, employee_sector, theme,
      exam_id, exam_title, type, status, justification, planned_date, completion_date, notes,
      question_bank_ids, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'Planejado', 'Pendente', NULL, ?, NULL, ?, JSON_ARRAY(), ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [id, month, evaluation.employee_id, evaluation.employee_name, evaluation.employee_matricula, evaluation.employee_sector,
      evaluation.title, evaluation.evaluation_date, appendMarker(null, evaluation.id), actorId],
  );
  return { action: "created", entryId: id };
}

async function completeCronograma(connection, evaluation, actorId) {
  const checklist = parseJson(evaluation.checklist, []);
  if (checklist.length > 0 && checklist.some((item) => !item?.done)) {
    throw badRequest("Conclua todos os itens do checklist antes de finalizar a avaliação prática");
  }

  const completedAt = evaluation.completed_at ? new Date(evaluation.completed_at) : new Date();
  const completionDate = operationalDate(Number.isNaN(completedAt.getTime()) ? new Date() : completedAt);
  const existing = await findCronogramaEntry(connection, evaluation);

  if (existing?.status === "Justificado") {
    throw conflict("O lançamento vinculado está justificado. Planeje uma nova avaliação prática em vez de sobrescrever esse histórico.");
  }

  if (existing) {
    const notes = appendMarker(existing.notes, evaluation.id);
    await connection.execute(
      `UPDATE cronograma_entries
          SET status = 'Realizado', type = 'Realizado', completion_date = ?, justification = NULL,
              theme = ?, notes = ?, updated_at = UTC_TIMESTAMP(3)
        WHERE id = ?`,
      [completionDate, evaluation.title, notes, existing.id],
    );
    return { action: existing.status === "Realizado" ? "already-complete" : "completed", entryId: existing.id };
  }

  const month = monthFromDate(evaluation.evaluation_date) || completionDate.slice(0, 7);
  const id = uuid();
  await connection.execute(
    `INSERT INTO cronograma_entries
     (id, month, employee_id, employee_name, employee_matricula, employee_sector, theme,
      exam_id, exam_title, type, status, justification, planned_date, completion_date, notes,
      question_bank_ids, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'Realizado', 'Realizado', NULL, ?, ?, ?, JSON_ARRAY(), ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [id, month, evaluation.employee_id, evaluation.employee_name, evaluation.employee_matricula, evaluation.employee_sector,
      evaluation.title, evaluation.evaluation_date, completionDate, appendMarker(null, evaluation.id), actorId],
  );
  return { action: "created-complete", entryId: id };
}

practicalIntegrityRouter.post(
  "/practical-evaluations/generate-month",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const month = requireMonth(req.body?.month);
    const templateId = trimOrNull(req.body?.template_id);
    const result = await withTransaction(async (connection) => {
      const [suspensions] = await connection.execute(
        `SELECT id,type,month,reason,employee_id,date_start,date_end
           FROM cronograma_suspensions
          WHERE month = ?
          FOR UPDATE`,
        [month],
      );
      const monthSuspension = suspensions.find((row) => row.type === "mes_suspenso");
      if (monthSuspension) throw conflict(`O mês ${month} está suspenso no Cronograma: ${monthSuspension.reason}`);

      const [templates] = templateId
        ? await connection.execute(`SELECT * FROM practical_eval_templates WHERE id = ? AND status = 'Ativo' LIMIT 1 FOR UPDATE`, [templateId])
        : await connection.execute(`SELECT * FROM practical_eval_templates WHERE status = 'Ativo' ORDER BY title,id FOR UPDATE`);
      if (templateId && !templates.length) throw notFound("Modelo ativo não encontrado");

      const monthNumber = Number(month.slice(5, 7));
      const dueTemplates = templates.filter((template) => templateDueInMonth(template.recurrence, monthNumber));
      if (!dueTemplates.length) {
        await audit(req.user.id, "GENERATE_MONTH", "practical_evaluations", month, {
          created: 0, skipped: 0, suspended: 0, due_templates: 0, template_id: templateId, atomic: true,
        }, connection);
        return { month, created: 0, skipped: 0, suspended: 0, due_templates: 0 };
      }

      const [employees] = await connection.execute(
        `SELECT id,full_name,matricula,sector,status,access_profile
           FROM employees
          WHERE status = 'Ativo' AND access_profile <> 'Inspetor'
          ORDER BY full_name,id
          FOR UPDATE`,
      );

      const templateIds = dueTemplates.map((template) => template.id);
      const placeholders = templateIds.map(() => "?").join(",");
      const [existingEvaluations] = await connection.execute(
        `SELECT employee_id,template_id,template_slot,evaluation_date
           FROM practical_evaluations
          WHERE template_id IN (${placeholders})
            AND (template_slot = 'once' OR template_slot LIKE ?)
          FOR UPDATE`,
        [...templateIds, `${month}:%`],
      );
      const [existingCronograma] = await connection.execute(
        `SELECT employee_id,theme,planned_date
           FROM cronograma_entries
          WHERE month = ?
          FOR UPDATE`,
        [month],
      );

      const existingKeys = new Set(existingEvaluations.map((row) => `${row.employee_id}|${row.template_id}|${row.template_slot}`));
      let created = 0;
      let skipped = 0;
      let suspended = 0;
      const totalDays = daysInMonth(month);

      for (const template of dueTemplates) {
        const checklist = checklistFromTemplateTasks(template.tasks);
        const applications = template.recurrence === "once"
          ? 1
          : Math.max(1, Math.min(31, Number(template.applications_per_month) || 1));
        const eligibleEmployees = employees.filter((employee) => template.target_sector === "Todos" || employee.sector === template.target_sector);
        const normalizedTheme = String(template.title).trim().toLowerCase();

        for (const employee of eligibleEmployees) {
          const usedDates = new Set(
            existingCronograma
              .filter((row) => row.employee_id === employee.id && String(row.theme ?? "").trim().toLowerCase() === normalizedTheme && row.planned_date)
              .map((row) => String(row.planned_date).slice(0, 10)),
          );
          for (const row of existingEvaluations) {
            if (row.employee_id === employee.id && row.template_id === template.id && row.evaluation_date && String(row.evaluation_date).slice(0, 7) === month) {
              usedDates.add(String(row.evaluation_date).slice(0, 10));
            }
          }

          for (let index = 1; index <= applications; index += 1) {
            const slot = template.recurrence === "once" ? "once" : `${month}:${String(index).padStart(2, "0")}`;
            const key = `${employee.id}|${template.id}|${slot}`;
            if (existingKeys.has(key)) {
              skipped += 1;
              continue;
            }

            const desiredDay = Math.max(1, Math.min(totalDays, Math.floor((index * (totalDays + 1)) / (applications + 1))));
            const plannedDate = findAvailableDate(month, desiredDay, employee.id, suspensions, usedDates);
            if (!plannedDate) {
              suspended += 1;
              continue;
            }

            const id = uuid();
            await connection.execute(
              `INSERT INTO practical_evaluations
               (id,employee_id,employee_name,employee_matricula,employee_sector,title,template_id,template_slot,
                evaluator_id,evaluator_name,status,score,max_score,min_approval_score,checklist,notes,evaluation_date,completed_at,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,'Planejada',0,10,?,?,?,?,NULL,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
              [id, employee.id, employee.full_name, employee.matricula, employee.sector, template.title, template.id, slot,
                req.user.id, req.user.nome, Number(template.min_approval_score ?? 7), JSON.stringify(checklist), trimOrNull(template.description), plannedDate],
            );

            const cronogramaId = uuid();
            await connection.execute(
              `INSERT INTO cronograma_entries
               (id,month,employee_id,employee_name,employee_matricula,employee_sector,theme,exam_id,exam_title,type,status,
                justification,planned_date,completion_date,notes,question_bank_ids,created_by,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,NULL,NULL,'Planejado','Pendente',NULL,?,NULL,?,JSON_ARRAY(),?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
              [cronogramaId, month, employee.id, employee.full_name, employee.matricula, employee.sector, template.title,
                plannedDate, marker(id), req.user.id],
            );

            usedDates.add(plannedDate);
            existingKeys.add(key);
            created += 1;
          }
        }
      }

      await audit(req.user.id, "GENERATE_MONTH", "practical_evaluations", month, {
        created,
        skipped,
        suspended,
        due_templates: dueTemplates.length,
        template_id: templateId,
        cronograma_synchronized: true,
        suspensions_respected: true,
        atomic: true,
      }, connection);
      return { month, created, skipped, suspended, due_templates: dueTemplates.length };
    });

    res.json(result);
  }),
);

practicalIntegrityRouter.post(
  "/practical-evaluations",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeId = requireText(req.body?.employee_id, "Colaborador");
    const title = requireText(req.body?.title, "Título").slice(0, 255);
    const evaluationDate = mysqlDateOrNull(req.body?.evaluation_date, "Data da avaliação");
    if (!evaluationDate) throw badRequest("Informe a data da avaliação para sincronizar com o Cronograma");
    const minApprovalScore = finiteNumber(req.body?.min_approval_score ?? 7, "Nota mínima", { min: 0, max: 10 });
    const checklist = normalizeChecklist(req.body?.checklist ?? []);
    const id = uuid();

    const result = await withTransaction(async (connection) => {
      const employee = await lockOperationalEmployee(connection, employeeId);
      const evaluation = {
        id,
        employee_id: employee.id,
        employee_name: employee.full_name,
        employee_matricula: employee.matricula,
        employee_sector: employee.sector,
        title,
        evaluation_date: evaluationDate,
        checklist,
      };

      await connection.execute(
        `INSERT INTO practical_evaluations
         (id,employee_id,employee_name,employee_matricula,employee_sector,title,evaluator_id,evaluator_name,status,score,max_score,min_approval_score,checklist,notes,evaluation_date,completed_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?, 'Planejada',0,10,?,?,?,?,NULL,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
        [id,employee.id,employee.full_name,employee.matricula,employee.sector,title,req.user.id,req.user.nome,
          minApprovalScore,JSON.stringify(checklist),trimOrNull(req.body?.notes),evaluationDate],
      );

      const cronograma = await ensureCronogramaPlan(connection, evaluation, req.user.id);
      await audit(req.user.id, "INSERT", "practical_evaluations", id, {
        employee_id: employee.id,
        title,
        min_approval_score: minApprovalScore,
        identity_derived_server_side: true,
        cronograma_synchronized: cronograma.action,
        cronograma_entry_id: cronograma.entryId,
        atomic: true,
      }, connection);
      return cronograma;
    });

    res.status(201).json({ id, cronograma: result });
  }),
);

practicalIntegrityRouter.patch(
  "/practical-evaluations/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(`SELECT * FROM practical_evaluations WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
      const current = rows[0];
      if (!current) throw notFound("Avaliação não encontrada");
      if (current.status === "Concluída") {
        throw conflict("Avaliação prática concluída pertence ao histórico operacional e não pode ser alterada");
      }

      const patch = {};
      const has = (key) => Object.prototype.hasOwnProperty.call(req.body ?? {}, key);
      if (has("title")) patch.title = requireText(req.body.title, "Título").slice(0, 255);
      if (has("status")) patch.status = requireOneOf(req.body.status, PRACTICAL_STATUS, "Situação");
      if (has("score")) patch.score = finiteNumber(req.body.score, "Nota", { min: 0, max: 100 });
      if (has("max_score")) patch.max_score = finiteNumber(req.body.max_score, "Nota máxima", { min: 0.01, max: 100 });
      if (has("min_approval_score")) patch.min_approval_score = finiteNumber(req.body.min_approval_score, "Nota mínima", { min: 0, max: 10 });
      if (has("checklist")) patch.checklist = JSON.stringify(normalizeChecklist(req.body.checklist));
      if (has("notes")) patch.notes = trimOrNull(req.body.notes);
      if (has("evaluation_date")) {
        patch.evaluation_date = mysqlDateOrNull(req.body.evaluation_date, "Data da avaliação");
        if (!patch.evaluation_date) throw badRequest("A data da avaliação é obrigatória para manter a sincronização com o Cronograma");
      }
      if (!Object.keys(patch).length) throw badRequest("Nenhum campo para atualizar");

      const effectiveMax = Number(patch.max_score ?? current.max_score ?? 10);
      const effectiveScore = Number(patch.score ?? current.score ?? 0);
      if (effectiveScore > effectiveMax) throw badRequest("A nota não pode ser maior que a nota máxima");

      const effectiveStatus = patch.status ?? current.status;
      const effectiveDate = Object.prototype.hasOwnProperty.call(patch, "evaluation_date") ? patch.evaluation_date : current.evaluation_date;
      const effectiveChecklistRaw = Object.prototype.hasOwnProperty.call(patch, "checklist") ? patch.checklist : current.checklist;
      const effectiveChecklist = parseJson(effectiveChecklistRaw, []);
      if (effectiveStatus === "Concluída") {
        if (!effectiveDate) throw badRequest("Informe a data da avaliação antes de concluir");
        if (effectiveChecklist.length > 0 && effectiveChecklist.some((item) => !item?.done)) {
          throw badRequest("Conclua todos os itens do checklist antes de finalizar a avaliação prática");
        }
        patch.completed_at = current.completed_at || new Date();
      }
      patch.evaluator_id = req.user.id;
      patch.evaluator_name = req.user.nome;

      const fields = Object.keys(patch);
      await connection.execute(
        `UPDATE practical_evaluations SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
        [...fields.map((field) => patch[field]), current.id],
      );

      const evaluation = {
        ...current,
        ...patch,
        checklist: effectiveChecklist,
        title: patch.title ?? current.title,
        evaluation_date: effectiveDate,
      };
      const cronograma = effectiveStatus === "Concluída"
        ? await completeCronograma(connection, evaluation, req.user.id)
        : await ensureCronogramaPlan(connection, evaluation, req.user.id);

      await audit(req.user.id, "UPDATE", "practical_evaluations", current.id, {
        changed: fields,
        evaluator_derived_server_side: true,
        completed_history_guard: true,
        checklist_completion_guard: effectiveStatus === "Concluída",
        completion_date_server_derived: effectiveStatus === "Concluída",
        cronograma_synchronized: cronograma.action,
        cronograma_entry_id: cronograma.entryId,
        atomic: true,
      }, connection);
      return cronograma;
    });

    res.json({ ok: true, cronograma: result });
  }),
);

practicalIntegrityRouter.delete(
  "/practical-evaluations/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(`SELECT * FROM practical_evaluations WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
      const current = rows[0];
      if (!current) throw notFound("Avaliação não encontrada");
      if (current.status !== "Planejada") {
        throw conflict("Avaliação prática em andamento ou concluída pertence ao histórico operacional e não pode ser excluída");
      }

      const cronograma = await findCronogramaEntry(connection, current);
      if (cronograma && cronograma.status === "Pendente" && String(cronograma.notes ?? "").includes(marker(current.id))) {
        await connection.execute(`DELETE FROM cronograma_entries WHERE id = ?`, [cronograma.id]);
      }
      await connection.execute(`DELETE FROM practical_evaluations WHERE id = ?`, [current.id]);
      await audit(req.user.id, "DELETE", "practical_evaluations", current.id, {
        cronograma_pending_removed: Boolean(cronograma && cronograma.status === "Pendente" && String(cronograma.notes ?? "").includes(marker(current.id))),
        history_guard: true,
        atomic: true,
      }, connection);
    });

    res.status(204).end();
  }),
);