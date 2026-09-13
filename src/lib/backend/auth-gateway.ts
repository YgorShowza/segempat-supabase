import { normalizeMatricula } from "@/lib/matricula";
import {
  DEMO_INSPECTOR_USER,
  DEMO_OPERATOR_USER,
  enableDemoMode,
  isDemoModeAllowed,
} from "@/lib/demo-mode";
import { apiRequest } from "./api-client";
import type { SessionUser } from "./contracts";

const DEMO_PASSWORD = "demo";

function demoUserForCredentials(matricula: string, password: string): SessionUser | null {
  if (!isDemoModeAllowed() || password !== DEMO_PASSWORD) return null;
  const normalized = normalizeMatricula(matricula);
  if (normalized === normalizeMatricula(DEMO_INSPECTOR_USER.matricula)) {
    enableDemoMode("inspector");
    return DEMO_INSPECTOR_USER;
  }
  if (normalized === normalizeMatricula(DEMO_OPERATOR_USER.matricula)) {
    enableDemoMode("operator");
    return DEMO_OPERATOR_USER;
  }
  return null;
}

export async function loginWithMatricula(matricula: string, password: string): Promise<SessionUser> {
  const demoUser = demoUserForCredentials(matricula, password);
  if (demoUser) return demoUser;

  return apiRequest<SessionUser>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ matricula: normalizeMatricula(matricula), password }),
  });
}

export async function activateWithCode(input: {
  matricula: string;
  activationCode: string;
  password: string;
}): Promise<SessionUser> {
  return apiRequest<SessionUser>("/api/auth/activate", {
    method: "POST",
    body: JSON.stringify({
      matricula: normalizeMatricula(input.matricula),
      activationCode: input.activationCode,
      password: input.password,
    }),
  });
}

export async function resetPasswordWithCode(input: {
  matricula: string;
  resetCode: string;
  newPassword: string;
}): Promise<void> {
  if (isDemoModeAllowed()) {
    throw new Error("A recuperação segura de senha fica disponível no ambiente corporativo conectado à API SEGEMPAT.");
  }
  await apiRequest<void>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      matricula: normalizeMatricula(input.matricula),
      resetCode: input.resetCode,
      newPassword: input.newPassword,
    }),
  });
}

export async function logoutSession() {
  await apiRequest<void>("/api/auth/logout", { method: "POST" });
}
