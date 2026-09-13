import { demoApiRequest } from "@/lib/demo-api";
import { listSharedDemoExams } from "@/lib/demo-exam-store";
import { DEMO_OPERATOR_USER, disableDemoMode } from "@/lib/demo-mode";

type DemoRow = Record<string, unknown>;

type DemoExamQuestion = DemoRow & {
  id: string;
  type: string;
  statement: string;
  options: string[];
  correct_index?: number;
  points?: number;
};

type DemoExam = DemoRow & {
  id: string;
  title: string;
  description?: string | null;
  exam_type: string;
  target_sector: string;
  min_approval_pct: number;
  scheduled_date?: string | null;
  status: string;
  questions: DemoExamQuestion[];
  created_at: string;
};

type DemoAttempt = DemoRow & {
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
};

const OPERATOR_ATTEMPTS_KEY = "segempat.demo.operator.attempts.v1";
const OPERATOR_SECTOR = DEMO_OPERATOR_USER.setor || "CFTV";

function bodyObject(init: RequestInit) {
  if (typeof init.body !== "string") return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(init.body) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function operatorScoped(row: DemoRow) {
  return row["employee_id"] === DEMO_OPERATOR_USER.id || row["user_id"] === DEMO_OPERATOR_USER.id || row["employee_matricula"] === DEMO_OPERATOR_USER.matricula || row["matricula"] === DEMO_OPERATOR_USER.matricula;
}

function sectorAllowed(row: { target_sector?: unknown }) {
  const target = String(row.target_sector ?? "Todos");
  return target === "Todos" || target === OPERATOR_SECTOR;
}

function sanitizeExam(exam: DemoExam) {
  return {
    ...exam,
    questions: exam.questions.map(({ correct_index: _correctIndex, ...question }) => question),
  };
}

async function defaultAttempts(): Promise<DemoAttempt[]> {
  const base = await demoApiRequest<DemoAttempt[]>("/api/me/exam-attempts");
  const now = new Date().toISOString();
  const approved = base.find((attempt) => attempt.matricula === DEMO_OPERATOR_USER.matricula);
  const normalizedApproved: DemoAttempt = approved
    ? {
        ...approved,
        user_id: DEMO_OPERATOR_USER.id,
        matricula: DEMO_OPERATOR_USER.matricula,
        score: 9,
        passed: true,
        certificate_code: approved.certificate_code || "DEMO-OPER-001",
        signature_path: "demo-signatures/operator-100101.png",
        signature_name: DEMO_OPERATOR_USER.nome,
        signed_at: approved.signed_at || now,
        signature_agreed: true,
      }
    : {
        id: "demo-attempt-operator-01",
        exam_id: "demo-exam-01",
        user_id: DEMO_OPERATOR_USER.id,
        matricula: DEMO_OPERATOR_USER.matricula,
        score: 9,
        passed: true,
        certificate_code: "DEMO-OPER-001",
        signature_path: "demo-signatures/operator-100101.png",
        signature_name: DEMO_OPERATOR_USER.nome,
        signed_at: now,
        signature_agreed: true,
        finished_at: now,
        created_at: now,
      };

  const failed: DemoAttempt = {
    id: "demo-attempt-operator-02",
    exam_id: "demo-exam-02",
    user_id: DEMO_OPERATOR_USER.id,
    matricula: DEMO_OPERATOR_USER.matricula,
    score: 6.4,
    passed: false,
    certificate_code: null,
    signature_path: null,
    signature_name: null,
    signed_at: null,
    signature_agreed: false,
    finished_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  };

  return [normalizedApproved, failed];
}

async function readAttempts(): Promise<DemoAttempt[]> {
  if (typeof window === "undefined") return defaultAttempts();
  try {
    const stored = window.sessionStorage.getItem(OPERATOR_ATTEMPTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) return parsed as DemoAttempt[];
    }
  } catch {
    // Recria a base fictícia se a sessão local estiver inválida.
  }
  const initial = await defaultAttempts();
  window.sessionStorage.setItem(OPERATOR_ATTEMPTS_KEY, JSON.stringify(initial));
  return initial;
}

function writeAttempts(attempts: DemoAttempt[]) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(OPERATOR_ATTEMPTS_KEY, JSON.stringify(attempts));
}

async function availableExams() {
  const exams = await listSharedDemoExams();
  return exams.filter((exam) => exam.status === "Publicada" && sectorAllowed(exam)) as DemoExam[];
}

async function submitAttempt(pathname: string, init: RequestInit) {
  const examId = decodeURIComponent(pathname.split("/")[4] || "");
  const exams = await listSharedDemoExams();
  const exam = exams.find((item) => item.id === examId && item.status === "Publicada" && sectorAllowed(item)) as DemoExam | undefined;
  if (!exam) throw new Error("Prova demonstrativa indisponível para este operador.");

  const body = bodyObject(init);
  const answers = body["answers"] && typeof body["answers"] === "object"
    ? body["answers"] as Record<string, unknown>
    : {};
  const gradable = exam.questions.filter((question) => question.type === "Múltipla escolha" && Number.isInteger(question.correct_index));
  const correct = gradable.filter((question) => Number(answers[question.id]) === question.correct_index).length;
  const score = gradable.length ? Math.round((correct / gradable.length) * 100) / 10 : 0;
  const passed = score * 10 >= Number(exam.min_approval_pct || 70);
  const now = new Date().toISOString();
  const id = `demo-attempt-operator-${Date.now()}`;
  const attempt: DemoAttempt = {
    id,
    exam_id: exam.id,
    user_id: DEMO_OPERATOR_USER.id,
    matricula: DEMO_OPERATOR_USER.matricula,
    score,
    passed,
    certificate_code: passed ? `DEMO-${DEMO_OPERATOR_USER.matricula}-${Date.now().toString().slice(-6)}` : null,
    signature_path: null,
    signature_name: null,
    signed_at: null,
    signature_agreed: false,
    finished_at: now,
    created_at: now,
  };
  const attempts = await readAttempts();
  writeAttempts([attempt, ...attempts]);
  return attempt;
}

async function signAttempt(pathname: string) {
  const attemptId = decodeURIComponent(pathname.split("/")[4] || "");
  const attempts = await readAttempts();
  const index = attempts.findIndex((attempt) => attempt.id === attemptId);
  if (index < 0) throw new Error("Tentativa demonstrativa não encontrada.");
  const current = attempts[index];
  if (!current.passed) throw new Error("Somente tentativas aprovadas podem ser assinadas.");
  const signed: DemoAttempt = {
    ...current,
    certificate_code: current.certificate_code || `DEMO-${DEMO_OPERATOR_USER.matricula}-${Date.now().toString().slice(-6)}`,
    signature_path: `demo-signatures/${attemptId}.png`,
    signature_name: DEMO_OPERATOR_USER.nome,
    signed_at: new Date().toISOString(),
    signature_agreed: true,
  };
  const next = [...attempts];
  next[index] = signed;
  writeAttempts(next);
  return signed;
}

export async function operatorDemoApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const pathname = path.split("?")[0] || path;

  if (pathname === "/api/auth/me" && method === "GET") return DEMO_OPERATOR_USER as T;
  if (pathname === "/api/auth/logout" && method === "POST") {
    disableDemoMode();
    return undefined as T;
  }

  if (method === "POST" && /^\/api\/me\/exams\/[^/]+\/attempts$/.test(pathname)) {
    return await submitAttempt(pathname, init) as T;
  }
  if (method === "POST" && /^\/api\/me\/exam-attempts\/[^/]+\/signature$/.test(pathname)) {
    return await signAttempt(pathname) as T;
  }

  if (method === "GET") {
    if (pathname === "/api/me/exam-attempts" || pathname.startsWith("/api/me/exam-attempts/year/")) {
      return await readAttempts() as T;
    }
    if (pathname === "/api/me/certificate-states") {
      const attempts = await readAttempts();
      return attempts
        .filter((attempt) => attempt.passed && attempt.certificate_code)
        .map((attempt) => ({
          attempt_id: attempt.id,
          verification_code: attempt.certificate_code,
          issued_at: attempt.signed_at || attempt.finished_at,
          revoked: false,
          revoked_at: null,
          revoked_reason: null,
        })) as T;
    }
    if (pathname === "/api/me/exams") return (await availableExams()).map(sanitizeExam) as T;
    if (pathname.startsWith("/api/me/exams/")) {
      const id = decodeURIComponent(pathname.split("/").pop() || "");
      const exam = (await availableExams()).find((item) => item.id === id);
      if (!exam) throw new Error("Prova demonstrativa indisponível para este operador.");
      return sanitizeExam(exam) as T;
    }

    if (pathname.startsWith("/api/cronograma/year/")) {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(operatorScoped) as T;
    }
    if (pathname === "/api/cronograma") {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(operatorScoped) as T;
    }

    if (pathname === "/api/operations/practical-evaluations" || pathname === "/api/me/practical-evaluations") {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(operatorScoped) as T;
    }
    if (pathname === "/api/operations/occurrences") {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(operatorScoped) as T;
    }
    if (pathname === "/api/operations/knowledge") {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(sectorAllowed) as T;
    }
    if (pathname === "/api/training/modules") {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(sectorAllowed) as T;
    }
    if (pathname === "/api/me/training/schedule") {
      const rows = await demoApiRequest<DemoRow[]>("/api/admin/training/schedules");
      return (rows.find(operatorScoped) || null) as T;
    }
    if (pathname === "/api/me/training/activities") {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(operatorScoped) as T;
    }
    if (pathname === "/api/question-bank/operational") {
      const rows = await demoApiRequest<DemoRow[]>(path, init);
      return rows.filter(sectorAllowed) as T;
    }
  }

  return demoApiRequest<T>(path, init);
}
