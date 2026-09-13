import type { Exam, ExamForm } from "@/lib/exams";
import { demoApiRequest } from "@/lib/demo-api";
import { DEMO_OPERATOR_USER, DEMO_USER } from "@/lib/demo-mode";

const DEMO_EXAM_STORE_KEY = "segempat.demo.exams.shared.v1";
const DEMO_EXAM_DELETED_KEY = "segempat.demo.exams.deleted.v1";

export const DEMO_INSPECTOR_LAUNCHED_EXAM_ID = "demo-exam-inspector-cftv";

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inspectorLaunchedExam(): Exam {
  const createdAt = nowIso();
  return {
    id: DEMO_INSPECTOR_LAUNCHED_EXAM_ID,
    title: "Avaliação Teórica — Procedimentos de Videomonitoramento",
    description: `Situação fictícia: prova teórica lançada pelo ${DEMO_USER.nome} para o setor ${DEMO_OPERATOR_USER.setor}. O ${DEMO_OPERATOR_USER.nome} deve visualizá-la no aplicativo e realizar a avaliação.`,
    exam_type: "Múltipla escolha",
    target_sector: DEMO_OPERATOR_USER.setor || "CFTV",
    min_approval_pct: 70,
    scheduled_date: todayIso(),
    status: "Publicada",
    question_count: 4,
    questions: [
      {
        id: "demo-theory-cftv-q1",
        type: "Múltipla escolha",
        statement: "Ao identificar uma movimentação suspeita pelas câmeras, qual deve ser a primeira conduta do operador?",
        options: [
          "Ignorar até receber uma ligação",
          "Confirmar visualmente, registrar e comunicar conforme o procedimento",
          "Publicar a imagem em grupo externo",
          "Desligar a câmera para evitar alarme",
        ],
        correct_index: 1,
        points: 1,
      },
      {
        id: "demo-theory-cftv-q2",
        type: "Múltipla escolha",
        statement: "Qual informação deve constar em um registro de videomonitoramento?",
        options: [
          "Somente o nome do operador",
          "Data, horário, local/câmera, fato observado e providências adotadas",
          "Apenas o horário",
          "Somente informações informais do turno",
        ],
        correct_index: 1,
        points: 1,
      },
      {
        id: "demo-theory-cftv-q3",
        type: "Múltipla escolha",
        statement: "Em uma ocorrência acompanhada pelo CFTV, a comunicação operacional deve ser:",
        options: [
          "Clara, objetiva e direcionada à cadeia de resposta definida",
          "Feita somente depois do encerramento do turno",
          "Substituída por mensagens pessoais",
          "Omitida quando houver gravação de imagem",
        ],
        correct_index: 0,
        points: 1,
      },
      {
        id: "demo-theory-cftv-q4",
        type: "Múltipla escolha",
        statement: "As imagens relacionadas a uma ocorrência devem ser tratadas como:",
        options: [
          "Conteúdo de livre compartilhamento",
          "Evidência operacional sujeita aos procedimentos de preservação e acesso",
          "Arquivo descartável sem necessidade de controle",
          "Material pessoal do operador",
        ],
        correct_index: 1,
        points: 1,
      },
    ],
    created_at: createdAt,
  };
}

function readStoredExams(): Exam[] {
  if (typeof window === "undefined") return [inspectorLaunchedExam()];
  try {
    const stored = window.sessionStorage.getItem(DEMO_EXAM_STORE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) return parsed as Exam[];
    }
  } catch {
    // Recria somente a base fictícia compartilhada quando o storage estiver inválido.
  }
  const initial = [inspectorLaunchedExam()];
  window.sessionStorage.setItem(DEMO_EXAM_STORE_KEY, JSON.stringify(initial));
  return initial;
}

function writeStoredExams(exams: Exam[]) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(DEMO_EXAM_STORE_KEY, JSON.stringify(exams));
  }
}

function readDeletedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = window.sessionStorage.getItem(DEMO_EXAM_DELETED_KEY);
    const parsed = stored ? JSON.parse(stored) as unknown : [];
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeDeletedIds(ids: Set<string>) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(DEMO_EXAM_DELETED_KEY, JSON.stringify([...ids]));
  }
}

function requestBody(init: RequestInit): Partial<ExamForm> {
  if (typeof init.body !== "string") return {};
  try {
    const parsed = JSON.parse(init.body) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Partial<ExamForm> : {};
  } catch {
    return {};
  }
}

function normalizeExam(id: string, form: Partial<ExamForm>, previous?: Exam): Exam {
  const questions = Array.isArray(form.questions) ? form.questions : previous?.questions ?? [];
  return {
    id,
    title: String(form.title ?? previous?.title ?? "Prova teórica demonstrativa"),
    description: form.description !== undefined ? String(form.description || "") : previous?.description ?? null,
    exam_type: String(form.exam_type ?? previous?.exam_type ?? "Múltipla escolha"),
    target_sector: String(form.target_sector ?? previous?.target_sector ?? "Todos"),
    min_approval_pct: Number(form.min_approval_pct ?? previous?.min_approval_pct ?? 70),
    scheduled_date: form.scheduled_date !== undefined ? String(form.scheduled_date || "") || null : previous?.scheduled_date ?? null,
    status: String(form.status ?? previous?.status ?? "Rascunho"),
    question_count: questions.length,
    questions,
    created_at: previous?.created_at ?? nowIso(),
  };
}

export async function listSharedDemoExams(): Promise<Exam[]> {
  const base = await demoApiRequest<Exam[]>("/api/exams");
  const stored = readStoredExams();
  const deleted = readDeletedIds();
  const storedIds = new Set(stored.map((exam) => exam.id));
  return [
    ...base.filter((exam) => !storedIds.has(exam.id) && !deleted.has(exam.id)),
    ...stored.filter((exam) => !deleted.has(exam.id)),
  ];
}

export function isSharedDemoExamPath(path: string) {
  const pathname = path.split("?")[0] || path;
  return pathname === "/api/exams" || pathname.startsWith("/api/exams/");
}

export async function sharedDemoExamApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const pathname = path.split("?")[0] || path;

  if (method === "GET") {
    const exams = await listSharedDemoExams();
    if (pathname === "/api/exams") return exams as T;
    const id = decodeURIComponent(pathname.split("/").pop() || "");
    const exam = exams.find((item) => item.id === id);
    if (!exam) throw new Error("Prova demonstrativa não encontrada.");
    return exam as T;
  }

  if (method === "POST" && pathname === "/api/exams") {
    const form = requestBody(init);
    const exam = normalizeExam(`demo-exam-created-${Date.now()}`, form);
    writeStoredExams([exam, ...readStoredExams()]);
    return { id: exam.id } as T;
  }

  if (method === "PATCH" && pathname.startsWith("/api/exams/")) {
    const id = decodeURIComponent(pathname.split("/").pop() || "");
    const all = await listSharedDemoExams();
    const previous = all.find((item) => item.id === id);
    if (!previous) throw new Error("Prova demonstrativa não encontrada.");
    const updated = normalizeExam(id, requestBody(init), previous);
    const stored = readStoredExams().filter((item) => item.id !== id);
    writeStoredExams([updated, ...stored]);
    const deleted = readDeletedIds();
    deleted.delete(id);
    writeDeletedIds(deleted);
    return undefined as T;
  }

  if (method === "DELETE" && pathname.startsWith("/api/exams/")) {
    const id = decodeURIComponent(pathname.split("/").pop() || "");
    writeStoredExams(readStoredExams().filter((item) => item.id !== id));
    const deleted = readDeletedIds();
    deleted.add(id);
    writeDeletedIds(deleted);
    return undefined as T;
  }

  throw new Error("Operação demonstrativa de prova não suportada.");
}
