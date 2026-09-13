import { Router } from "express";
import { execute, query, queryOne, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin, requireAuth } from "../session.js";
import { asBool, asyncHandler, badRequest, notFound, parseJson, requireBoolean, requireOneOf, requireText, trimOrNull, uuid } from "../util.js";

export const operationsRouter = Router();

const SEVERITIES = ["Baixa", "Média", "Alta", "Crítica"];
const OCCURRENCE_STATUS = ["Aberta", "Em análise", "Concluída"];
const PRACTICAL_STATUS = ["Planejada", "Em andamento", "Concluída"];
const TEMPLATE_STATUS = ["Ativo", "Inativo"];
const RECURRENCES = ["once", "monthly", "bimonthly", "quarterly"];
const TARGET_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"];

const jsonValue = (value, fallback = []) => parseJson(value, fallback);
const boolRow = (row) => ({ ...row, active: asBool(row.active) });
const practicalRow = (row) => ({ ...row, score: Number(row.score ?? 0), max_score: Number(row.max_score ?? 10), checklist: jsonValue(row.checklist, []) });
const templateRow = (row) => ({ ...row, min_approval_score: Number(row.min_approval_score ?? 7), applications_per_month: Number(row.applications_per_month ?? 1), tasks: jsonValue(row.tasks, []) });

function mysqlDateTimeOrNull(value, label) {
  const text = trimOrNull(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} inválida`);
  return date;
}

function mysqlDateOrNull(value, label) {
  const text = trimOrNull(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest(`${label} inválida`);
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw badRequest(`${label} inválida`);
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

function normalizePracticalTasks(value) {
  if (!Array.isArray(value)) throw badRequest("Procedimentos do modelo inválidos");
  if (value.length < 1) throw badRequest("Adicione ao menos um procedimento ao modelo");
  if (value.length > 100) throw badRequest("O modelo excede o limite de procedimentos");
  const ids = new Set();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw badRequest(`Procedimento ${index + 1} inválido`);
    const id = String(item.id ?? `task_${index + 1}`).trim().slice(0, 80);
    const title = requireText(item.title, `Procedimento ${index + 1}`).slice(0, 500);
    const category = String(item.category ?? "").trim().slice(0, 120);
    const description = String(item.description ?? "").trim().slice(0, 1000);
    if (!id) throw badRequest(`Identificador do procedimento ${index + 1} inválido`);
    if (ids.has(id)) throw badRequest("O modelo contém procedimentos duplicados");
    ids.add(id);
    return { id, category, title, description };
  });
}

function practicalTemplateInput(body, { partial = false } = {}) {
  const patch = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  if (!partial || has("title")) patch.title = requireText(body?.title, "Título").slice(0, 255);
  if (!partial || has("platform")) patch.platform = trimOrNull(body?.platform)?.slice(0, 120) ?? null;
  if (!partial || has("description")) patch.description = trimOrNull(body?.description);
  if (!partial || has("target_sector")) patch.target_sector = requireOneOf(body?.target_sector, TARGET_SECTORS, "Setor alvo", "CFTV");
  if (!partial || has("min_approval_score")) patch.min_approval_score = finiteNumber(body?.min_approval_score ?? 7, "Nota mínima", { min: 0, max: 10 });
  if (!partial || has("recurrence")) patch.recurrence = requireOneOf(body?.recurrence, RECURRENCES, "Recorrência", "monthly");
  if (!partial || has("applications_per_month")) {
    const apps = Number(body?.applications_per_month ?? 1);
    if (!Number.isInteger(apps) || apps < 1 || apps > 31) throw badRequest("Aplicações por mês inválidas");
    patch.applications_per_month = apps;
  }
  if (!partial || has("tasks")) patch.tasks = JSON.stringify(normalizePracticalTasks(body?.tasks));
  if (!partial || has("status")) patch.status = requireOneOf(body?.status, TEMPLATE_STATUS, "Situação", "Ativo");
  if (partial && Object.keys(patch).length === 0) throw badRequest("Nenhum campo para atualizar");
  return patch;
}

async function occurrenceEmployeeForCreate(req, connection) {
  if (!req.user.isAdmin) {
    const [rows] = await connection.execute(
      `SELECT id,full_name,matricula,status FROM employees WHERE id = ? LIMIT 1 FOR UPDATE`,
      [req.user.employeeId],
    );
    const employee = rows[0];
    if (!employee || employee.status !== "Ativo") throw badRequest("Colaborador autenticado não está disponível para registro");
    return employee;
  }

  const employeeId = trimOrNull(req.body?.employee_id);
  if (!employeeId) return null;
  const [rows] = await connection.execute(
    `SELECT id,full_name,matricula,status FROM employees WHERE id = ? LIMIT 1 FOR UPDATE`,
    [employeeId],
  );
  const employee = rows[0];
  if (!employee) throw notFound("Colaborador relacionado não encontrado");
  return employee;
}

operationsRouter.get("/knowledge", requireAuth, asyncHandler(async (req, res) => {
  const rows = req.user.isAdmin
    ? await query(`SELECT * FROM knowledge_items ORDER BY category, title`)
    : await query(`SELECT * FROM knowledge_items WHERE active = 1 AND (target_sector = 'Todos' OR target_sector = ?) ORDER BY category, title`, [req.user.setor || ""]);
  res.json(rows.map(boolRow));
}));

operationsRouter.post("/knowledge", requireAdmin, asyncHandler(async (req, res) => {
  const id = uuid();
  const title = requireText(req.body?.title, "Título");
  const category = requireText(req.body?.category || "Geral", "Categoria");
  const content = requireText(req.body?.content, "Conteúdo");
  const target = requireOneOf(req.body?.target_sector, TARGET_SECTORS, "Setor alvo", "Todos");
  await withTransaction(async (connection) => {
    await connection.execute(`INSERT INTO knowledge_items (id,title,category,content,target_sector,active,created_by,created_at,updated_at) VALUES (?,?,?,?,?,1,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`, [id,title,category,content,target,req.user.id]);
    await audit(req.user.id,"INSERT","knowledge_items",id,{title,atomic:true},connection);
  });
  res.status(201).json({ id });
}));

operationsRouter.patch("/knowledge/:id", requireAdmin, asyncHandler(async (req,res) => {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "title")) patch.title = requireText(req.body.title, "Título");
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "category")) patch.category = requireText(req.body.category, "Categoria");
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "content")) patch.content = requireText(req.body.content, "Conteúdo");
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "target_sector")) patch.target_sector = requireOneOf(req.body.target_sector, TARGET_SECTORS, "Setor alvo");
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "active")) patch.active = requireBoolean(req.body.active, "Situação ativa", { asInteger: true });
  if (!Object.keys(patch).length) throw badRequest("Nenhum campo para atualizar");
  const fields = Object.keys(patch);
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT id FROM knowledge_items WHERE id = ? FOR UPDATE`, [req.params.id]);
    if (!rows.length) throw notFound("Conteúdo não encontrado");
    await connection.execute(`UPDATE knowledge_items SET ${fields.map(f=>`${f} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`, [...fields.map(f=>patch[f]),req.params.id]);
    await audit(req.user.id,"UPDATE","knowledge_items",req.params.id,{changed:fields,atomic:true},connection);
  });
  res.status(204).end();
}));
operationsRouter.delete("/knowledge/:id", requireAdmin, asyncHandler(async (req,res)=>{
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT id FROM knowledge_items WHERE id = ? FOR UPDATE`, [req.params.id]);
    if (!rows.length) throw notFound("Conteúdo não encontrado");
    await connection.execute(`DELETE FROM knowledge_items WHERE id = ?`,[req.params.id]);
    await audit(req.user.id,"DELETE","knowledge_items",req.params.id,{atomic:true},connection);
  });
  res.status(204).end();
}));

operationsRouter.get("/occurrences", requireAuth, asyncHandler(async (req,res)=>{
  const rows = req.user.isAdmin
    ? await query(`SELECT * FROM occurrences ORDER BY occurred_at DESC`)
    : await query(`SELECT * FROM occurrences WHERE created_by = ? OR employee_id = ? ORDER BY occurred_at DESC`, [req.user.id, req.user.employeeId]);
  res.json(rows);
}));
operationsRouter.post("/occurrences", requireAuth, asyncHandler(async (req,res)=>{
  const id=uuid();
  const title=requireText(req.body?.title,"Título");
  const category=requireText(req.body?.category || "Operacional","Categoria");
  const severity=requireOneOf(req.body?.severity,SEVERITIES,"Severidade","Baixa");
  const description=requireText(req.body?.description,"Descrição");
  const occurredAt = mysqlDateTimeOrNull(req.body?.occurred_at, "Data/hora da ocorrência");
  await withTransaction(async (connection) => {
    const employee = await occurrenceEmployeeForCreate(req, connection);
    await connection.execute(
      `INSERT INTO occurrences (id,employee_id,employee_name,employee_matricula,title,category,severity,description,location,status,occurred_at,resolution_notes,resolved_at,created_by,created_by_name,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,'Aberta',COALESCE(?,UTC_TIMESTAMP(3)),NULL,NULL,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [id,employee?.id ?? null,employee?.full_name ?? null,employee?.matricula ?? null,title,category,severity,description,trimOrNull(req.body?.location),occurredAt,req.user.id,req.user.nome],
    );
    await audit(req.user.id,"INSERT","occurrences",id,{title,severity,employee_id:employee?.id ?? null,identity_derived_server_side:true,atomic:true},connection);
  });
  res.status(201).json({id});
}));
operationsRouter.patch("/occurrences/:id", requireAdmin, asyncHandler(async (req,res)=>{
  const allowed=["title","category","severity","description","location","status","occurred_at","resolution_notes","resolved_at"];
  const patch=Object.fromEntries(allowed.filter(k=>Object.prototype.hasOwnProperty.call(req.body||{},k)).map(k=>[k,req.body[k]]));
  if(Object.prototype.hasOwnProperty.call(patch,"title")) patch.title=requireText(patch.title,"Título");
  if(Object.prototype.hasOwnProperty.call(patch,"category")) patch.category=requireText(patch.category,"Categoria");
  if(Object.prototype.hasOwnProperty.call(patch,"description")) patch.description=requireText(patch.description,"Descrição");
  if(Object.prototype.hasOwnProperty.call(patch,"location")) patch.location=trimOrNull(patch.location);
  if(Object.prototype.hasOwnProperty.call(patch,"resolution_notes")) patch.resolution_notes=trimOrNull(patch.resolution_notes);
  if(Object.prototype.hasOwnProperty.call(patch,"severity")) patch.severity=requireOneOf(patch.severity,SEVERITIES,"Severidade");
  if(Object.prototype.hasOwnProperty.call(patch,"status")) patch.status=requireOneOf(patch.status,OCCURRENCE_STATUS,"Situação");
  if(Object.prototype.hasOwnProperty.call(patch,"occurred_at")) patch.occurred_at=mysqlDateTimeOrNull(patch.occurred_at,"Data/hora da ocorrência");
  if(Object.prototype.hasOwnProperty.call(patch,"resolved_at")) patch.resolved_at=mysqlDateTimeOrNull(patch.resolved_at,"Data/hora de conclusão");

  const employeeChangeRequested = Object.prototype.hasOwnProperty.call(req.body || {}, "employee_id");
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT id FROM occurrences WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
    if (!rows.length) throw notFound("Ocorrência não encontrada");

    if (employeeChangeRequested) {
      const employeeId = trimOrNull(req.body?.employee_id);
      if (!employeeId) {
        patch.employee_id = null;
        patch.employee_name = null;
        patch.employee_matricula = null;
      } else {
        const [employees] = await connection.execute(
          `SELECT id,full_name,matricula FROM employees WHERE id = ? LIMIT 1 FOR UPDATE`,
          [employeeId],
        );
        const employee = employees[0];
        if (!employee) throw notFound("Colaborador relacionado não encontrado");
        patch.employee_id = employee.id;
        patch.employee_name = employee.full_name;
        patch.employee_matricula = employee.matricula;
      }
    }

    const fields=Object.keys(patch);
    if(!fields.length) throw badRequest("Nenhum campo para atualizar");
    await connection.execute(`UPDATE occurrences SET ${fields.map(f=>`${f} = ?`).join(", ")}, updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[...fields.map(f=>patch[f]),req.params.id]);
    await audit(req.user.id,"UPDATE","occurrences",req.params.id,{changed:fields,identity_derived_server_side:employeeChangeRequested,atomic:true},connection);
  });
  res.status(204).end();
}));
operationsRouter.delete("/occurrences/:id", requireAdmin, asyncHandler(async(req,res)=>{
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(`SELECT id FROM occurrences WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
    if (!rows.length) throw notFound("Ocorrência não encontrada");
    await connection.execute(`DELETE FROM occurrences WHERE id=?`,[req.params.id]);
    await audit(req.user.id,"DELETE","occurrences",req.params.id,{atomic:true},connection);
  });
  res.status(204).end();
}));

operationsRouter.get("/practical-evaluations", requireAdmin, asyncHandler(async(_req,res)=>{const rows=await query(`SELECT * FROM practical_evaluations ORDER BY evaluation_date DESC, created_at DESC`);res.json(rows.map(practicalRow));}));
operationsRouter.post("/practical-evaluations", requireAdmin, asyncHandler(async(req,res)=>{
  const id=uuid();
  const employeeId=requireText(req.body?.employee_id,"Colaborador");
  const title=requireText(req.body?.title,"Título");
  const checklist=normalizeChecklist(req.body?.checklist ?? []);
  const evaluationDate=mysqlDateOrNull(req.body?.evaluation_date,"Data da avaliação");
  await withTransaction(async (connection) => {
    const [employees]=await connection.execute(`SELECT id,full_name,matricula,sector,status,access_profile FROM employees WHERE id=? LIMIT 1 FOR UPDATE`,[employeeId]);
    const employee=employees[0];
    if(!employee) throw notFound("Colaborador não encontrado");
    if(employee.status!=="Ativo") throw badRequest("A avaliação só pode ser planejada para colaborador ativo");
    if(employee.access_profile==="Inspetor") throw badRequest("Avaliação prática operacional não pode ser criada para Inspetor");
    await connection.execute(
      `INSERT INTO practical_evaluations (id,employee_id,employee_name,employee_matricula,employee_sector,title,evaluator_id,evaluator_name,status,score,max_score,checklist,notes,evaluation_date,completed_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'Planejada',0,10,?,?,?,NULL,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [id,employee.id,employee.full_name,employee.matricula,employee.sector,title,req.user.id,req.user.nome,JSON.stringify(checklist),trimOrNull(req.body?.notes),evaluationDate],
    );
    await audit(req.user.id,"INSERT","practical_evaluations",id,{employee_id:employee.id,title,identity_derived_server_side:true,atomic:true},connection);
  });
  res.status(201).json({id});
}));
operationsRouter.patch("/practical-evaluations/:id", requireAdmin, asyncHandler(async(req,res)=>{
  const patch={};
  if(Object.prototype.hasOwnProperty.call(req.body||{},"title")) patch.title=requireText(req.body.title,"Título");
  if(Object.prototype.hasOwnProperty.call(req.body||{},"status")) patch.status=requireOneOf(req.body.status,PRACTICAL_STATUS,"Situação");
  if(Object.prototype.hasOwnProperty.call(req.body||{},"score")) patch.score=finiteNumber(req.body.score,"Nota",{min:0,max:100});
  if(Object.prototype.hasOwnProperty.call(req.body||{},"max_score")) patch.max_score=finiteNumber(req.body.max_score,"Nota máxima",{min:0.01,max:100});
  if(Object.prototype.hasOwnProperty.call(req.body||{},"checklist")) patch.checklist=JSON.stringify(normalizeChecklist(req.body.checklist));
  if(Object.prototype.hasOwnProperty.call(req.body||{},"notes")) patch.notes=trimOrNull(req.body.notes);
  if(Object.prototype.hasOwnProperty.call(req.body||{},"evaluation_date")) patch.evaluation_date=mysqlDateOrNull(req.body.evaluation_date,"Data da avaliação");
  if(!Object.keys(patch).length) throw badRequest("Nenhum campo para atualizar");

  await withTransaction(async (connection) => {
    const [rows]=await connection.execute(`SELECT * FROM practical_evaluations WHERE id=? LIMIT 1 FOR UPDATE`,[req.params.id]);
    const current=rows[0];
    if(!current) throw notFound("Avaliação não encontrada");

    const effectiveMax=Number(patch.max_score ?? current.max_score ?? 10);
    const effectiveScore=Number(patch.score ?? current.score ?? 0);
    if(effectiveScore>effectiveMax) throw badRequest("A nota não pode ser maior que a nota máxima");

    if(Object.prototype.hasOwnProperty.call(patch,"status")) {
      patch.completed_at = patch.status === "Concluída" ? (current.completed_at || new Date()) : null;
    }
    patch.evaluator_id=req.user.id;
    patch.evaluator_name=req.user.nome;

    const fields=Object.keys(patch);
    await connection.execute(`UPDATE practical_evaluations SET ${fields.map(f=>`${f} = ?`).join(", ")}, updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[...fields.map(f=>patch[f]),req.params.id]);
    await audit(req.user.id,"UPDATE","practical_evaluations",req.params.id,{changed:fields,evaluator_derived_server_side:true,atomic:true},connection);
  });
  res.status(204).end();
}));
operationsRouter.delete("/practical-evaluations/:id", requireAdmin, asyncHandler(async(req,res)=>{
  await withTransaction(async (connection) => {
    const [rows]=await connection.execute(`SELECT id FROM practical_evaluations WHERE id=? LIMIT 1 FOR UPDATE`,[req.params.id]);
    if(!rows.length) throw notFound("Avaliação não encontrada");
    await connection.execute(`DELETE FROM practical_evaluations WHERE id=?`,[req.params.id]);
    await audit(req.user.id,"DELETE","practical_evaluations",req.params.id,{atomic:true},connection);
  });
  res.status(204).end();
}));

operationsRouter.get("/practical-templates", requireAdmin, asyncHandler(async(_req,res)=>{const rows=await query(`SELECT * FROM practical_eval_templates ORDER BY title`);res.json(rows.map(templateRow));}));
operationsRouter.post("/practical-templates", requireAdmin, asyncHandler(async(req,res)=>{
  const input=practicalTemplateInput(req.body);
  const id=uuid();
  const row=await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO practical_eval_templates (id,title,platform,description,target_sector,min_approval_score,recurrence,applications_per_month,tasks,status,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [id,input.title,input.platform,input.description,input.target_sector,input.min_approval_score,input.recurrence,input.applications_per_month,input.tasks,input.status,req.user.id],
    );
    const [rows]=await connection.execute(`SELECT * FROM practical_eval_templates WHERE id=? LIMIT 1`,[id]);
    await audit(req.user.id,"INSERT","practical_eval_templates",id,{title:input.title,target_sector:input.target_sector,recurrence:input.recurrence,atomic:true},connection);
    return rows[0];
  });
  res.status(201).json(templateRow(row));
}));
operationsRouter.patch("/practical-templates/:id", requireAdmin, asyncHandler(async(req,res)=>{
  const patch=practicalTemplateInput(req.body,{partial:true});
  const fields=Object.keys(patch);
  const row=await withTransaction(async (connection) => {
    const [locked]=await connection.execute(`SELECT id FROM practical_eval_templates WHERE id=? LIMIT 1 FOR UPDATE`,[req.params.id]);
    if(!locked.length) throw notFound("Modelo não encontrado");
    await connection.execute(`UPDATE practical_eval_templates SET ${fields.map(f=>`${f} = ?`).join(", ")}, updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[...fields.map(f=>patch[f]),req.params.id]);
    const [rows]=await connection.execute(`SELECT * FROM practical_eval_templates WHERE id=? LIMIT 1`,[req.params.id]);
    await audit(req.user.id,"UPDATE","practical_eval_templates",req.params.id,{changed:fields,atomic:true},connection);
    return rows[0];
  });
  res.json(templateRow(row));
}));
operationsRouter.delete("/practical-templates/:id", requireAdmin, asyncHandler(async(req,res)=>{
  await withTransaction(async (connection) => {
    const [rows]=await connection.execute(`SELECT id FROM practical_eval_templates WHERE id=? LIMIT 1 FOR UPDATE`,[req.params.id]);
    if(!rows.length) throw notFound("Modelo não encontrado");
    await connection.execute(`DELETE FROM practical_eval_templates WHERE id=?`,[req.params.id]);
    await audit(req.user.id,"DELETE","practical_eval_templates",req.params.id,{atomic:true},connection);
  });
  res.status(204).end();
}));

operationsRouter.get("/audit", requireAdmin, asyncHandler(async(req,res)=>{
  const rawLimit = req.query.limit;
  const parsedLimit = rawLimit === undefined ? 200 : Number(rawLimit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
    throw badRequest("Limite de auditoria inválido; use um inteiro entre 1 e 500");
  }
  const rows=await query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ${parsedLimit}`);
  res.json(rows.map(row=>({...row,details:jsonValue(row.details,{})})));
}));