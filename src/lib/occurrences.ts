import { apiRequest, buildSegempatApiUrl } from "@/lib/backend/api-client";
import { isDemoModeEnabled } from "@/lib/demo-mode";

export interface OccurrencePerson {
  employee_id: string | null;
  name: string;
  matricula: string | null;
  role: string;
  notes: string | null;
}

export interface OccurrenceAttachment {
  id: string;
  occurrence_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  demo_data_url?: string;
}

export interface OccurrenceUpdate {
  id: string;
  occurrence_id: string;
  note: string;
  status_snapshot: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface Occurrence {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_matricula: string | null;
  title: string;
  category: string;
  severity: "Baixa" | "Média" | "Alta" | "Crítica";
  description: string;
  current_situation: string | null;
  immediate_risk: string | null;
  information_source: string | null;
  actions_taken: string | null;
  support_required: string | null;
  people_involved: OccurrencePerson[];
  location: string | null;
  status: "Aberta" | "Em análise" | "Concluída";
  occurred_at: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
  update_count: number;
}

export interface OccurrenceDetails extends Occurrence {
  attachments: OccurrenceAttachment[];
  updates: OccurrenceUpdate[];
}

export interface OccurrenceInput {
  employee_id?: string | null;
  employee_name?: string | null;
  employee_matricula?: string | null;
  title: string;
  category: string;
  severity: string;
  description: string;
  current_situation?: string | null;
  immediate_risk?: string | null;
  information_source?: string | null;
  actions_taken?: string | null;
  support_required?: string | null;
  people_involved?: OccurrencePerson[];
  location?: string | null;
  occurred_at?: string;
}

const DEMO_STORE_KEY = "segempat_demo_occurrence_records_v2";
const DEMO_DELETED_KEY = "segempat_demo_occurrence_deleted_v2";

const demoEvidenceSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#171118"/><stop offset="1" stop-color="#5b0d1e"/></linearGradient></defs>
  <rect width="960" height="540" fill="url(#g)"/>
  <rect x="70" y="70" width="820" height="400" rx="24" fill="#ffffff0d" stroke="#ffffff2a"/>
  <path d="M180 365l145-135 110 95 115-125 230 210H180z" fill="#ffffff22"/>
  <circle cx="690" cy="180" r="52" fill="#f59e0b55"/>
  <text x="480" y="125" fill="white" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700">EVIDÊNCIA FOTOGRÁFICA</text>
  <text x="480" y="440" fill="#ffffffaa" text-anchor="middle" font-family="Arial" font-size="24">MODO DEMONSTRAÇÃO · DADO FICTÍCIO</text>
</svg>`)} `;

function nowIso() {
  return new Date().toISOString();
}

function normalizePeople(value: unknown): OccurrencePerson[] {
  if (Array.isArray(value)) return value as OccurrencePerson[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as OccurrencePerson[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeOccurrence(row: Partial<Occurrence> & { id: string }): Occurrence {
  return {
    id: row.id,
    employee_id: row.employee_id ?? null,
    employee_name: row.employee_name ?? null,
    employee_matricula: row.employee_matricula ?? null,
    title: String(row.title ?? "Ocorrência"),
    category: String(row.category ?? "Operacional"),
    severity: (row.severity ?? "Baixa") as Occurrence["severity"],
    description: String(row.description ?? ""),
    current_situation: row.current_situation ?? null,
    immediate_risk: row.immediate_risk ?? null,
    information_source: row.information_source ?? null,
    actions_taken: row.actions_taken ?? null,
    support_required: row.support_required ?? null,
    people_involved: normalizePeople(row.people_involved),
    location: row.location ?? null,
    status: (row.status ?? "Aberta") as Occurrence["status"],
    occurred_at: String(row.occurred_at ?? nowIso()),
    resolution_notes: row.resolution_notes ?? null,
    resolved_at: row.resolved_at ?? null,
    created_by: row.created_by ?? null,
    created_by_name: row.created_by_name ?? null,
    created_at: String(row.created_at ?? nowIso()),
    updated_at: String(row.updated_at ?? nowIso()),
    attachment_count: Number(row.attachment_count ?? 0),
    update_count: Number(row.update_count ?? 0),
  };
}

function demoStaticDetails(row: Occurrence): OccurrenceDetails {
  if (row.id === "demo-occ-01") {
    const people: OccurrencePerson[] = [
      { employee_id: "demo-emp-01", name: "Operador Demo 01", matricula: "100101", role: "Comunicante", notes: "Identificou a situação na Portaria 01." },
      { employee_id: "demo-emp-03", name: "Operador Demo 03", matricula: "100103", role: "Envolvido", notes: "Realizou a conferência inicial do acesso." },
    ];
    const updates: OccurrenceUpdate[] = [
      { id: "demo-upd-01", occurrence_id: row.id, note: "CCOS informado e imagens do ponto preservadas para conferência.", status_snapshot: "Aberta", created_by: "demo-inspector", created_by_name: "Inspetor Demonstração", created_at: row.occurred_at },
      { id: "demo-upd-02", occurrence_id: row.id, note: "Identificação conferida e tentativa de acesso encerrada sem ingresso na instalação.", status_snapshot: "Em análise", created_by: "demo-inspector", created_by_name: "Inspetor Demonstração", created_at: row.resolved_at || row.updated_at },
    ];
    const attachments: OccurrenceAttachment[] = [
      { id: "demo-att-01", occurrence_id: row.id, original_name: "registro_portaria_demo.png", mime_type: "image/svg+xml", size_bytes: 42800, caption: "Registro fotográfico demonstrativo do ponto da ocorrência.", uploaded_by: "demo-inspector", uploaded_by_name: "Inspetor Demonstração", created_at: row.occurred_at, demo_data_url: demoEvidenceSvg },
    ];
    return {
      ...row,
      category: "Comportamento Inseguro",
      description: "Tentativa de ingresso na instalação sem apresentação de credencial válida no controle de acesso.",
      current_situation: "Pessoa mantida fora da área controlada enquanto a autorização era verificada.",
      immediate_risk: "Possibilidade de acesso não autorizado à instalação portuária.",
      information_source: "Vigilante da Portaria 01 / controle de acesso",
      actions_taken: "Acesso contido, CCOS comunicado, credencial conferida e registro preservado.",
      support_required: "Acompanhamento do CCOS e confirmação da Inspetoria.",
      people_involved: people,
      attachment_count: attachments.length,
      update_count: updates.length,
      attachments,
      updates,
    };
  }

  if (row.id === "demo-occ-02") {
    const people: OccurrencePerson[] = [
      { employee_id: "demo-emp-02", name: "Operador Demo 02", matricula: "100102", role: "Comunicante", notes: "Reportou falha intermitente no rádio operacional." },
    ];
    const updates: OccurrenceUpdate[] = [
      { id: "demo-upd-03", occurrence_id: row.id, note: "Equipamento mantido em observação e equipe orientada a confirmar mensagens críticas.", status_snapshot: "Em análise", created_by: "demo-inspector", created_by_name: "Inspetor Demonstração", created_at: row.updated_at },
    ];
    return {
      ...row,
      category: "Condição Insegura",
      current_situation: "Comunicação restabelecida, porém o equipamento permanece sob observação.",
      immediate_risk: "Perda de informação operacional durante acionamento crítico.",
      information_source: "Equipe de Vigilância",
      actions_taken: "Realizados testes de transmissão e reforçada a confirmação de mensagens críticas.",
      support_required: "Avaliação técnica do rádio caso a falha volte a ocorrer.",
      people_involved: people,
      attachment_count: 0,
      update_count: updates.length,
      attachments: [],
      updates,
    };
  }

  return { ...row, attachments: [], updates: [] };
}

function readDemoRecords(): Record<string, OccurrenceDetails> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DEMO_STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, OccurrenceDetails> : {};
  } catch {
    return {};
  }
}

function writeDemoRecords(records: Record<string, OccurrenceDetails>) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(DEMO_STORE_KEY, JSON.stringify(records));
}

function readDemoDeleted(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DEMO_DELETED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeDemoDeleted(ids: string[]) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(DEMO_DELETED_KEY, JSON.stringify(ids));
}

async function demoList(): Promise<Occurrence[]> {
  const base = (await apiRequest<Array<Partial<Occurrence> & { id: string }>>("/api/operations/occurrences"))
    .map(normalizeOccurrence)
    .map((row) => demoStaticDetails(row));
  const stored = readDemoRecords();
  const deleted = new Set(readDemoDeleted());
  const combined = new Map<string, OccurrenceDetails>();
  for (const row of base) combined.set(row.id, stored[row.id] ?? row);
  for (const row of Object.values(stored)) combined.set(row.id, row);
  return [...combined.values()].filter((row) => !deleted.has(row.id)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function listOccurrences(): Promise<Occurrence[]> {
  if (isDemoModeEnabled()) return demoList();
  const rows = await apiRequest<Array<Partial<Occurrence> & { id: string }>>("/api/operations/occurrences");
  return rows.map(normalizeOccurrence);
}

export async function getOccurrenceDetails(id: string): Promise<OccurrenceDetails> {
  if (isDemoModeEnabled()) {
    const stored = readDemoRecords()[id];
    if (stored) return stored;
    const row = (await demoList()).find((item) => item.id === id);
    if (!row) throw new Error("Ocorrência demonstrativa não encontrada");
    return demoStaticDetails(row);
  }
  const row = await apiRequest<OccurrenceDetails>(`/api/operations/occurrences/${encodeURIComponent(id)}/details`);
  return {
    ...normalizeOccurrence(row),
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    updates: Array.isArray(row.updates) ? row.updates : [],
  };
}

export async function createOccurrence(input: OccurrenceInput): Promise<{ id: string }> {
  if (!isDemoModeEnabled()) {
    return apiRequest<{ id: string }>("/api/operations/occurrences", { method: "POST", body: JSON.stringify(input) });
  }
  const id = `demo-occ-${crypto.randomUUID()}`;
  const iso = input.occurred_at || nowIso();
  const record: OccurrenceDetails = {
    id,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? "Registro demonstrativo",
    employee_matricula: input.employee_matricula ?? null,
    title: input.title,
    category: input.category,
    severity: input.severity as Occurrence["severity"],
    description: input.description,
    current_situation: input.current_situation ?? null,
    immediate_risk: input.immediate_risk ?? null,
    information_source: input.information_source ?? null,
    actions_taken: input.actions_taken ?? null,
    support_required: input.support_required ?? null,
    people_involved: input.people_involved ?? [],
    location: input.location ?? null,
    status: "Aberta",
    occurred_at: iso,
    resolution_notes: null,
    resolved_at: null,
    created_by: "demo-inspector",
    created_by_name: "Inspetor Demonstração",
    created_at: nowIso(),
    updated_at: nowIso(),
    attachment_count: 0,
    update_count: 0,
    attachments: [],
    updates: [],
  };
  const records = readDemoRecords();
  records[id] = record;
  writeDemoRecords(records);
  return { id };
}

export async function updateOccurrence(id: string, patch: Partial<Occurrence>) {
  if (!isDemoModeEnabled()) {
    await apiRequest(`/api/operations/occurrences/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return;
  }
  const current = await getOccurrenceDetails(id);
  const records = readDemoRecords();
  const next: OccurrenceDetails = {
    ...current,
    ...patch,
    people_involved: patch.people_involved ?? current.people_involved,
    resolved_at: patch.status === "Concluída" ? nowIso() : patch.status ? null : current.resolved_at,
    updated_at: nowIso(),
  };
  records[id] = next;
  writeDemoRecords(records);
}

export async function deleteOccurrence(id: string) {
  if (!isDemoModeEnabled()) {
    await apiRequest(`/api/operations/occurrences/${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  const deleted = new Set(readDemoDeleted());
  deleted.add(id);
  writeDemoDeleted([...deleted]);
}

export async function addOccurrenceUpdate(id: string, note: string) {
  if (!isDemoModeEnabled()) {
    await apiRequest(`/api/operations/occurrences/${encodeURIComponent(id)}/updates`, { method: "POST", body: JSON.stringify({ note }) });
    return;
  }
  const current = await getOccurrenceDetails(id);
  const records = readDemoRecords();
  const update: OccurrenceUpdate = {
    id: `demo-upd-${crypto.randomUUID()}`,
    occurrence_id: id,
    note,
    status_snapshot: current.status,
    created_by: "demo-inspector",
    created_by_name: "Inspetor Demonstração",
    created_at: nowIso(),
  };
  records[id] = { ...current, updates: [...current.updates, update], update_count: current.updates.length + 1, updated_at: nowIso() };
  writeDemoRecords(records);
}

export async function addOccurrenceAttachment(id: string, input: { data_url: string; original_name: string; caption?: string | null }) {
  if (!isDemoModeEnabled()) {
    await apiRequest(`/api/operations/occurrences/${encodeURIComponent(id)}/attachments`, { method: "POST", body: JSON.stringify(input) });
    return;
  }
  const current = await getOccurrenceDetails(id);
  if (current.attachments.length >= 5) throw new Error("Limite de 5 evidências atingido");
  const records = readDemoRecords();
  const attachment: OccurrenceAttachment = {
    id: `demo-att-${crypto.randomUUID()}`,
    occurrence_id: id,
    original_name: input.original_name,
    mime_type: input.data_url.startsWith("data:image/png") ? "image/png" : "image/jpeg",
    size_bytes: Math.round((input.data_url.split(",")[1]?.length || 0) * 0.75),
    caption: input.caption ?? null,
    uploaded_by: "demo-inspector",
    uploaded_by_name: "Inspetor Demonstração",
    created_at: nowIso(),
    demo_data_url: input.data_url,
  };
  records[id] = { ...current, attachments: [...current.attachments, attachment], attachment_count: current.attachments.length + 1, updated_at: nowIso() };
  writeDemoRecords(records);
}

export function occurrenceAttachmentUrl(occurrenceId: string, attachment: OccurrenceAttachment) {
  if (attachment.demo_data_url) return attachment.demo_data_url;
  return buildSegempatApiUrl(`/api/operations/occurrences/${encodeURIComponent(occurrenceId)}/attachments/${encodeURIComponent(attachment.id)}`);
}
