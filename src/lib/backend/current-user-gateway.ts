import { apiRequest } from "./api-client";
import type { SessionUser } from "./contracts";

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  try {
    return await apiRequest<SessionUser>("/api/auth/me");
  } catch (error) {
    if (error instanceof Error && /401|não autentic|unauthor/i.test(error.message)) return null;
    throw error;
  }
}
