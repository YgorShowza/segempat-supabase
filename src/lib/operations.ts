import { apiRequest } from "@/lib/backend/api-client";
import { getCurrentSessionUser } from "@/lib/backend/current-user-gateway";

export interface KnowledgeItem { id: string; title: string; category: string; content: string; target_sector: string; active: boolean; created_by: string | null; created_at: string; updated_at: string; }
export interface Occurrence { id: string; employee_id: string | null; employee_name: string | null; employee_matricula: string | null; title: string; category: string; severity: "Baixa"|"Média"|"Alta"|"Crítica"; description: string; location: string | null; status: "Aberta"|"Em análise"|"Concluída"; occurred_at: string; resolution_notes: string | null; resolved_at: string | null; created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string; }
export interface PracticalEvaluation { id: string; employee_id: string; employee_name: string; employee_matricula: string; employee_sector: string; title: string; evaluator_id: string | null; evaluator_name: string | null; status: "Planejada"|"Em andamento"|"Concluída"; score: number; max_score: number; min_approval_score: number; checklist: Array<{ id: string; label: string; done: boolean }>; notes: string | null; evaluation_date: string | null; completed_at: string | null; created_at: string; updated_at: string; }
export interface AuditLog { id: string; actor_id: string | null; actor_name: string | null; action: string; entity: string; entity_id: string | null; created_at: string; }
export interface AuditLogPage { items: AuditLog[]; nextOffset: number | null; }

function normalizePracticalEvaluation(row: any): PracticalEvaluation {
  return {
    ...row,
    score: Number(row.score ?? 0),
    max_score: Number(row.max_score ?? 10),
    min_approval_score: Number(row.min_approval_score ?? 7),
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
  } as PracticalEvaluation;
}

function occurrenceApiCreatePayload(input: { employee_id?: string | null; title: string; category: string; severity: string; description: string; location?: string | null; occurred_at?: string; }) {
  return {
    employee_id: input.employee_id ?? null,
    title: input.title,
    category: input.category,
    severity: input.severity,
    description: input.description,
    location: input.location ?? null,
    ...(input.occurred_at !== undefined ? { occurred_at: input.occurred_at } : {}),
  };
}

function occurrenceApiPatchPayload(patch: Partial<Occurrence>) {
  const allowed = ["employee_id", "title", "category", "severity", "description", "location", "status", "occurred_at", "resolution_notes", "resolved_at"] as const;
  return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(patch, key)).map((key) => [key, patch[key]]));
}

function practicalApiCreatePayload(input: { employee_id: string; title: string; evaluation_date?: string | null; min_approval_score?: number; checklist?: Array<{id:string;label:string;done:boolean}>; notes?: string | null; }) {
  return {
    employee_id: input.employee_id,
    title: input.title,
    evaluation_date: input.evaluation_date ?? null,
    min_approval_score: input.min_approval_score ?? 7,
    checklist: input.checklist ?? [],
    notes: input.notes ?? null,
  };
}

function practicalApiPatchPayload(patch: Partial<PracticalEvaluation>) {
  const allowed = ["title", "status", "score", "max_score", "min_approval_score", "checklist", "notes", "evaluation_date"] as const;
  return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(patch, key)).map((key) => [key, patch[key]]));
}

export function listKnowledgeItems(): Promise<KnowledgeItem[]> {
  return apiRequest<KnowledgeItem[]>("/api/operations/knowledge");
}

export async function createKnowledgeItem(input: Pick<KnowledgeItem,"title"|"category"|"content"|"target_sector">) {
  await apiRequest("/api/operations/knowledge", { method:"POST", body:JSON.stringify(input) });
}

export async function updateKnowledgeItem(id: string, patch: Partial<Pick<KnowledgeItem,"title"|"category"|"content"|"target_sector"|"active">>) {
  await apiRequest(`/api/operations/knowledge/${encodeURIComponent(id)}`, { method:"PATCH", body:JSON.stringify(patch) });
}

export async function deleteKnowledgeItem(id: string) {
  await apiRequest(`/api/operations/knowledge/${encodeURIComponent(id)}`, { method:"DELETE" });
}

export function listOccurrences(): Promise<Occurrence[]> {
  return apiRequest<Occurrence[]>("/api/operations/occurrences");
}

export async function createOccurrence(input: { employee_id?: string | null; employee_name?: string | null; employee_matricula?: string | null; title: string; category: string; severity: string; description: string; location?: string | null; occurred_at?: string; created_by_name?: string | null; }) {
  await apiRequest("/api/operations/occurrences", { method:"POST", body:JSON.stringify(occurrenceApiCreatePayload(input)) });
}

export async function updateOccurrence(id: string, patch: Partial<Occurrence>) {
  await apiRequest(`/api/operations/occurrences/${encodeURIComponent(id)}`, { method:"PATCH", body:JSON.stringify(occurrenceApiPatchPayload(patch)) });
}

export async function deleteOccurrence(id: string) {
  await apiRequest(`/api/operations/occurrences/${encodeURIComponent(id)}`, { method:"DELETE" });
}

export async function listPracticalEvaluations(): Promise<PracticalEvaluation[]> {
  const currentUser = await getCurrentSessionUser();
  if (!currentUser) return [];
  const endpoint = currentUser.isAdmin ? "/api/operations/practical-evaluations" : "/api/me/practical-evaluations";
  return (await apiRequest<PracticalEvaluation[]>(endpoint)).map(normalizePracticalEvaluation);
}

export async function createPracticalEvaluation(input: { employee_id: string; employee_name: string; employee_matricula: string; employee_sector: string; title: string; evaluator_name?: string | null; evaluation_date?: string | null; min_approval_score?: number; checklist?: Array<{id:string;label:string;done:boolean}>; notes?: string | null; }) {
  await apiRequest("/api/operations/practical-evaluations", { method:"POST", body:JSON.stringify(practicalApiCreatePayload(input)) });
}

export async function updatePracticalEvaluation(id: string, patch: Partial<PracticalEvaluation>) {
  await apiRequest(`/api/operations/practical-evaluations/${encodeURIComponent(id)}`, { method:"PATCH", body:JSON.stringify(practicalApiPatchPayload(patch)) });
}

export async function deletePracticalEvaluation(id: string) {
  await apiRequest(`/api/operations/practical-evaluations/${encodeURIComponent(id)}`, { method:"DELETE" });
}

export async function listAuditLogs(limit = 200, offset = 0): Promise<AuditLogPage> {
  return apiRequest<AuditLogPage>(`/api/access/audit?limit=${limit}&offset=${offset}`);
}
