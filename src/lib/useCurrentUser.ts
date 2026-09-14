import { useQuery } from "@tanstack/react-query";
import { getCurrentSessionUser } from "@/lib/backend/current-user-gateway";
import type { AccessLevel } from "@/lib/backend/contracts";

export interface CurrentUser {
  id: string;
  matricula: string;
  nome: string;
  setor: string | null;
  isAdmin: boolean;
  isMaster?: boolean;
  accessLevel?: AccessLevel;
  accessLevelLabel?: string;
  permissions?: string[];
}

export const CURRENT_USER_QUERY_KEY = ["current-user"] as const;

export function currentUserQueryOptions() {
  return {
    queryKey: CURRENT_USER_QUERY_KEY,
    staleTime: 60_000,
    queryFn: getCurrentSessionUser,
  };
}

export function useCurrentUser() {
  return useQuery<CurrentUser | null>(currentUserQueryOptions());
}
