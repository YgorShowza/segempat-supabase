import path from "node:path";
import { Router } from "express";
import { storage } from "../storage.js";
import { query, queryOne, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAuth } from "../session.js";
import {
  HttpError,
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  notFound,
  requireOneOf,
  requireText,
  trimOrNull,
  uuid,
} from "../util.js";

export const inspectorProductionRouter = Router();

const CATEGORIES = [
  "Inspeção",
  "Fiscalização",
  "Documentação",
  "CFTV / Videomonitoramento",
  "Controle de Acesso",
  "Relatório",
  "Treinamento / Orientação",
  "Reunião / Alinhamento",
  "Acompanhamento Operacional",
  "Atendimento / Providência",
  "Outros",
];

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 1_250_000;
const MIN_ATTACHMENT_BYTES = 100;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OPERATIONAL_TIME_ZONE = "America/Maceio";

function operationalDateText(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function validateDateText(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest(`${label} inválida`);
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw badRequest(`${label} inválida`);
  }
  return text;
}

function periodFromRequest(req) {
  const today = operationalDateText();
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const from = req.query?.from ? validateDateText(req.query.from, "Data inicial") : defaultFrom;
  const to = req.query?.to ? validateDateText(req.query.to, "Data final") : today;
  if (from > to) throw badRequest("Data inicial não pode ser posterior à data final");

  const span = Math.floor((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86_400_000);
  if (span > 730) throw badRequest("O período máximo por consulta é de 730 dias");
  return { from, to };
}

function shiftDateText(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousComparablePeriod(from, to) {
  const inclusiveDays = Math.floor((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const previousTo = shiftDateText(from, -1);
  const previousFrom = shiftDateText(previousTo, -(inclusiveDays - 1));
  return { from: previousFrom, to: previousTo, inclusive_days: inclusiveDays };
}

function variation(current, previous) {
  const absolute = current - previous;
  if (previous === 0) {
    return {
      absolute,
      percentage: current === 0 ? 0 : null,
      baseline_available: current === 0,
    };
  }
  return {
    absolute,
    percentage: Number(((absolute / previous) * 100).toFixed(1)),
    baseline_available: true,
  };
}

function textOrNull(value, maxLength = 500) {
  const text = trimOrNull(value);
  return text ? text.slice(0, maxLength) : null;
}

function mapEntry(row) {
  return {
    ...row,
    attachment_count: Number(row?.attachment_count ?? 0),
    is_leader: Number(row?.is_leader ?? 0) === 1,
  };
}

async function currentMember(req, connection = null) {
  if (!req.user?.employeeId) return null;
  const sql = `
    SELECT m.employee_id,m.is_leader,m.active,m.display_order,
           e.full_name,e.matricula,e.sector,e.status
      FROM inspector_production_members m
      JOIN employees e ON e.id = m.employee_id
     WHERE m.employee_id = ?
     LIMIT 1`;
  if (connection) {
    const [rows] = await connection.execute(sql, [req.user.employeeId]);
    return rows[0] ?? null;
  }
  return queryOne(sql, [req.user.employeeId]);
}

function assertActiveMember(member) {
  if (!member || Number(member.active) !== 1 || member.status !== "Ativo") {
    throw forbidden("Sua conta ainda não está configurada como integrante ativo da Inspetoria neste módulo");
  }
}

function canMaintainEntry(req, entry, member) {
  return Boolean(
    req.user?.isMaster ||
    entry?.executor_user_id === req.user?.id ||
    (member && Number(member.active) === 1 && Number(member.is_leader) === 1)
  );
}

function decodeAttachment(body) {
  const dataUrl = requireText(body?.data_url, "Imagem");
  const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw badRequest("A evidência deve ser uma imagem PNG ou JPEG");
  const kind = match[1].toLowerCase() === "png" ? "png" : "jpg";
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < MIN_ATTACHMENT_BYTES || bytes.length > MAX_ATTACHMENT_BYTES) {
    throw badRequest("A evidência deve possuir entre 100 bytes e 1,25 MB");
  }

  if (kind === "png") {
    if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw badRequest("O conteúdo enviado não é um PNG válido");
    }
  } else if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    throw badRequest("O conteúdo enviado não é um JPEG válido");
  }

  return {
    bytes,
    extension: kind,
    mimeType: kind === "png" ? "image/png" : "image/jpeg",
  };
}

inspectorProductionRouter.get(
  "/membership",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [member, members] = await Promise.all([
      currentMember(req),
      query(`
        SELECT m.employee_id,m.is_leader,m.active,m.display_order,e.full_name,e.matricula,e.sector,e.status
          FROM inspector_production_members m
          JOIN employees e ON e.id = m.employee_id
         WHERE m.active = 1
         ORDER BY m.display_order ASC, m.is_leader DESC, e.full_name ASC`),
    ]);

    res.json({
      current_member: member
        ? { ...member, is_leader: Number(member.is_leader) === 1, active: Number(member.active) === 1 }
        : null,
      members: members.map((row) => ({
        ...row,
        is_leader: Number(row.is_leader) === 1,
        active: Number(row.active) === 1,
      })),
      categories: CATEGORIES,
    });
  }),
);

inspectorProductionRouter.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { from, to } = periodFromRequest(req);
    const previousPeriod = previousComparablePeriod(from, to);

    const [rankingRows, previousRankingRows, categoryRows, timelineRows, recentRows, canceledRow] = await Promise.all([
      query(
        `SELECT m.employee_id,e.full_name,e.matricula,m.is_leader,m.display_order,
                COUNT(p.id) FILTER (WHERE p.status = 'Registrada') AS total,
                COUNT(p.id) FILTER (
                  WHERE p.status = 'Registrada'
                    AND EXISTS (SELECT 1 FROM inspector_production_attachments a WHERE a.entry_id = p.id)
                ) AS with_evidence,
                MAX(p.executed_at) FILTER (WHERE p.status = 'Registrada') AS last_execution_at
           FROM inspector_production_members m
           JOIN employees e ON e.id = m.employee_id
           LEFT JOIN inspector_production_entries p
             ON p.executor_employee_id = m.employee_id
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)
          WHERE m.active = 1
          GROUP BY m.employee_id,e.full_name,e.matricula,m.is_leader,m.display_order
          ORDER BY m.display_order ASC,m.is_leader DESC,e.full_name ASC`,
        [from, to],
      ),
      query(
        `SELECT m.employee_id,e.full_name,e.matricula,m.is_leader,m.display_order,
                COUNT(p.id) FILTER (WHERE p.status = 'Registrada') AS total
           FROM inspector_production_members m
           JOIN employees e ON e.id = m.employee_id
           LEFT JOIN inspector_production_entries p
             ON p.executor_employee_id = m.employee_id
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)
          WHERE m.active = 1
          GROUP BY m.employee_id,e.full_name,e.matricula,m.is_leader,m.display_order
          ORDER BY m.display_order ASC,m.is_leader DESC,e.full_name ASC`,
        [previousPeriod.from, previousPeriod.to],
      ),
      query(
        `SELECT category,COUNT(*) AS total
           FROM inspector_production_entries
          WHERE status = 'Registrada'
            AND (executed_at AT TIME ZONE 'America/Maceio')::date BETWEEN CAST(? AS date) AND CAST(? AS date)
          GROUP BY category
          ORDER BY total DESC,category ASC`,
        [from, to],
      ),
      query(
        `SELECT TO_CHAR((executed_at AT TIME ZONE 'America/Maceio')::date,'YYYY-MM-DD') AS day,
                executor_employee_id,executor_name,COUNT(*) AS total
           FROM inspector_production_entries
          WHERE status = 'Registrada'
            AND (executed_at AT TIME ZONE 'America/Maceio')::date BETWEEN CAST(? AS date) AND CAST(? AS date)
          GROUP BY day,executor_employee_id,executor_name
          ORDER BY day ASC,executor_name ASC`,
        [from, to],
      ),
      query(
        `SELECT p.*,
                m.is_leader,
                (SELECT COUNT(*) FROM inspector_production_attachments a WHERE a.entry_id = p.id) AS attachment_count
           FROM inspector_production_entries p
           LEFT JOIN inspector_production_members m ON m.employee_id = p.executor_employee_id
          WHERE (p.executed_at AT TIME ZONE 'America/Maceio')::date BETWEEN CAST(? AS date) AND CAST(? AS date)
          ORDER BY p.executed_at DESC,p.created_at DESC
          LIMIT 8`,
        [from, to],
      ),
      queryOne(
        `SELECT COUNT(*) AS total
           FROM inspector_production_entries
          WHERE status = 'Cancelada'
            AND (executed_at AT TIME ZONE 'America/Maceio')::date BETWEEN CAST(? AS date) AND CAST(? AS date)`,
        [from, to],
      ),
    ]);

    const previousByEmployee = new Map(
      previousRankingRows.map((row) => [row.employee_id, Number(row.total ?? 0)]),
    );

    const ranking = rankingRows
      .map((row) => {
        const total = Number(row.total ?? 0);
        const previousTotal = previousByEmployee.get(row.employee_id) ?? 0;
        const comparison = variation(total, previousTotal);
        return {
          employee_id: row.employee_id,
          name: row.full_name,
          matricula: row.matricula,
          is_leader: Number(row.is_leader) === 1,
          display_order: Number(row.display_order ?? 0),
          total,
          previous_total: previousTotal,
          absolute_change: comparison.absolute,
          percentage_change: comparison.percentage,
          comparison_baseline_available: comparison.baseline_available,
          with_evidence: Number(row.with_evidence ?? 0),
          without_evidence: Math.max(0, total - Number(row.with_evidence ?? 0)),
          evidence_rate: total > 0
            ? Number(((Number(row.with_evidence ?? 0) / total) * 100).toFixed(1))
            : 0,
          last_execution_at: row.last_execution_at ?? null,
        };
      })
      .sort((a, b) => b.total - a.total || a.display_order - b.display_order || a.name.localeCompare(b.name, "pt-BR"));

    const total = ranking.reduce((sum, row) => sum + row.total, 0);
    const previousTotal = ranking.reduce((sum, row) => sum + row.previous_total, 0);
    const totalVariation = variation(total, previousTotal);
    const withEvidence = ranking.reduce((sum, row) => sum + row.with_evidence, 0);
    const withoutEvidence = Math.max(0, total - withEvidence);
    const members = ranking.length;
    const rankingWithShare = ranking.map((row, index) => ({
      ...row,
      rank: index + 1,
      share: total > 0 ? Number(((row.total / total) * 100).toFixed(1)) : 0,
    }));

    res.json({
      period: { from, to },
      previous_period: previousPeriod,
      comparison: {
        current_total: total,
        previous_total: previousTotal,
        absolute_change: totalVariation.absolute,
        percentage_change: totalVariation.percentage,
        baseline_available: totalVariation.baseline_available,
      },
      generated_at: new Date().toISOString(),
      totals: {
        executions: total,
        configured_inspectors: members,
        participating_inspectors: ranking.filter((row) => row.total > 0).length,
        average_per_inspector: members > 0 ? Number((total / members).toFixed(1)) : 0,
        with_evidence: withEvidence,
        without_evidence: withoutEvidence,
        evidence_rate: total > 0 ? Number(((withEvidence / total) * 100).toFixed(1)) : 0,
        without_evidence_rate: total > 0 ? Number(((withoutEvidence / total) * 100).toFixed(1)) : 0,
        canceled: Number(canceledRow?.total ?? 0),
      },
      ranking: rankingWithShare,
      categories: categoryRows.map((row) => ({
        category: row.category,
        total: Number(row.total ?? 0),
        share: total > 0 ? Number(((Number(row.total ?? 0) / total) * 100).toFixed(1)) : 0,
      })),
      timeline: timelineRows.map((row) => ({ ...row, total: Number(row.total ?? 0) })),
      recent: recentRows.map(mapEntry),
    });
  }),
);

inspectorProductionRouter.get(
  "/inspectors/:employeeId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { from, to } = periodFromRequest(req);
    const previousPeriod = previousComparablePeriod(from, to);
    const employeeId = String(req.params.employeeId || "").trim();

    const member = await queryOne(
      `SELECT m.employee_id,m.is_leader,m.active,m.display_order,
              e.full_name,e.matricula,e.sector,e.status
         FROM inspector_production_members m
         JOIN employees e ON e.id = m.employee_id
        WHERE m.employee_id = ?
        LIMIT 1`,
      [employeeId],
    );
    if (!member) throw notFound("Inspetor não configurado neste módulo");

    const [currentRow, previousRow, teamRow, categoryRows, timelineRows, recentRows] = await Promise.all([
      queryOne(
        `SELECT
            COUNT(*) FILTER (WHERE p.status = 'Registrada') AS total,
            COUNT(*) FILTER (
              WHERE p.status = 'Registrada'
                AND EXISTS (SELECT 1 FROM inspector_production_attachments a WHERE a.entry_id = p.id)
            ) AS with_evidence,
            COUNT(*) FILTER (WHERE p.status = 'Cancelada') AS canceled,
            MAX(p.executed_at) FILTER (WHERE p.status = 'Registrada') AS last_execution_at
           FROM inspector_production_entries p
          WHERE p.executor_employee_id = ?
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)`,
        [employeeId, from, to],
      ),
      queryOne(
        `SELECT COUNT(*) FILTER (WHERE p.status = 'Registrada') AS total
           FROM inspector_production_entries p
          WHERE p.executor_employee_id = ?
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)`,
        [employeeId, previousPeriod.from, previousPeriod.to],
      ),
      queryOne(
        `SELECT COUNT(*) AS total
           FROM inspector_production_entries p
          WHERE p.status = 'Registrada'
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)`,
        [from, to],
      ),
      query(
        `SELECT p.category,COUNT(*) AS total
           FROM inspector_production_entries p
          WHERE p.executor_employee_id = ?
            AND p.status = 'Registrada'
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)
          GROUP BY p.category
          ORDER BY total DESC,p.category ASC`,
        [employeeId, from, to],
      ),
      query(
        `SELECT TO_CHAR((p.executed_at AT TIME ZONE 'America/Maceio')::date,'YYYY-MM-DD') AS day,
                COUNT(*) AS total
           FROM inspector_production_entries p
          WHERE p.executor_employee_id = ?
            AND p.status = 'Registrada'
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)
          GROUP BY day
          ORDER BY day ASC`,
        [employeeId, from, to],
      ),
      query(
        `SELECT p.*,
                m.is_leader,
                (SELECT COUNT(*) FROM inspector_production_attachments a WHERE a.entry_id = p.id) AS attachment_count
           FROM inspector_production_entries p
           LEFT JOIN inspector_production_members m ON m.employee_id = p.executor_employee_id
          WHERE p.executor_employee_id = ?
            AND (p.executed_at AT TIME ZONE 'America/Maceio')::date
                BETWEEN CAST(? AS date) AND CAST(? AS date)
          ORDER BY p.executed_at DESC,p.created_at DESC
          LIMIT 8`,
        [employeeId, from, to],
      ),
    ]);

    const total = Number(currentRow?.total ?? 0);
    const previousTotal = Number(previousRow?.total ?? 0);
    const withEvidence = Number(currentRow?.with_evidence ?? 0);
    const withoutEvidence = Math.max(0, total - withEvidence);
    const teamTotal = Number(teamRow?.total ?? 0);
    const compare = variation(total, previousTotal);

    res.json({
      member: {
        employee_id: member.employee_id,
        full_name: member.full_name,
        matricula: member.matricula,
        sector: member.sector,
        status: member.status,
        is_leader: Number(member.is_leader) === 1,
        active: Number(member.active) === 1,
        display_order: Number(member.display_order ?? 0),
      },
      period: { from, to },
      previous_period: previousPeriod,
      metrics: {
        executions: total,
        previous_executions: previousTotal,
        absolute_change: compare.absolute,
        percentage_change: compare.percentage,
        comparison_baseline_available: compare.baseline_available,
        participation_share: teamTotal > 0 ? Number(((total / teamTotal) * 100).toFixed(1)) : 0,
        with_evidence: withEvidence,
        without_evidence: withoutEvidence,
        evidence_rate: total > 0 ? Number(((withEvidence / total) * 100).toFixed(1)) : 0,
        canceled: Number(currentRow?.canceled ?? 0),
        last_execution_at: currentRow?.last_execution_at ?? null,
      },
      categories: categoryRows.map((row) => ({
        category: row.category,
        total: Number(row.total ?? 0),
        share: total > 0 ? Number(((Number(row.total ?? 0) / total) * 100).toFixed(1)) : 0,
      })),
      timeline: timelineRows.map((row) => ({
        day: row.day,
        total: Number(row.total ?? 0),
      })),
      recent: recentRows.map(mapEntry),
    });
  }),
);

inspectorProductionRouter.get(
  "/entries",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { from, to } = periodFromRequest(req);
    const conditions = [
      "(p.executed_at AT TIME ZONE 'America/Maceio')::date BETWEEN CAST(? AS date) AND CAST(? AS date)",
    ];
    const params = [from, to];

    const employeeId = trimOrNull(req.query?.employee_id);
    const category = trimOrNull(req.query?.category);
    const status = trimOrNull(req.query?.status);
    const evidence = trimOrNull(req.query?.evidence);
    const search = trimOrNull(req.query?.search);

    if (employeeId) {
      conditions.push("p.executor_employee_id = ?");
      params.push(employeeId);
    }
    if (category) {
      conditions.push("p.category = ?");
      params.push(category);
    }
    if (status) {
      if (!["Registrada", "Cancelada"].includes(status)) throw badRequest("Situação inválida");
      conditions.push("p.status = ?");
      params.push(status);
    }
    if (evidence) {
      if (!["with", "without"].includes(evidence)) throw badRequest("Filtro de evidência inválido");
      conditions.push(
        evidence === "with"
          ? "EXISTS (SELECT 1 FROM inspector_production_attachments a WHERE a.entry_id = p.id)"
          : "NOT EXISTS (SELECT 1 FROM inspector_production_attachments a WHERE a.entry_id = p.id)",
      );
    }
    if (search) {
      const needle = `%${search.toLowerCase().slice(0, 120)}%`;
      conditions.push("(LOWER(p.title) LIKE ? OR LOWER(p.details) LIKE ? OR LOWER(COALESCE(p.location,'')) LIKE ? OR LOWER(p.executor_name) LIKE ?)");
      params.push(needle, needle, needle, needle);
    }

    const requestedLimit = Number(req.query?.limit ?? 100);
    const requestedOffset = Number(req.query?.offset ?? 0);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
    const offset = Number.isInteger(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

    const countRow = await queryOne(
      `SELECT COUNT(*) AS total
         FROM inspector_production_entries p
        WHERE ${conditions.join(" AND ")}`,
      params,
    );
    const total = Number(countRow?.total ?? 0);
    const rows = await query(
      `SELECT p.*,m.is_leader,
              (SELECT COUNT(*) FROM inspector_production_attachments a WHERE a.entry_id = p.id) AS attachment_count
         FROM inspector_production_entries p
         LEFT JOIN inspector_production_members m ON m.employee_id = p.executor_employee_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY p.executed_at DESC,p.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json({
      items: rows.map(mapEntry),
      total,
      next_offset: offset + rows.length < total ? offset + rows.length : null,
    });
  }),
);

inspectorProductionRouter.get(
  "/suggestions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = trimOrNull(req.query?.q);
    const params = [];
    let where = "WHERE status = 'Registrada'";
    if (q) {
      where += " AND LOWER(title) LIKE ?";
      params.push(`%${q.toLowerCase().slice(0, 80)}%`);
    }
    const rows = await query(
      `SELECT title,category,COUNT(*) AS frequency,MAX(executed_at) AS last_used
         FROM inspector_production_entries
         ${where}
        GROUP BY title,category
        ORDER BY frequency DESC,last_used DESC
        LIMIT 12`,
      params,
    );
    res.json(rows.map((row) => ({ ...row, frequency: Number(row.frequency ?? 0) })));
  }),
);

inspectorProductionRouter.get(
  "/entries/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entry = await queryOne(
      `SELECT p.*,m.is_leader,
              (SELECT COUNT(*) FROM inspector_production_attachments a WHERE a.entry_id = p.id) AS attachment_count
         FROM inspector_production_entries p
         LEFT JOIN inspector_production_members m ON m.employee_id = p.executor_employee_id
        WHERE p.id = ?
        LIMIT 1`,
      [req.params.id],
    );
    if (!entry) throw notFound("Registro de produção não encontrado");

    const attachments = await query(
      `SELECT id,entry_id,original_name,mime_type,size_bytes,caption,uploaded_by,uploaded_by_name,created_at
         FROM inspector_production_attachments
        WHERE entry_id = ?
        ORDER BY created_at ASC`,
      [entry.id],
    );
    res.json({ ...mapEntry(entry), attachments });
  }),
);

inspectorProductionRouter.post(
  "/entries",
  requireAuth,
  asyncHandler(async (req, res) => {
    const title = requireText(req.body?.title, "Atribuição realizada").slice(0, 255);
    const category = requireOneOf(req.body?.category, CATEGORIES, "Categoria", "Outros");
    const details = requireText(req.body?.details, "Descrição/resultado").slice(0, 10000);
    const location = textOrNull(req.body?.location, 255);
    const id = uuid();

    let responseEntry = null;
    await withTransaction(async (connection) => {
      const member = await currentMember(req, connection);
      assertActiveMember(member);

      const [employees] = await connection.execute(
        `SELECT id,full_name,matricula,status,access_profile
           FROM employees
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [req.user.employeeId],
      );
      const employee = employees[0];
      if (!employee || employee.status !== "Ativo") throw forbidden("Cadastro funcional não está ativo");

      const [duplicates] = await connection.execute(
        `SELECT id,executed_at
           FROM inspector_production_entries
          WHERE executor_employee_id = ?
            AND status = 'Registrada'
            AND LOWER(TRIM(title)) = LOWER(TRIM(?))
            AND LOWER(TRIM(category)) = LOWER(TRIM(?))
            AND executed_at >= CURRENT_TIMESTAMP - INTERVAL '3 minutes'
          ORDER BY executed_at DESC
          LIMIT 1`,
        [employee.id, title, category],
      );
      if (duplicates.length) {
        throw new HttpError(
          409,
          "Já existe um registro idêntico feito por você nos últimos 3 minutos. Confira o histórico antes de registrar novamente.",
          "POSSIBLE_DUPLICATE",
          { existing_id: duplicates[0].id },
        );
      }

      await connection.execute(
        `INSERT INTO inspector_production_entries
         (id,executor_employee_id,executor_user_id,executor_name,executor_matricula,title,category,details,location,status,executed_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'Registrada',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
        [id, employee.id, req.user.id, employee.full_name, employee.matricula, title, category, details, location],
      );
      await audit(req.user.id, "INSPECTOR_PRODUCTION_CREATE", "inspector_production_entries", id, {
        executor_employee_id: employee.id,
        executor_matricula: employee.matricula,
        category,
        title,
        identity_derived_server_side: true,
        execution_time_derived_server_side: true,
        immutable_record: true,
        atomic: true,
      }, connection);
      const [createdRows] = await connection.execute(
        `SELECT *,0 AS attachment_count FROM inspector_production_entries WHERE id = ? LIMIT 1`,
        [id],
      );
      responseEntry = createdRows[0];
    });

    res.status(201).json(mapEntry(responseEntry));
  }),
);

inspectorProductionRouter.post(
  "/entries/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const reason = requireText(req.body?.reason, "Motivo do cancelamento").slice(0, 500);
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM inspector_production_entries WHERE id = ? LIMIT 1 FOR UPDATE`,
        [req.params.id],
      );
      const entry = rows[0];
      if (!entry) throw notFound("Registro de produção não encontrado");
      if (entry.status === "Cancelada") throw conflict("Este registro já está cancelado");

      const member = await currentMember(req, connection);
      if (!canMaintainEntry(req, entry, member)) {
        throw forbidden("Somente o próprio executor, o líder configurado ou o Administrador Master pode cancelar este registro");
      }

      await connection.execute(
        `UPDATE inspector_production_entries
            SET status = 'Cancelada',
                canceled_at = CURRENT_TIMESTAMP(3),
                canceled_by = ?,
                canceled_by_name = ?,
                canceled_reason = ?,
                updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = ?`,
        [req.user.id, req.user.nome, reason, entry.id],
      );
      await audit(req.user.id, "INSPECTOR_PRODUCTION_CANCEL", "inspector_production_entries", entry.id, {
        executor_user_id: entry.executor_user_id,
        executor_employee_id: entry.executor_employee_id,
        reason,
        historical_record_preserved: true,
        atomic: true,
      }, connection);
    });
    res.status(204).end();
  }),
);

inspectorProductionRouter.post(
  "/entries/:id/attachments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entry = await queryOne(`SELECT * FROM inspector_production_entries WHERE id = ? LIMIT 1`, [req.params.id]);
    if (!entry) throw notFound("Registro de produção não encontrado");
    if (entry.status !== "Registrada") throw conflict("Registro cancelado não recebe novas evidências");

    const member = await currentMember(req);
    if (!canMaintainEntry(req, entry, member)) {
      throw forbidden("Somente o executor, o líder configurado ou o Administrador Master pode anexar evidências");
    }

    const currentCount = await queryOne(
      `SELECT COUNT(*) AS total FROM inspector_production_attachments WHERE entry_id = ?`,
      [entry.id],
    );
    if (Number(currentCount?.total ?? 0) >= MAX_ATTACHMENTS) {
      throw conflict(`O registro já atingiu o limite de ${MAX_ATTACHMENTS} evidências`);
    }

    const decoded = decodeAttachment(req.body);
    const attachmentId = uuid();
    const originalName = (trimOrNull(req.body?.original_name) || `evidencia.${decoded.extension}`)
      .replace(/[\r\n]/g, " ")
      .slice(0, 255);
    const caption = textOrNull(req.body?.caption, 500);
    const relativePath = path.posix.join("inspector-production-evidence", entry.id, `${attachmentId}.${decoded.extension}`);

    await storage.putPrivate(relativePath, decoded.bytes, { contentType: decoded.mimeType });
    try {
      await withTransaction(async (connection) => {
        const [lockedRows] = await connection.execute(
          `SELECT * FROM inspector_production_entries WHERE id = ? LIMIT 1 FOR UPDATE`,
          [entry.id],
        );
        const locked = lockedRows[0];
        if (!locked) throw notFound("Registro de produção não encontrado");
        if (locked.status !== "Registrada") throw conflict("Registro cancelado não recebe novas evidências");

        const lockedMember = await currentMember(req, connection);
        if (!canMaintainEntry(req, locked, lockedMember)) {
          throw forbidden("Você não possui permissão para anexar evidências a este registro");
        }

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) AS total FROM inspector_production_attachments WHERE entry_id = ?`,
          [locked.id],
        );
        if (Number(countRows[0]?.total ?? 0) >= MAX_ATTACHMENTS) throw conflict(`Limite de ${MAX_ATTACHMENTS} evidências atingido`);

        await connection.execute(
          `INSERT INTO inspector_production_attachments
           (id,entry_id,storage_path,original_name,mime_type,size_bytes,caption,uploaded_by,uploaded_by_name,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))`,
          [attachmentId, locked.id, relativePath, originalName, decoded.mimeType, decoded.bytes.length, caption, req.user.id, req.user.nome],
        );
        await audit(req.user.id, "INSPECTOR_PRODUCTION_EVIDENCE_ADD", "inspector_production_entries", locked.id, {
          attachment_id: attachmentId,
          mime_type: decoded.mimeType,
          size_bytes: decoded.bytes.length,
          original_name: originalName,
          private_storage: true,
          immutable_evidence: true,
          atomic: true,
        }, connection);
      });
    } catch (error) {
      await storage.deletePrivate(relativePath).catch(() => {});
      throw error;
    }

    res.status(201).json({ id: attachmentId });
  }),
);

inspectorProductionRouter.get(
  "/entries/:id/attachments/:attachmentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const attachment = await queryOne(
      `SELECT a.*,p.status
         FROM inspector_production_attachments a
         JOIN inspector_production_entries p ON p.id = a.entry_id
        WHERE a.id = ? AND a.entry_id = ?
        LIMIT 1`,
      [req.params.attachmentId, req.params.id],
    );
    if (!attachment) throw notFound("Evidência não encontrada");
    if (!new Set(["image/png", "image/jpeg"]).has(String(attachment.mime_type))) throw notFound("Evidência inválida");

    const requested = String(attachment.storage_path || "");
    if (!requested.startsWith(`inspector-production-evidence/${req.params.id}/`) || requested.includes("..")) {
      throw badRequest("Caminho de evidência inválido");
    }

    try {
      const bytes = await storage.getPrivate(requested);
      const validPng = bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
      const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if ((attachment.mime_type === "image/png" && !validPng) || (attachment.mime_type === "image/jpeg" && !validJpeg)) {
        throw notFound("Evidência não encontrada");
      }
      res.setHeader("Content-Type", attachment.mime_type);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Content-Disposition", `inline; filename=evidencia.${attachment.mime_type === "image/png" ? "png" : "jpg"}`);
      res.send(bytes);
    } catch (error) {
      if (error?.code === "STORAGE_NOT_FOUND") throw notFound("Evidência não encontrada");
      throw error;
    }
  }),
);
