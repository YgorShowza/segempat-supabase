import { apiRequest } from "@/lib/backend/api-client";

export interface QuestionBankItem {
  id: string;
  bank_type: string;
  question_text: string;
  options: string[];
  correct_index: number | null;
  correct_answer: string | null;
  explanation: string | null;
  target_sector: string;
  difficulty: string;
  theme: string;
  active: boolean;
  created_at: string;
}

export interface OperationalQuestionBankItem {
  id: string;
  bank_type: string;
  question_text: string;
  options: string[];
  target_sector: string;
  difficulty: string;
  theme: string;
  active: boolean;
  created_at: string;
}

export interface QuestionBankInput {
  bank_type: string;
  question_text: string;
  options: string[];
  correct_index: number | null;
  correct_answer: string | null;
  explanation: string | null;
  target_sector: string;
  difficulty: string;
  theme: string;
  active: boolean;
}

export function listQuestionBank(): Promise<QuestionBankItem[]> {
  return apiRequest<QuestionBankItem[]>("/api/question-bank");
}

export function listActiveQuestionBank(): Promise<OperationalQuestionBankItem[]> {
  return apiRequest<OperationalQuestionBankItem[]>("/api/question-bank/operational");
}

export async function createQuestionBankItem(input: QuestionBankInput) {
  await apiRequest<{ id: string }>("/api/question-bank", { method: "POST", body: JSON.stringify(input) });
}

export async function updateQuestionBankItem(id: string, input: Partial<QuestionBankInput>) {
  await apiRequest<void>(`/api/question-bank/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteQuestionBankItem(id: string) {
  await apiRequest<void>(`/api/question-bank/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function questionThemeLabel(item: Pick<QuestionBankItem, "theme" | "bank_type"> | Pick<OperationalQuestionBankItem, "theme" | "bank_type">) {
  return item.theme?.trim() || item.bank_type?.trim() || "Questão sem tema";
}
