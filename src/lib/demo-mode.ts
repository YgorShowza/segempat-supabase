import type { SessionUser } from "@/lib/backend/contracts";

const DEMO_SESSION_KEY = "segempat.demo.session";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export type DemoRole = "inspector" | "operator";

function envFlag(name: string) {
  const raw = import.meta.env[name];
  return typeof raw === "string" && TRUE_VALUES.has(raw.trim().toLowerCase());
}

function configuredApiUrl() {
  const raw = import.meta.env["VITE_SEGEMPAT_API_URL"];
  return typeof raw === "string" ? raw.trim() : "";
}

export const DEMO_INSPECTOR_USER: SessionUser = {
  id: "demo-inspector-001",
  matricula: "000001",
  nome: "Inspetor Demonstração",
  setor: "Segurança Portuária",
  isAdmin: true,
  isMaster: true,
  accessLevel: "master",
  accessLevelLabel: "Administrador Master",
};

export const DEMO_OPERATOR_USER: SessionUser = {
  id: "demo-emp-01",
  matricula: "100101",
  nome: "Operador Demo 01",
  setor: "CFTV",
  isAdmin: false,
  isMaster: false,
  accessLevel: "operator",
  accessLevelLabel: "Operador",
  permissions: [],
};

// Compatibilidade com o restante da base demo existente, que usa DEMO_USER
// como identidade da Inspetoria ao gerar registros administrativos fictícios.
export const DEMO_USER = DEMO_INSPECTOR_USER;

export function isDemoModeAllowed() {
  return !configuredApiUrl() && !envFlag("VITE_SEGEMPAT_REQUIRE_API");
}

export function getDemoRole(): DemoRole | null {
  if (!isDemoModeAllowed() || typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(DEMO_SESSION_KEY);
  if (stored === "operator") return "operator";
  if (stored === "inspector" || stored === "1") return "inspector";
  return null;
}

export function getDemoSessionUser(): SessionUser | null {
  const role = getDemoRole();
  if (role === "operator") return DEMO_OPERATOR_USER;
  if (role === "inspector") return DEMO_INSPECTOR_USER;
  return null;
}

export function isDemoModeEnabled() {
  return getDemoRole() !== null;
}

export function enableDemoMode(role: DemoRole = "inspector") {
  if (!isDemoModeAllowed()) {
    throw new Error("Modo demonstração indisponível quando a API corporativa é obrigatória ou já está configurada.");
  }
  if (typeof window !== "undefined") window.sessionStorage.setItem(DEMO_SESSION_KEY, role);
}

export function disableDemoMode() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(DEMO_SESSION_KEY);
}
