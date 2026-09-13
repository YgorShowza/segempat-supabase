import { apiRequest } from "@/lib/backend/api-client";
import { operationalDate } from "@/lib/operational-time";

export type TrainingCycleStatus = "Em dia" | "Próximo ao vencimento" | "Vencido";

export interface TrainingSchedule {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_matricula: string;
  cycle_days: number;
  last_training_date: string | null;
  window_start: string | null;
  window_end: string | null;
  observations: string | null;
  status: TrainingCycleStatus;
  created_at: string;
  updated_at: string;
}

export interface TrainingScheduleInput {
  employee_id: string;
  employee_name: string;
  employee_matricula: string;
  cycle_days: number;
  last_training_date: string | null;
  window_start: string | null;
  window_end: string | null;
  observations: string | null;
  status: TrainingCycleStatus;
}

function isoDateUtc(date: Date) { return date.toISOString().slice(0, 10); }

export function calculateTrainingWindow(lastTrainingDate: string | null, cycleDays: number) {
  if (!lastTrainingDate) return { window_start: null, window_end: null };
  const last = new Date(`${lastTrainingDate}T12:00:00Z`);
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + Math.max(1, cycleDays));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.min(15, Math.max(7, Math.round(cycleDays * 0.2))));
  return { window_start: isoDateUtc(start), window_end: isoDateUtc(end) };
}

export function deriveTrainingStatus(schedule: Pick<TrainingSchedule, "window_start" | "window_end" | "last_training_date" | "cycle_days">, now = new Date()): TrainingCycleStatus {
  const window = schedule.window_end ? { window_start: schedule.window_start, window_end: schedule.window_end } : calculateTrainingWindow(schedule.last_training_date, schedule.cycle_days);
  if (!window.window_end) return "Vencido";
  const today = operationalDate(now);
  if (today > window.window_end) return "Vencido";
  if (window.window_start && today >= window.window_start) return "Próximo ao vencimento";
  return "Em dia";
}

function normalize(row: TrainingSchedule): TrainingSchedule { return { ...row, status: deriveTrainingStatus(row) }; }

function apiSchedulePayload(input: Partial<TrainingScheduleInput>) {
  const payload: Record<string, unknown> = {};
  if (input.employee_id !== undefined) payload.employee_id = input.employee_id;
  if (input.cycle_days !== undefined) payload.cycle_days = input.cycle_days;
  if (input.last_training_date !== undefined) payload.last_training_date = input.last_training_date;
  if (input.observations !== undefined) payload.observations = input.observations;
  return payload;
}

export async function listTrainingSchedules(): Promise<TrainingSchedule[]> {
  return (await apiRequest<TrainingSchedule[]>("/api/admin/training/schedules")).map(normalize);
}

export async function createTrainingSchedule(input: TrainingScheduleInput) {
  await apiRequest<{ id: string }>("/api/admin/training/schedules", { method: "POST", body: JSON.stringify(apiSchedulePayload(input)) });
}

export async function updateTrainingSchedule(id: string, input: Partial<TrainingScheduleInput>) {
  await apiRequest<void>(`/api/admin/training/schedules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(apiSchedulePayload(input)) });
}

export async function deleteTrainingSchedule(id: string) {
  await apiRequest<void>(`/api/admin/training/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getMyTrainingSchedule(): Promise<TrainingSchedule | null> {
  const row = await apiRequest<TrainingSchedule | null>("/api/me/training/schedule");
  return row ? normalize(row) : null;
}
