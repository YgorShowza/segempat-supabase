import { apiRequest } from "@/lib/backend/api-client";

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  content: string | null;
  display_order: number;
  min_score: number;
  target_sector: string;
  status: "Ativo" | "Inativo";
  created_at: string;
  updated_at: string;
}

export interface TrainingModuleInput {
  title: string;
  description: string;
  content: string | null;
  display_order: number;
  min_score: number;
  target_sector: string;
  status: "Ativo" | "Inativo";
}

export function listTrainingModules(): Promise<TrainingModule[]> {
  return apiRequest<TrainingModule[]>("/api/training/modules");
}

export async function createTrainingModule(input: TrainingModuleInput) {
  await apiRequest<{ id: string }>("/api/admin/training/modules", { method: "POST", body: JSON.stringify(input) });
}

export async function updateTrainingModule(id: string, input: Partial<TrainingModuleInput>) {
  await apiRequest<void>(`/api/admin/training/modules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteTrainingModule(id: string) {
  await apiRequest<void>(`/api/admin/training/modules/${encodeURIComponent(id)}`, { method: "DELETE" });
}
