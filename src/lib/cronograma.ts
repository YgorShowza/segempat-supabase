import { apiRequest } from "@/lib/backend/api-client";
import { operationalDate, operationalMonth } from "@/lib/operational-time";

export type CronogramaStatus = "Pendente" | "Realizado" | "Justificado";
export type CronogramaType = "Planejado" | "Realizado";
export type SuspensionType = "mes_suspenso" | "ausencia_operador";

export interface CronogramaEntry {
  id: string;
  month: string;
  employee_id: string;
  employee_name: string;
  employee_matricula: string;
  employee_sector: string;
  theme: string;
  exam_id: string | null;
  exam_title: string | null;
  type: CronogramaType;
  status: CronogramaStatus;
  justification: string | null;
  planned_date: string | null;
  completion_date: string | null;
  notes: string | null;
  question_bank_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CronogramaEntryInput {
  month: string;
  employee_id: string;
  employee_name: string;
  employee_matricula: string;
  employee_sector: string;
  theme: string;
  exam_id?: string | null;
  exam_title?: string | null;
  type?: CronogramaType;
  status?: CronogramaStatus;
  justification?: string | null;
  planned_date?: string | null;
  completion_date?: string | null;
  notes?: string | null;
  question_bank_ids?: string[];
}

export interface RecurringModel {
  id: string;
  theme: string;
  target_sector: string;
  recurrence: "monthly";
  active: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringModelInput {
  theme: string;
  target_sector: string;
  active?: boolean;
  created_by_name?: string | null;
}

export interface CronogramaSuspension {
  id: string;
  type: SuspensionType;
  month: string;
  reason: string;
  notes: string | null;
  employee_id: string | null;
  employee_name: string | null;
  employee_matricula: string | null;
  date_start: string | null;
  date_end: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CronogramaSuspensionInput {
  type: SuspensionType;
  month: string;
  reason: string;
  notes?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  employee_matricula?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  created_by_name?: string | null;
}

export interface AnnualMonthSummary {
  month: string;
  total: number;
  realizado: number;
  pendente: number;
  justificado: number;
  executionRate: number;
}

export const JUSTIFICATION_OPTIONS = [
  "Férias",
  "Atestado médico",
  "Folga programada",
  "Afastamento",
  "Licença",
  "Recusou participar",
  "Escala de serviço",
  "Outro motivo",
] as const;

export const TARGET_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"] as const;

export function currentMonthStr() {
  return operationalMonth();
}

export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonth(month: string) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, (m || 1) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function entryForApi(entry: Partial<CronogramaEntryInput>) {
  const allowed = ["month", "employee_id", "theme", "exam_id", "exam_title", "type", "status", "justification", "planned_date", "completion_date", "notes", "question_bank_ids"] as const;
  return Object.fromEntries(allowed.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]));
}

function recurringForApi(input: Partial<RecurringModelInput>) {
  const allowed = ["theme", "target_sector", "active"] as const;
  return Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

function suspensionForApi(input: Partial<CronogramaSuspensionInput>) {
  const allowed = ["type", "month", "reason", "notes", "employee_id", "date_start", "date_end"] as const;
  return Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export function listCronogramaEntries(month: string): Promise<CronogramaEntry[]> {
  return apiRequest<CronogramaEntry[]>(`/api/cronograma?month=${encodeURIComponent(month)}`);
}

export function listCronogramaEntriesByYear(year: number): Promise<CronogramaEntry[]> {
  return apiRequest<CronogramaEntry[]>(`/api/cronograma/year/${year}`);
}

export async function createCronogramaEntries(entries: CronogramaEntryInput[]) {
  if (!entries.length) return;
  if (entries.length > 1000) throw new Error("O SEGEMPAT permite no máximo 1000 lançamentos atômicos por operação.");
  await apiRequest<{ ids: string[]; count: number }>("/api/cronograma/bulk", {
    method: "POST",
    body: JSON.stringify({ entries: entries.map(entryForApi) }),
  });
}

export async function updateCronogramaEntry(id: string, patch: Partial<CronogramaEntryInput>) {
  const normalized = {
    ...patch,
    ...(patch.exam_id !== undefined ? { exam_id: patch.exam_id || null } : {}),
    ...(patch.exam_title !== undefined ? { exam_title: patch.exam_title || null } : {}),
    ...(patch.justification !== undefined ? { justification: patch.justification || null } : {}),
    ...(patch.planned_date !== undefined ? { planned_date: patch.planned_date || null } : {}),
    ...(patch.completion_date !== undefined ? { completion_date: patch.completion_date || null } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
  };
  await apiRequest<void>(`/api/cronograma/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(entryForApi(normalized)),
  });
}

export async function deleteCronogramaEntry(id: string) {
  await apiRequest<void>(`/api/cronograma/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function markCronogramaEntryComplete(id: string, date = operationalDate()) {
  await updateCronogramaEntry(id, {
    status: "Realizado",
    type: "Realizado",
    completion_date: date,
    justification: null,
  });
}

export function cronogramaMetrics(entries: CronogramaEntry[]) {
  const total = entries.length;
  const realizado = entries.filter((e) => e.status === "Realizado").length;
  const pendente = entries.filter((e) => e.status === "Pendente").length;
  const justificado = entries.filter((e) => e.status === "Justificado").length;
  return { total, realizado, pendente, justificado, executionRate: total ? Math.round((realizado / total) * 100) : 0 };
}

export function annualSummary(entries: CronogramaEntry[], year: number): AnnualMonthSummary[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month, ...cronogramaMetrics(entries.filter((e) => e.month === month)) };
  });
}

export function listRecurringModels(): Promise<RecurringModel[]> {
  return apiRequest<RecurringModel[]>("/api/cronograma/recurring-models");
}

export async function createRecurringModel(input: RecurringModelInput) {
  await apiRequest<{ id: string }>("/api/cronograma/recurring-models", {
    method: "POST",
    body: JSON.stringify(recurringForApi(input)),
  });
}

export async function updateRecurringModel(id: string, patch: Partial<RecurringModelInput>) {
  await apiRequest<void>(`/api/cronograma/recurring-models/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(recurringForApi(patch)),
  });
}

export async function deleteRecurringModel(id: string) {
  await apiRequest<void>(`/api/cronograma/recurring-models/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function applyRecurringModels(params: {
  month: string;
  models: RecurringModel[];
  employees: Array<{ id: string; full_name: string; matricula: string; sector: string; status: string; access_profile: string }>;
  existingEntries: CronogramaEntry[];
  plannedDate?: string | null;
}) {
  const { month, models, employees, existingEntries, plannedDate = null } = params;
  const activeEmployees = employees.filter((e) => e.status === "Ativo" && e.access_profile !== "Inspetor");
  const existingKeys = new Set(existingEntries.map((e) => `${e.employee_id}|${e.theme.trim().toLowerCase()}`));
  const rows: CronogramaEntryInput[] = [];
  for (const model of models.filter((m) => m.active)) {
    for (const emp of activeEmployees.filter((e) => model.target_sector === "Todos" || e.sector === model.target_sector)) {
      const key = `${emp.id}|${model.theme.trim().toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      rows.push({
        month,
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_matricula: emp.matricula,
        employee_sector: emp.sector,
        theme: model.theme,
        type: "Planejado",
        status: "Pendente",
        planned_date: plannedDate,
      });
    }
  }
  await createCronogramaEntries(rows);
  return rows.length;
}

export function listSuspensions(month: string): Promise<CronogramaSuspension[]> {
  return apiRequest<CronogramaSuspension[]>(`/api/cronograma/suspensions?month=${encodeURIComponent(month)}`);
}

export async function createSuspension(input: CronogramaSuspensionInput) {
  await apiRequest<{ id: string }>("/api/cronograma/suspensions", {
    method: "POST",
    body: JSON.stringify(suspensionForApi(input)),
  });
}

export async function updateSuspension(id: string, patch: Partial<CronogramaSuspensionInput>) {
  await apiRequest<void>(`/api/cronograma/suspensions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(suspensionForApi(patch)),
  });
}

export async function deleteSuspension(id: string) {
  await apiRequest<void>(`/api/cronograma/suspensions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function syncCronogramaWithExamAttempts(month?: string) {
  const result = await apiRequest<{ changed: number }>("/api/cronograma/sync-exam-attempts", {
    method: "POST",
    body: JSON.stringify({ month: month ?? null }),
  });
  return result.changed;
}
