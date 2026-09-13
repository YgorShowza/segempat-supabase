import { apiRequest, buildSegempatApiUrl } from "@/lib/backend/api-client";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { operationalDate, operationalMonth } from "@/lib/operational-time";

export type QuestionType = "Múltipla escolha" | "Discursiva";

export interface ExamQuestion {
  id: string;
  type: QuestionType;
  statement: string;
  options: string[];
  correct_index: number;
  model_answer?: string;
  points: number;
}

export interface AttemptExamQuestion {
  id: string;
  type: QuestionType;
  statement: string;
  options: string[];
  points: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  exam_type: string;
  target_sector: string;
  min_approval_pct: number;
  scheduled_date: string | null;
  status: string;
  questions: ExamQuestion[];
  question_count?: number;
  created_at: string;
}

export interface AttemptExam {
  id: string;
  title: string;
  description: string | null;
  exam_type: string;
  target_sector: string;
  min_approval_pct: number;
  scheduled_date: string | null;
  status: string;
  questions: AttemptExamQuestion[];
  created_at: string;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  user_id: string;
  matricula: string | null;
  score: number;
  passed: boolean;
  certificate_code: string | null;
  signature_path: string | null;
  signature_name: string | null;
  signed_at: string | null;
  signature_agreed: boolean;
  finished_at: string;
  created_at: string;
}

export interface ExamSignatureEvidence {
  id: string;
  exam_id: string;
  matricula: string | null;
  score: number;
  passed: boolean;
  certificate_code: string | null;
  signature_path: string | null;
  signature_name: string | null;
  signed_at: string | null;
  finished_at: string;
  exam_title: string;
  employee_name: string;
  employee_sector?: string;
  formally_issued?: boolean;
}

export interface ExamAttemptEvidence {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  exam_description?: string | null;
  exam_type?: string;
  min_approval_pct?: number;
  employee_name: string;
  matricula: string | null;
  sector: string;
  score: number;
  passed: boolean;
  certificate_code: string | null;
  finished_at: string;
  signed_at: string | null;
  signature_name: string | null;
  total_questions: number;
  correct_count: number;
  accuracy_pct: number;
  questions: Array<{ id: string; order: number; type: string; statement: string; answer: string; correct: boolean }>;
}

export const EXAM_TYPES = ["Múltipla escolha", "Discursiva", "Mista"];
export const EXAM_STATUS = ["Rascunho", "Publicada"];
export const TARGET_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"];

export interface ExamForm {
  title: string;
  description: string;
  exam_type: string;
  target_sector: string;
  min_approval_pct: number;
  scheduled_date: string;
  status: string;
  questions: ExamQuestion[];
}

export const emptyQuestion = (): ExamQuestion => ({
  id: crypto.randomUUID(),
  type: "Múltipla escolha",
  statement: "",
  options: ["", "", "", ""],
  correct_index: 0,
  points: 1,
});

export const emptyExamForm = (): ExamForm => ({
  title: "",
  description: "",
  exam_type: "Múltipla escolha",
  target_sector: "Todos",
  min_approval_pct: 70,
  scheduled_date: operationalDate(),
  status: "Rascunho",
  questions: [emptyQuestion()],
});

function normalizeDemoScale<T extends { score: number }>(record: T): T {
  if (!isDemoModeEnabled()) return record;
  const score = Number(record.score || 0);
  if (!Number.isFinite(score) || score <= 10) return record;
  return { ...record, score: Math.round(score) / 10 };
}

export function listExams(): Promise<Exam[]> {
  return apiRequest<Exam[]>("/api/exams");
}

export function listAvailableExams(): Promise<Exam[]> {
  return apiRequest<Exam[]>("/api/me/exams");
}

export function getExam(id: string): Promise<Exam> {
  return apiRequest<Exam>(`/api/exams/${encodeURIComponent(id)}`);
}

export function getExamForAttempt(id: string): Promise<AttemptExam> {
  return apiRequest<AttemptExam>(`/api/me/exams/${encodeURIComponent(id)}`);
}

export async function createExam(form: ExamForm) {
  await apiRequest<{ id: string }>("/api/exams", { method: "POST", body: JSON.stringify(form) });
}

export async function updateExam(id: string, form: Partial<ExamForm>) {
  await apiRequest<void>(`/api/exams/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(form) });
}

export async function deleteExam(id: string) {
  await apiRequest<void>(`/api/exams/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listMyAttempts(): Promise<ExamAttempt[]> {
  const attempts = await apiRequest<ExamAttempt[]>("/api/me/exam-attempts");
  return attempts.map(normalizeDemoScale);
}

export async function listAttemptsByYear(year: number): Promise<ExamAttempt[]> {
  const attempts = await apiRequest<ExamAttempt[]>(`/api/me/exam-attempts/year/${year}`);
  return attempts.map(normalizeDemoScale);
}

export async function listExamSignatureEvidence(): Promise<ExamSignatureEvidence[]> {
  const evidence = await apiRequest<ExamSignatureEvidence[]>("/api/admin/exam-attempts");
  return evidence.map(normalizeDemoScale);
}

export async function getAdminExamAttemptEvidence(attemptId: string): Promise<ExamAttemptEvidence> {
  const evidence = await apiRequest<ExamAttemptEvidence>(`/api/admin/exam-attempts/${encodeURIComponent(attemptId)}/evidence`);
  return normalizeDemoScale(evidence);
}

type SaveAttemptInput = {
  exam_id: string;
  answers: unknown;
  user_id?: string;
  matricula?: string | null;
  score?: number;
  passed?: boolean;
};

export function saveAttempt(input: SaveAttemptInput): Promise<ExamAttempt> {
  return apiRequest<ExamAttempt>(`/api/me/exams/${encodeURIComponent(input.exam_id)}/attempts`, {
    method: "POST",
    body: JSON.stringify({ answers: input.answers ?? {} }),
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a assinatura"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

export async function signAttempt(input: {
  attemptId: string;
  userId: string;
  signerName: string;
  pngBlob: Blob;
}) {
  const pngDataUrl = await blobToDataUrl(input.pngBlob);
  return apiRequest<ExamAttempt>(`/api/me/exam-attempts/${encodeURIComponent(input.attemptId)}/signature`, {
    method: "POST",
    body: JSON.stringify({ pngDataUrl }),
  });
}

export function getSignatureUrl(path: string, _expiresIn = 300) {
  return buildSegempatApiUrl(`/api/admin/exam-signatures?path=${encodeURIComponent(path)}`);
}

export function currentMonthStr() {
  return operationalMonth();
}

export function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
