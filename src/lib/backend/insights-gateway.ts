import { apiRequest } from "./api-client";
import type { ExamAttemptEvidence } from "@/lib/exams";

export type AttentionCertificateSupport = {
  id: string;
  exam_id: string;
  user_id: string;
  matricula: string | null;
  score: number;
  passed: boolean;
  certificate_code: string | null;
  signature_agreed: boolean;
  has_signature: boolean;
  signed_at: string | null;
  finished_at: string;
  created_at: string;
  exam_title: string;
  exam_type: string;
  employee_name: string;
  employee_sector: string;
  certificate_revoked: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
  formally_issued: boolean;
};

export type AttentionTrainingSupport = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_matricula: string;
  cycle_days: number;
  last_training_date: string | null;
  window_start: string | null;
  window_end: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AttentionSupport = {
  certificates: AttentionCertificateSupport[];
  training: AttentionTrainingSupport[];
};

export function getAttentionSupport(): Promise<AttentionSupport> {
  return apiRequest<AttentionSupport>("/api/insights/attention-support");
}

export function getInsightExamAttemptEvidence(attemptId: string): Promise<ExamAttemptEvidence> {
  return apiRequest<ExamAttemptEvidence>(`/api/insights/exam-attempts/${encodeURIComponent(attemptId)}/evidence`);
}
