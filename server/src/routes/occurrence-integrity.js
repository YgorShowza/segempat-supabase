import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { query, queryOne, withTransaction } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin, requireAuth } from "../session.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  notFound,
  parseJson,
  requireOneOf,
  requireText,
  trimOrNull,
  uuid,
} from "../util.js";

export const occurrenceIntegrityRouter = Router();

const SEVERITIES = ["Baixa", "Média", "Alta", "Crítica"];
const OCCURRENCE_STATUS = ["Aberta", "Em análise", "Concluída"];
const MAX_PEOPLE = 30;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 1_250_000;
const MIN_ATTACHMENT_BYTES = 100;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mysqlDateTimeOrNull(value, label) {
  const text = trimOrNull(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} inválida`);
  return date;
}

function textOrNull(value, maxLength = 5000) {
  const valueText = trimOrNull(value);
  return valueText ? valueText.slice(0, maxLength) : null;
}

function mapOccurrence(row) {
  if (!row) return null;
  return {
    ...row,
    people_involved: parseJson(row.people_involved, []),
    attachment_count: Number(row.attachment_count ?? 0),
    update_count: Number(row.update_count ?? 0),
  };
}

async function occurrenceEmployeeForCreate(req, connection) {
  if (!req.user.isAdmin) {
    const [rows] = await connection.execute(
      `SELECT id,full_name,matricula,status FROM employees WHERE id = ? LIMIT 1 FOR UPDATE`,
      [req.user.employeeId],
    );
    const employee = rows[0];
    if (!employee || employee.status !== "Ativo") {
      throw badRequest("Colaborador autenticado não está disponível para registro");
    }
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
  if (employee.status !== "Ativo") throw badRequest("Colaborador relacionado precisa estar ativo");
  return employee;
}

async function normalizePeople(connection, value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw badRequest("Pessoas envolvidas inválidas");
  if (value.length > MAX_PEOPLE) throw badRequest(`Limite de ${MAX_PEOPLE} pessoas envolvidas excedido`);

  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw badRequest(`Pessoa envolvida ${index + 1} inválida`);
    }
    const employeeId = trimOrNull(item.employee_id);
    const role = (trimOrNull(item.role) || "Envolvido").slice(0, 120);
    const notes = textOrNull(item.notes, 500);

    if (employeeId) {
      const [employees] = await connection.execute(
        `SELECT id,full_name,matricula FROM employees WHERE id = ? LIMIT 1`,
        [employeeId],
      );
      const employee = employees[0];
      if (!employee) throw notFound(`Pessoa envolvida ${index + 1} não foi localizada no cadastro`);
      result.push({
        employee_id: employee.id,
        name: employee.full_name,
        matricula: employee.matricula,
        role,
        notes,
      });
      continue;
    }

    const name = requireText(item.name, `Nome/identificação da pessoa ${index + 1}`).slice(0, 255);
    result.push({ employee_id: null, name, matricula: null, role, notes });
  }
  return result;
}

function canAccessOccurrence(req, occurrence) {
  return Boolean(
    req.user?.isAdmin ||
    occurrence?.created_by === req.user?.id ||
    (occurrence?.employee_id && occurrence.employee_id === req.user?.employeeId)
  );
}

function assertOccurrenceAccess(req, occurrence) {
  if (!occurrence) throw notFound("Ocorrência não encontrada");
  if (!canAccessOccurrence(req, occurrence)) throw forbidden("Ocorrência indisponível para este usuário");
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

occurrenceIntegrityRouter.get(
  "/occurrences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const where = req.user.isAdmin ? "" : "WHERE o.created_by = ? OR o.employee_id = ?";
    const params = req.user.isAdmin ? [] : [req.user.id, req.user.employeeId];
    const rows = await query(
      `SELECT o.*,
              (SELECT COUNT(*) FROM occurrence_attachments a WHERE a.occurrence_id = o.id) AS attachment_count,
              (SELECT COUNT(*) FROM occurrence_updates u WHERE u.occurrence_id = o.id) AS update_count
         FROM occurrences o
         ${where}
        ORDER BY o.occurred_at DESC`,
      params,
    );
    res.json(rows.map(mapOccurrence));
  }),
);

occurrenceIntegrityRouter.get(
  "/occurrences/:id/details",
  requireAuth,
  asyncHandler(async (req, res) => {
    const occurrence = await queryOne(
      `SELECT o.*,
              (SELECT COUNT(*) FROM occurrence_attachments a WHERE a.occurrence_id = o.id) AS attachment_count,
              (SELECT COUNT(*) FROM occurrence_updates u WHERE u.occurrence_id = o.id) AS update_count
         FROM occurrences o
        WHERE o.id = ? LIMIT 1`,
      [req.params.id],
    );
    assertOccurrenceAccess(req, occurrence);

    const [updates, attachments] = await Promise.all([
      query(
        `SELECT id,occurrence_id,note,status_snapshot,created_by,created_by_name,created_at
           FROM occurrence_updates WHERE occurrence_id = ? ORDER BY created_at ASC`,
        [occurrence.id],
      ),
      query(
        `SELECT id,occurrence_id,original_name,mime_type,size_bytes,caption,uploaded_by,uploaded_by_name,created_at
           FROM occurrence_attachments WHERE occurrence_id = ? ORDER BY created_at ASC`,
        [occurrence.id],
      ),
    ]);

    res.json({ ...mapOccurrence(occurrence), updates, attachments });
  }),
);

occurrenceIntegrityRouter.post(
  "/occurrences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = uuid();
    const title = requireText(req.body?.title, "Título").slice(0, 255);
    const category = requireText(req.body?.category || "Operacional", "Categoria").slice(0, 120);
    const severity = requireOneOf(req.body?.severity, SEVERITIES, "Severidade", "Baixa");
    const description = requireText(req.body?.description, "Descrição").slice(0, 20000);
    const occurredAt = mysqlDateTimeOrNull(req.body?.occurred_at, "Data/hora da ocorrência");

    await withTransaction(async (connection) => {
      const employee = await occurrenceEmployeeForCreate(req, connection);
      const people = await normalizePeople(connection, req.body?.people_involved ?? []);
      await connection.execute(
        `INSERT INTO occurrences
         (id,employee_id,employee_name,employee_matricula,title,category,severity,description,
          current_situation,immediate_risk,information_source,actions_taken,support_required,people_involved,
          location,status,occurred_at,resolution_notes,resolved_at,created_by,created_by_name,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Aberta',COALESCE(?,UTC_TIMESTAMP(3)),NULL,NULL,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
        [
          id,
          employee?.id ?? null,
          employee?.full_name ?? null,
          employee?.matricula ?? null,
          title,
          category,
          severity,
          description,
          textOrNull(req.body?.current_situation, 10000),
          textOrNull(req.body?.immediate_risk, 10000),
          textOrNull(req.body?.information_source, 255),
          textOrNull(req.body?.actions_taken, 10000),
          textOrNull(req.body?.support_required, 10000),
          JSON.stringify(people),
          textOrNull(req.body?.location, 255),
          occurredAt,
          req.user.id,
          req.user.nome,
        ],
      );
      await audit(req.user.id, "INSERT", "occurrences", id, {
        title,
        severity,
        category,
        employee_id: employee?.id ?? null,
        people_count: people.length,
        complete_operational_record: true,
        identity_derived_server_side: true,
        atomic: true,
      }, connection);
    });

    res.status(201).json({ id });
  }),
);

occurrenceIntegrityRouter.patch(
  "/occurrences/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(`SELECT * FROM occurrences WHERE id = ? LIMIT 1 FOR UPDATE`, [req.params.id]);
      const current = rows[0];
      if (!current) throw notFound("Ocorrência não encontrada");
      if (current.status === "Concluída") {
        throw conflict("Ocorrência concluída pertence ao histórico operacional e não pode ser alterada");
      }

      const patch = {};
      const has = (key) => Object.prototype.hasOwnProperty.call(req.body ?? {}, key);
      if (has("title")) patch.title = requireText(req.body.title, "Título").slice(0, 255);
      if (has("category")) patch.category = requireText(req.body.category, "Categoria").slice(0, 120);
      if (has("description")) patch.description = requireText(req.body.description, "Descrição").slice(0, 20000);
      if (has("location")) patch.location = textOrNull(req.body.location, 255);
      if (has("current_situation")) patch.current_situation = textOrNull(req.body.current_situation, 10000);
      if (has("immediate_risk")) patch.immediate_risk = textOrNull(req.body.immediate_risk, 10000);
      if (has("information_source")) patch.information_source = textOrNull(req.body.information_source, 255);
      if (has("actions_taken")) patch.actions_taken = textOrNull(req.body.actions_taken, 10000);
      if (has("support_required")) patch.support_required = textOrNull(req.body.support_required, 10000);
      if (has("people_involved")) patch.people_involved = JSON.stringify(await normalizePeople(connection, req.body.people_involved));
      if (has("resolution_notes")) patch.resolution_notes = textOrNull(req.body.resolution_notes, 10000);
      if (has("severity")) patch.severity = requireOneOf(req.body.severity, SEVERITIES, "Severidade");
      if (has("status")) patch.status = requireOneOf(req.body.status, OCCURRENCE_STATUS, "Situação");
      if (has("occurred_at")) patch.occurred_at = mysqlDateTimeOrNull(req.body.occurred_at, "Data/hora da ocorrência");

      const employeeChangeRequested = has("employee_id");
      if (employeeChangeRequested) {
        const employeeId = trimOrNull(req.body.employee_id);
        if (!employeeId) {
          patch.employee_id = null;
          patch.employee_name = null;
          patch.employee_matricula = null;
        } else {
          const [employees] = await connection.execute(
            `SELECT id,full_name,matricula,status FROM employees WHERE id = ? LIMIT 1 FOR UPDATE`,
            [employeeId],
          );
          const employee = employees[0];
          if (!employee) throw notFound("Colaborador relacionado não encontrado");
          if (employee.status !== "Ativo") throw badRequest("Colaborador relacionado precisa estar ativo");
          patch.employee_id = employee.id;
          patch.employee_name = employee.full_name;
          patch.employee_matricula = employee.matricula;
        }
      }

      const effectiveStatus = patch.status ?? current.status;
      const effectiveResolutionNotes = Object.prototype.hasOwnProperty.call(patch, "resolution_notes")
        ? patch.resolution_notes
        : trimOrNull(current.resolution_notes);

      if (effectiveStatus === "Concluída") {
        if (!effectiveResolutionNotes) throw badRequest("Informe as notas de conclusão antes de concluir a ocorrência");
        patch.resolution_notes = effectiveResolutionNotes;
        patch.resolved_at = new Date();
      } else {
        patch.resolved_at = null;
      }

      const fields = Object.keys(patch);
      if (!fields.length) throw badRequest("Nenhum campo para atualizar");
      await connection.execute(
        `UPDATE occurrences SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
        [...fields.map((field) => patch[field]), current.id],
      );
      await audit(req.user.id, "UPDATE", "occurrences", current.id, {
        changed: fields,
        identity_derived_server_side: employeeChangeRequested,
        resolution_required: effectiveStatus === "Concluída",
        resolved_at_server_derived: effectiveStatus === "Concluída",
        completed_history_guard: true,
        complete_operational_record: true,
        atomic: true,
      }, connection);
    });

    res.status(204).end();
  }),
);

occurrenceIntegrityRouter.post(
  "/occurrences/:id/updates",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const note = requireText(req.body?.note, "Atualização").slice(0, 10000);
    const updateId = uuid();
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id,status FROM occurrences WHERE id = ? LIMIT 1 FOR UPDATE`,
        [req.params.id],
      );
      const occurrence = rows[0];
      if (!occurrence) throw notFound("Ocorrência não encontrada");
      if (occurrence.status === "Concluída") throw conflict("Ocorrência concluída não recebe novas atualizações");

      await connection.execute(
        `INSERT INTO occurrence_updates (id,occurrence_id,note,status_snapshot,created_by,created_by_name,created_at)
         VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
        [updateId, occurrence.id, note, occurrence.status, req.user.id, req.user.nome],
      );
      await audit(req.user.id, "OCCURRENCE_UPDATE", "occurrences", occurrence.id, {
        update_id: updateId,
        status_snapshot: occurrence.status,
        atomic: true,
      }, connection);
    });
    res.status(201).json({ id: updateId });
  }),
);

occurrenceIntegrityRouter.post(
  "/occurrences/:id/attachments",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (config.storage.driver !== "filesystem") throw badRequest("Driver de armazenamento ainda não suportado nesta API");
    const occurrence = await queryOne(`SELECT * FROM occurrences WHERE id = ? LIMIT 1`, [req.params.id]);
    assertOccurrenceAccess(req, occurrence);
    if (occurrence.status === "Concluída") throw conflict("Ocorrência concluída não recebe novas evidências");

    const currentCount = await queryOne(
      `SELECT COUNT(*) AS total FROM occurrence_attachments WHERE occurrence_id = ?`,
      [occurrence.id],
    );
    if (Number(currentCount?.total ?? 0) >= MAX_ATTACHMENTS) {
      throw conflict(`A ocorrência já atingiu o limite de ${MAX_ATTACHMENTS} evidências fotográficas`);
    }

    const decoded = decodeAttachment(req.body);
    const attachmentId = uuid();
    const originalName = (trimOrNull(req.body?.original_name) || `evidencia.${decoded.extension}`)
      .replace(/[\r\n]/g, " ")
      .slice(0, 255);
    const caption = textOrNull(req.body?.caption, 500);
    const fileName = `${attachmentId}.${decoded.extension}`;
    const relativePath = path.posix.join("occurrence-evidence", occurrence.id, fileName);
    const storageRoot = path.resolve(config.storage.path);
    const absolutePath = path.resolve(storageRoot, relativePath);
    if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) throw badRequest("Caminho de evidência inválido");

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, decoded.bytes, { mode: 0o600, flag: "wx" });
    try {
      await withTransaction(async (connection) => {
        const [lockedRows] = await connection.execute(
          `SELECT id,status,created_by,employee_id FROM occurrences WHERE id = ? LIMIT 1 FOR UPDATE`,
          [occurrence.id],
        );
        const locked = lockedRows[0];
        assertOccurrenceAccess(req, locked);
        if (locked.status === "Concluída") throw conflict("Ocorrência concluída não recebe novas evidências");
        const [countRows] = await connection.execute(
          `SELECT COUNT(*) AS total FROM occurrence_attachments WHERE occurrence_id = ? FOR UPDATE`,
          [locked.id],
        );
        if (Number(countRows[0]?.total ?? 0) >= MAX_ATTACHMENTS) throw conflict(`Limite de ${MAX_ATTACHMENTS} evidências atingido`);

        await connection.execute(
          `INSERT INTO occurrence_attachments
           (id,occurrence_id,storage_path,original_name,mime_type,size_bytes,caption,uploaded_by,uploaded_by_name,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
          [attachmentId, locked.id, relativePath, originalName, decoded.mimeType, decoded.bytes.length, caption, req.user.id, req.user.nome],
        );
        await audit(req.user.id, "OCCURRENCE_EVIDENCE_ADD", "occurrences", locked.id, {
          attachment_id: attachmentId,
          mime_type: decoded.mimeType,
          size_bytes: decoded.bytes.length,
          original_name: originalName,
          private_storage: true,
          immutable_after_upload: true,
          atomic: true,
        }, connection);
      });
    } catch (error) {
      await fs.rm(absolutePath, { force: true }).catch(() => {});
      throw error;
    }

    res.status(201).json({ id: attachmentId });
  }),
);

occurrenceIntegrityRouter.get(
  "/occurrences/:id/attachments/:attachmentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (config.storage.driver !== "filesystem") throw badRequest("Driver de armazenamento ainda não suportado nesta API");
    const occurrence = await queryOne(`SELECT * FROM occurrences WHERE id = ? LIMIT 1`, [req.params.id]);
    assertOccurrenceAccess(req, occurrence);
    const attachment = await queryOne(
      `SELECT * FROM occurrence_attachments WHERE id = ? AND occurrence_id = ? LIMIT 1`,
      [req.params.attachmentId, occurrence.id],
    );
    if (!attachment) throw notFound("Evidência fotográfica não encontrada");
    if (!new Set(["image/png", "image/jpeg"]).has(String(attachment.mime_type))) throw notFound("Evidência fotográfica inválida");

    const requested = String(attachment.storage_path || "");
    if (!requested.startsWith(`occurrence-evidence/${occurrence.id}/`) || requested.includes("..")) {
      throw badRequest("Caminho de evidência inválido");
    }
    const storageRoot = path.resolve(config.storage.path);
    const candidatePath = path.resolve(storageRoot, requested);
    if (!candidatePath.startsWith(`${storageRoot}${path.sep}`)) throw badRequest("Caminho de evidência inválido");

    try {
      const [storageRootReal, absolutePath] = await Promise.all([fs.realpath(storageRoot), fs.realpath(candidatePath)]);
      if (!absolutePath.startsWith(`${storageRootReal}${path.sep}`)) throw badRequest("Caminho de evidência inválido");
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile() || stat.size < MIN_ATTACHMENT_BYTES || stat.size > MAX_ATTACHMENT_BYTES) throw notFound("Evidência fotográfica não encontrada");
      const bytes = await fs.readFile(absolutePath);
      const validPng = bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
      const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if ((attachment.mime_type === "image/png" && !validPng) || (attachment.mime_type === "image/jpeg" && !validJpeg)) {
        throw notFound("Evidência fotográfica não encontrada");
      }
      res.setHeader("Content-Type", attachment.mime_type);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Content-Disposition", `inline; filename=evidencia.${attachment.mime_type === "image/png" ? "png" : "jpg"}`);
      res.send(bytes);
    } catch (error) {
      if (error?.code === "ENOENT") throw notFound("Evidência fotográfica não encontrada");
      throw error;
    }
  }),
);

occurrenceIntegrityRouter.delete(
  "/occurrences/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id,status,title,employee_id FROM occurrences WHERE id = ? LIMIT 1 FOR UPDATE`,
        [req.params.id],
      );
      const current = rows[0];
      if (!current) throw notFound("Ocorrência não encontrada");
      if (current.status !== "Aberta") {
        throw conflict("Ocorrência em análise ou concluída pertence ao histórico operacional e não pode ser excluída");
      }
      const [evidenceRows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM occurrence_attachments WHERE occurrence_id = ?`,
        [current.id],
      );
      if (Number(evidenceRows[0]?.total ?? 0) > 0) {
        throw conflict("Ocorrência com evidência fotográfica pertence ao registro operacional e não pode ser excluída");
      }
      await connection.execute(`DELETE FROM occurrences WHERE id = ?`, [current.id]);
      await audit(req.user.id, "DELETE", "occurrences", current.id, {
        status: current.status,
        title: current.title,
        employee_id: current.employee_id,
        history_guard: true,
        evidence_guard: true,
        atomic: true,
      }, connection);
    });

    res.status(204).end();
  }),
);
