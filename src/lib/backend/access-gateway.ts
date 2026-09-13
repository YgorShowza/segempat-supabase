import { isDemoModeAllowed } from "@/lib/demo-mode";
import { apiRequest } from "./api-client";

export interface GeneratedAccess {
  code: string;
  employee_id: string;
  employee_name: string;
  matricula: string;
  expires_at: string;
}

export interface ActivationCodeStatus {
  employee_id: string;
  employee_name: string;
  matricula: string;
  sector: string;
  expires_at: string | null;
  used_at: string | null;
  created_at: string | null;
  has_account: boolean;
  account_active?: boolean;
  access_level?: "master" | "admin" | "inspector" | "operator" | null;
  access_level_label?: string | null;
  password_reset_allowed?: boolean;
  password_reset_block_reason?: string | null;
  expired: boolean;
  reset_expires_at?: string | null;
  reset_used_at?: string | null;
  reset_created_at?: string | null;
  reset_locked_at?: string | null;
  reset_failed_attempts?: number;
  reset_expired?: boolean;
}

export function listActivationCodes(): Promise<ActivationCodeStatus[]> {
  return apiRequest<ActivationCodeStatus[]>("/api/access/activation-codes");
}

export function generateActivationCode(employeeId: string): Promise<GeneratedAccess> {
  return apiRequest<GeneratedAccess>(`/api/access/activation-codes/${encodeURIComponent(employeeId)}`, {
    method: "POST",
  });
}

export async function revokeActivationCode(employeeId: string): Promise<void> {
  await apiRequest<void>(`/api/access/activation-codes/${encodeURIComponent(employeeId)}`, {
    method: "DELETE",
  });
}

export function generatePasswordResetCode(employeeId: string): Promise<GeneratedAccess> {
  if (isDemoModeAllowed()) {
    return Promise.reject(new Error("A recuperação segura de senha fica disponível no ambiente corporativo conectado à API SEGEMPAT."));
  }
  return apiRequest<GeneratedAccess>(`/api/access/password-resets/${encodeURIComponent(employeeId)}`, {
    method: "POST",
  });
}

export async function revokePasswordResetCode(employeeId: string): Promise<void> {
  if (isDemoModeAllowed()) {
    throw new Error("A recuperação segura de senha fica disponível no ambiente corporativo conectado à API SEGEMPAT.");
  }
  await apiRequest<void>(`/api/access/password-resets/${encodeURIComponent(employeeId)}`, {
    method: "DELETE",
  });
}
