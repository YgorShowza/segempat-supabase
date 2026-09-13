import { apiRequest } from "@/lib/backend/api-client";

export type CertificateRecord = {
  id: string;
  exam_id: string;
  user_id: string;
  matricula: string | null;
  score: number;
  passed: boolean;
  certificate_code: string | null;
  signature_path: string | null;
  signature_name: string | null;
  signature_agreed: boolean;
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

export type MyCertificateState = {
  attempt_id: string;
  verification_code: string;
  issued_at: string;
  revoked: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export function listMyCertificateStates(): Promise<MyCertificateState[]> {
  return apiRequest<MyCertificateState[]>("/api/me/certificate-states");
}

export function listCertificateRecords(): Promise<CertificateRecord[]> {
  return apiRequest<CertificateRecord[]>("/api/admin/exam-attempts");
}
