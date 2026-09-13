export type UserRole = "admin" | "operator";
export type AccessLevel = "master" | "admin" | "inspector" | "operator";

export interface SessionUser {
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

export interface AuthGateway {
  currentUser(): Promise<SessionUser | null>;
  signIn(input: { matricula: string; password: string }): Promise<SessionUser>;
  activate(input: { matricula: string; activationCode: string; password: string }): Promise<SessionUser>;
  signOut(): Promise<void>;
}

export interface EmployeeRecord {
  id: string;
  full_name: string;
  matricula: string;
  sector: string;
  access_profile: string;
  status: string;
  level: number;
  points: number;
  first_access: boolean;
  created_at: string;
  updated_at?: string;
}

export interface EmployeeGateway {
  list(): Promise<EmployeeRecord[]>;
  create(input: Pick<EmployeeRecord, "full_name" | "matricula" | "sector" | "access_profile" | "status">): Promise<void>;
  update(id: string, input: Partial<Pick<EmployeeRecord, "full_name" | "matricula" | "sector" | "access_profile" | "status">>): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

export interface SegempatBackend {
  auth: AuthGateway;
  employees: EmployeeGateway;
}

/** Frontend SEGEMPAT conectado exclusivamente à API corporativa/MySQL. */
export type BackendProvider = "segempat-api";
