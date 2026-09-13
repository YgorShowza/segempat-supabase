import { DEMO_USER, disableDemoMode } from "@/lib/demo-mode";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function demoClock() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${year}-${pad(now.getMonth() + 1)}`;
  const today = `${month}-${pad(now.getDate())}`;
  const iso = now.toISOString();
  return { year, month, today, iso };
}

function queryParam(path: string, key: string) {
  const query = path.includes("?") ? path.slice(path.indexOf("?")) : "";
  return new URLSearchParams(query).get(key);
}

function bodyObject(init: RequestInit) {
  if (typeof init.body !== "string") return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(init.body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function demoEmployees() {
  const { iso } = demoClock();
  return [
    { id: DEMO_USER.id, full_name: DEMO_USER.nome, matricula: DEMO_USER.matricula, sector: "Segurança Portuária", access_profile: "Inspetor", status: "Ativo", level: 8, points: 2450, first_access: false, created_at: iso, updated_at: iso },
    { id: "demo-emp-01", full_name: "Operador Demo 01", matricula: "100101", sector: "CFTV", access_profile: "Operacional", status: "Ativo", level: 5, points: 1280, first_access: false, created_at: iso, updated_at: iso },
    { id: "demo-emp-02", full_name: "Operador Demo 02", matricula: "100102", sector: "Vigilância", access_profile: "Operacional", status: "Ativo", level: 4, points: 960, first_access: false, created_at: iso, updated_at: iso },
    { id: "demo-emp-03", full_name: "Operador Demo 03", matricula: "100103", sector: "Portaria", access_profile: "Operacional", status: "Ativo", level: 3, points: 710, first_access: false, created_at: iso, updated_at: iso },
    { id: "demo-emp-04", full_name: "Operador Demo 04", matricula: "100104", sector: "Ronda", access_profile: "Operacional", status: "Ativo", level: 6, points: 1540, first_access: false, created_at: iso, updated_at: iso },
  ];
}

function demoExams() {
  const { today, iso } = demoClock();
  return [
    {
      id: "demo-exam-01",
      title: "Procedimentos de Controle de Acesso",
      description: "Avaliação demonstrativa sobre rotinas de acesso e segurança portuária.",
      exam_type: "Múltipla escolha",
      target_sector: "Todos",
      min_approval_pct: 70,
      scheduled_date: today,
      status: "Publicada",
      question_count: 3,
      questions: [
        { id: "dq-01", type: "Múltipla escolha", statement: "Qual é a primeira ação diante de uma tentativa de acesso não autorizado?", options: ["Liberar acesso", "Confirmar autorização e comunicar a ocorrência", "Ignorar", "Desligar o rádio"], correct_index: 1, points: 1 },
        { id: "dq-02", type: "Múltipla escolha", statement: "O registro de acesso deve ser tratado como:", options: ["Opcional", "Informal", "Evidência operacional", "Documento descartável"], correct_index: 2, points: 1 },
        { id: "dq-03", type: "Múltipla escolha", statement: "Em caso de dúvida operacional, o profissional deve:", options: ["Improvisar", "Seguir procedimento e acionar a cadeia de comando", "Abandonar o posto", "Ocultar o fato"], correct_index: 1, points: 1 },
      ],
      created_at: iso,
    },
    {
      id: "demo-exam-02",
      title: "Comunicação Operacional por Rádio",
      description: "Boas práticas de comunicação e resposta.",
      exam_type: "Múltipla escolha",
      target_sector: "Todos",
      min_approval_pct: 70,
      scheduled_date: today,
      status: "Publicada",
      question_count: 2,
      questions: [
        { id: "dq-04", type: "Múltipla escolha", statement: "Uma mensagem operacional deve ser:", options: ["Longa e informal", "Clara, objetiva e confirmada", "Sem identificação", "Transmitida apenas no fim do turno"], correct_index: 1, points: 1 },
        { id: "dq-05", type: "Múltipla escolha", statement: "QAP indica:", options: ["Escuta/atenção", "Fim de serviço", "Acesso liberado", "Falha elétrica"], correct_index: 0, points: 1 },
      ],
      created_at: iso,
    },
    {
      id: "demo-exam-03",
      title: "Resposta Inicial a Ocorrências",
      description: "Cenários demonstrativos de segurança.",
      exam_type: "Mista",
      target_sector: "Vigilância",
      min_approval_pct: 75,
      scheduled_date: today,
      status: "Publicada",
      question_count: 1,
      questions: [{ id: "dq-06", type: "Múltipla escolha", statement: "Ao identificar uma anormalidade, deve-se priorizar:", options: ["Registro, comunicação e resposta conforme procedimento", "Postagem em rede social", "Aguardar o próximo turno", "Apagar evidências"], correct_index: 0, points: 1 }],
      created_at: iso,
    },
  ];
}

function demoAttempts() {
  const { iso } = demoClock();
  return [
    { id: "demo-attempt-01", exam_id: "demo-exam-01", user_id: "demo-emp-01", matricula: "100101", score: 90, passed: true, certificate_code: "DEMO-CERT-001", signature_path: null, signature_name: "Operador Demo 01", signed_at: iso, signature_agreed: true, finished_at: iso, created_at: iso },
    { id: "demo-attempt-02", exam_id: "demo-exam-01", user_id: "demo-emp-02", matricula: "100102", score: 62, passed: false, certificate_code: null, signature_path: null, signature_name: null, signed_at: null, signature_agreed: false, finished_at: iso, created_at: iso },
    { id: "demo-attempt-03", exam_id: "demo-exam-02", user_id: "demo-emp-03", matricula: "100103", score: 85, passed: true, certificate_code: "DEMO-CERT-003", signature_path: null, signature_name: "Operador Demo 03", signed_at: iso, signature_agreed: true, finished_at: iso, created_at: iso },
    { id: "demo-attempt-04", exam_id: "demo-exam-02", user_id: "demo-emp-04", matricula: "100104", score: 78, passed: true, certificate_code: "DEMO-CERT-004", signature_path: null, signature_name: null, signed_at: null, signature_agreed: false, finished_at: iso, created_at: iso },
  ];
}

function demoCronograma() {
  const { month, today, iso } = demoClock();
  const rows = [
    ["01", "demo-emp-01", "Operador Demo 01", "100101", "CFTV", "Procedimentos de Controle de Acesso", "Realizado"],
    ["02", "demo-emp-02", "Operador Demo 02", "100102", "Vigilância", "Comunicação Operacional por Rádio", "Pendente"],
    ["03", "demo-emp-03", "Operador Demo 03", "100103", "Portaria", "Procedimentos de Controle de Acesso", "Realizado"],
    ["04", "demo-emp-04", "Operador Demo 04", "100104", "Ronda", "Resposta Inicial a Ocorrências", "Justificado"],
    ["05", "demo-emp-01", "Operador Demo 01", "100101", "CFTV", "Avaliação prática de rotina", "Pendente"],
    ["06", "demo-emp-02", "Operador Demo 02", "100102", "Vigilância", "Avaliação prática de abordagem", "Realizado"],
  ] as const;
  return rows.map(([suffix, employee_id, employee_name, employee_matricula, employee_sector, theme, status], index) => ({
    id: `demo-cron-${suffix}`,
    month,
    employee_id,
    employee_name,
    employee_matricula,
    employee_sector,
    theme,
    exam_id: index < 4 ? `demo-exam-0${(index % 3) + 1}` : null,
    exam_title: index < 4 ? theme : null,
    type: status === "Realizado" ? "Realizado" : "Planejado",
    status,
    justification: status === "Justificado" ? "Escala de serviço" : null,
    planned_date: `${month}-${pad(8 + index * 3)}`,
    completion_date: status === "Realizado" ? today : null,
    notes: index >= 4 ? `[PRACTICAL:demo-practical-0${index - 3}]` : "Registro demonstrativo",
    question_bank_ids: [],
    created_by: DEMO_USER.id,
    created_at: iso,
    updated_at: iso,
  }));
}

function demoKnowledge() {
  const { iso } = demoClock();
  return [
    { id: "demo-know-01", title: "Controle de Acesso — Procedimento Resumido", category: "Procedimento", content: "Conteúdo demonstrativo sobre identificação, validação, registro e comunicação no controle de acesso.", target_sector: "Todos", active: true, created_by: DEMO_USER.id, created_at: iso, updated_at: iso },
    { id: "demo-know-02", title: "Comunicação via Rádio", category: "Boas práticas", content: "Use mensagens curtas, objetivas, identificadas e confirme o recebimento das informações críticas.", target_sector: "Todos", active: true, created_by: DEMO_USER.id, created_at: iso, updated_at: iso },
    { id: "demo-know-03", title: "Rotina do CFTV", category: "Operação", content: "Exemplo demonstrativo de monitoramento, registro e escalonamento de eventos.", target_sector: "CFTV", active: true, created_by: DEMO_USER.id, created_at: iso, updated_at: iso },
  ];
}

function demoOccurrences() {
  const { iso } = demoClock();
  return [
    { id: "demo-occ-01", employee_id: "demo-emp-01", employee_name: "Operador Demo 01", employee_matricula: "100101", title: "Tentativa de acesso sem credencial", category: "Controle de acesso", severity: "Média", description: "Ocorrência fictícia criada exclusivamente para demonstração da interface.", location: "Portaria 01", status: "Concluída", occurred_at: iso, resolution_notes: "Acesso não autorizado e registro efetuado.", resolved_at: iso, created_by: DEMO_USER.id, created_by_name: DEMO_USER.nome, created_at: iso, updated_at: iso },
    { id: "demo-occ-02", employee_id: "demo-emp-02", employee_name: "Operador Demo 02", employee_matricula: "100102", title: "Falha temporária de comunicação", category: "Comunicação", severity: "Baixa", description: "Evento fictício para visualização do fluxo de tratamento.", location: "Área operacional", status: "Em análise", occurred_at: iso, resolution_notes: null, resolved_at: null, created_by: DEMO_USER.id, created_by_name: DEMO_USER.nome, created_at: iso, updated_at: iso },
  ];
}

function demoPracticals() {
  const { today, iso } = demoClock();
  return [
    { id: "demo-practical-01", employee_id: "demo-emp-01", employee_name: "Operador Demo 01", employee_matricula: "100101", employee_sector: "CFTV", title: "Rotina prática de monitoramento", evaluator_id: DEMO_USER.id, evaluator_name: DEMO_USER.nome, status: "Planejada", score: 0, max_score: 10, min_approval_score: 7, checklist: [{ id: "p1", label: "Identificação do evento", done: false }, { id: "p2", label: "Comunicação correta", done: false }], notes: "Avaliação demonstrativa", evaluation_date: today, completed_at: null, created_at: iso, updated_at: iso },
    { id: "demo-practical-02", employee_id: "demo-emp-02", employee_name: "Operador Demo 02", employee_matricula: "100102", employee_sector: "Vigilância", title: "Abordagem e comunicação", evaluator_id: DEMO_USER.id, evaluator_name: DEMO_USER.nome, status: "Concluída", score: 8.7, max_score: 10, min_approval_score: 7, checklist: [{ id: "p3", label: "Postura", done: true }, { id: "p4", label: "Comunicação", done: true }], notes: "Resultado fictício para demonstração", evaluation_date: today, completed_at: iso, created_at: iso, updated_at: iso },
  ];
}

function demoTrainingModules() {
  const { iso } = demoClock();
  return [
    { id: "demo-module-01", title: "Fundamentos de Segurança Portuária", description: "Módulo demonstrativo de fundamentos operacionais.", content: "Conteúdo de demonstração.", display_order: 1, min_score: 70, target_sector: "Todos", status: "Ativo", created_at: iso, updated_at: iso },
    { id: "demo-module-02", title: "Comunicação e Registro", description: "Módulo demonstrativo sobre comunicação operacional.", content: "Conteúdo de demonstração.", display_order: 2, min_score: 70, target_sector: "Todos", status: "Ativo", created_at: iso, updated_at: iso },
    { id: "demo-module-03", title: "Controle de Acesso", description: "Módulo demonstrativo de controle de acesso.", content: "Conteúdo de demonstração.", display_order: 3, min_score: 75, target_sector: "Portaria", status: "Ativo", created_at: iso, updated_at: iso },
  ];
}

function demoTrainingSchedules() {
  const { today, iso } = demoClock();
  return [
    { id: "demo-schedule-01", employee_id: "demo-emp-01", employee_name: "Operador Demo 01", employee_matricula: "100101", cycle_days: 90, last_training_date: today, window_start: null, window_end: null, observations: "Ciclo demonstrativo", status: "Em dia", created_at: iso, updated_at: iso },
    { id: "demo-schedule-02", employee_id: "demo-emp-02", employee_name: "Operador Demo 02", employee_matricula: "100102", cycle_days: 60, last_training_date: today, window_start: null, window_end: null, observations: "Ciclo demonstrativo", status: "Em dia", created_at: iso, updated_at: iso },
  ];
}

function demoTrainingActivities() {
  const { today, iso } = demoClock();
  return [
    { id: "demo-act-01", user_id: "demo-emp-01", employee_id: "demo-emp-01", employee_name: "Operador Demo 01", employee_matricula: "100101", employee_sector: "CFTV", activity_type: "Teste Rápido", activity_title: "Comunicação operacional", answers: {}, score: 8, max_score: 10, passed: true, points_earned: 20, activity_day: today, created_at: iso },
    { id: "demo-act-02", user_id: "demo-emp-02", employee_id: "demo-emp-02", employee_name: "Operador Demo 02", employee_matricula: "100102", employee_sector: "Vigilância", activity_type: "Simulador", activity_title: "Resposta a ocorrência", answers: {}, score: 9, max_score: 10, passed: true, points_earned: 30, activity_day: today, created_at: iso },
  ];
}

function demoQuestionBank() {
  const { iso } = demoClock();
  return [
    { id: "demo-bank-01", bank_type: "Múltipla escolha", question_text: "Qual conduta preserva melhor a rastreabilidade de uma ocorrência?", options: ["Não registrar", "Registrar e comunicar conforme procedimento", "Apagar imagens", "Aguardar vários dias"], correct_index: 1, correct_answer: null, explanation: "O registro e a comunicação preservam a rastreabilidade.", target_sector: "Todos", difficulty: "Média", theme: "Registro de ocorrências", active: true, created_at: iso },
    { id: "demo-bank-02", bank_type: "Múltipla escolha", question_text: "A comunicação operacional deve priorizar o quê?", options: ["Clareza e objetividade", "Gírias", "Mensagens longas", "Informações sem confirmação"], correct_index: 0, correct_answer: null, explanation: "Clareza reduz ambiguidades.", target_sector: "Todos", difficulty: "Fácil", theme: "Comunicação", active: true, created_at: iso },
    { id: "demo-bank-03", bank_type: "Múltipla escolha", question_text: "O controle de acesso deve validar:", options: ["Identidade e autorização", "Apenas o veículo", "Somente horário", "Nenhuma informação"], correct_index: 0, correct_answer: null, explanation: "Identidade e autorização são elementos essenciais.", target_sector: "Portaria", difficulty: "Fácil", theme: "Controle de acesso", active: true, created_at: iso },
  ];
}

function demoPracticalTemplates() {
  const { iso } = demoClock();
  return [
    { id: "demo-template-01", title: "Avaliação prática mensal", platform: "Operacional", description: "Modelo demonstrativo", target_sector: "Todos", min_approval_score: 7, recurrence: "monthly", applications_per_month: 1, tasks: [{ id: "t1", label: "Executar procedimento", done: false }], status: "Ativo", created_by: DEMO_USER.id, created_at: iso, updated_at: iso },
    { id: "demo-template-02", title: "Comunicação e resposta", platform: "Operacional", description: "Modelo demonstrativo trimestral", target_sector: "Vigilância", min_approval_score: 7.5, recurrence: "quarterly", applications_per_month: 1, tasks: [], status: "Ativo", created_by: DEMO_USER.id, created_at: iso, updated_at: iso },
  ];
}

function demoAudit() {
  const { iso } = demoClock();
  return [
    { id: "demo-audit-01", actor_id: DEMO_USER.id, action: "DEMO_LOGIN", entity: "session", entity_id: DEMO_USER.id, details: { demo: true, note: "Evento fictício" }, created_at: iso },
    { id: "demo-audit-02", actor_id: DEMO_USER.id, action: "VIEW_DASHBOARD", entity: "dashboard", entity_id: null, details: { demo: true }, created_at: iso },
    { id: "demo-audit-03", actor_id: DEMO_USER.id, action: "CRONOGRAMA_SYNC", entity: "cronograma", entity_id: "demo-cron-01", details: { demo: true }, created_at: iso },
  ];
}

function demoCertificateRecords() {
  const attempts = demoAttempts();
  const exams = demoExams();
  const employees = demoEmployees();
  return attempts.map((attempt) => {
    const exam = exams.find((item) => item.id === attempt.exam_id)!;
    const employee = employees.find((item) => item.matricula === attempt.matricula)!;
    return {
      ...attempt,
      exam_title: exam.title,
      exam_type: exam.exam_type,
      employee_name: employee?.full_name ?? "Profissional Demo",
      employee_sector: employee?.sector ?? "Todos",
      certificate_revoked: false,
      revoked_at: null,
      revoked_reason: null,
      formally_issued: Boolean(attempt.passed && attempt.certificate_code),
    };
  });
}

function genericWriteResult(init: RequestInit) {
  const body = bodyObject(init);
  const { month } = demoClock();
  return {
    ...body,
    id: typeof body.id === "string" ? body.id : `demo-${crypto.randomUUID()}`,
    ids: [],
    count: 0,
    changed: 0,
    success: true,
    month: typeof body.month === "string" ? body.month : month,
    created: 0,
    skipped: 0,
    suspended: 0,
    due_templates: 0,
    attempt_id: `demo-attempt-${Date.now()}`,
    score: 8,
    passed: true,
    points_earned: 20,
    new_points: 2470,
    level: 8,
  };
}

export async function demoApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const pathname = path.split("?")[0] || path;
  const exams = demoExams();

  if (pathname === "/api/auth/me" && method === "GET") return DEMO_USER as T;
  if (pathname === "/api/auth/logout" && method === "POST") {
    disableDemoMode();
    return undefined as T;
  }

  if (method === "GET") {
    if (pathname === "/api/employees/me") return demoEmployees()[0] as T;
    if (pathname === "/api/employees") return demoEmployees() as T;
    if (pathname === "/api/access/activation-codes") return demoEmployees().slice(1, 3).map((employee, index) => ({ employee_id: employee.id, employee_name: employee.full_name, matricula: employee.matricula, sector: employee.sector, expires_at: null, used_at: index ? demoClock().iso : null, created_at: demoClock().iso, has_account: Boolean(index), expired: false })) as T;

    if (pathname === "/api/me/exam-attempts" || pathname.startsWith("/api/me/exam-attempts/year/")) return demoAttempts() as T;
    if (pathname === "/api/me/certificate-states") return demoAttempts().filter((attempt) => attempt.certificate_code).map((attempt) => ({ attempt_id: attempt.id, verification_code: attempt.certificate_code, issued_at: attempt.finished_at, revoked: false, revoked_at: null, revoked_reason: null })) as T;
    if (pathname === "/api/admin/exam-attempts") return demoCertificateRecords() as T;
    if (/^\/api\/admin\/exam-attempts\/[^/]+\/evidence$/.test(pathname)) {
      const id = decodeURIComponent(pathname.split("/")[4] || "demo-attempt-01");
      const attempt = demoAttempts().find((item) => item.id === id) || demoAttempts()[0];
      const exam = exams.find((item) => item.id === attempt.exam_id) || exams[0];
      const employee = demoEmployees().find((item) => item.matricula === attempt.matricula) || demoEmployees()[1];
      return { attempt_id: attempt.id, exam_id: exam.id, exam_title: exam.title, employee_name: employee.full_name, matricula: employee.matricula, sector: employee.sector, score: attempt.score, passed: attempt.passed, certificate_code: attempt.certificate_code, finished_at: attempt.finished_at, signed_at: attempt.signed_at, signature_name: attempt.signature_name, total_questions: exam.questions.length, correct_count: Math.max(0, Math.round((attempt.score / 100) * exam.questions.length)), accuracy_pct: attempt.score, questions: exam.questions.map((question, index) => ({ id: question.id, order: index + 1, type: question.type, statement: question.statement, answer: question.options[question.correct_index] || "", correct: true })) } as T;
    }
    if (pathname === "/api/exams" || pathname === "/api/me/exams") return exams as T;
    if (pathname.startsWith("/api/me/exams/") || pathname.startsWith("/api/exams/")) {
      const id = decodeURIComponent(pathname.split("/").pop() || "");
      return (exams.find((item) => item.id === id) || exams[0]) as T;
    }

    if (pathname === "/api/cronograma/recurring-models") return [{ id: "demo-rec-01", theme: "Comunicação Operacional", target_sector: "Todos", recurrence: "monthly", active: true, created_by: DEMO_USER.id, created_by_name: DEMO_USER.nome, created_at: demoClock().iso, updated_at: demoClock().iso }] as T;
    if (pathname === "/api/cronograma/suspensions") return [] as T;
    if (pathname.startsWith("/api/cronograma/year/")) return demoCronograma() as T;
    if (pathname === "/api/cronograma") {
      const month = queryParam(path, "month");
      return demoCronograma().filter((entry) => !month || entry.month === month) as T;
    }

    if (pathname === "/api/operations/knowledge") return demoKnowledge() as T;
    if (pathname === "/api/operations/occurrences") return demoOccurrences() as T;
    if (pathname === "/api/operations/practical-evaluations" || pathname === "/api/me/practical-evaluations") return demoPracticals() as T;
    if (pathname === "/api/operations/practical-templates") return demoPracticalTemplates() as T;
    if (pathname === "/api/operations/audit") return demoAudit() as T;

    if (pathname === "/api/training/modules") return demoTrainingModules() as T;
    if (pathname === "/api/admin/training/schedules") return demoTrainingSchedules() as T;
    if (pathname === "/api/me/training/schedule") return demoTrainingSchedules()[0] as T;
    if (pathname === "/api/me/training/activities") return demoTrainingActivities() as T;

    if (pathname === "/api/question-bank") return demoQuestionBank() as T;
    if (pathname === "/api/question-bank/operational") return demoQuestionBank().map(({ correct_index: _correctIndex, correct_answer: _correctAnswer, explanation: _explanation, ...item }) => item) as T;

    return [] as T;
  }

  if (method === "DELETE") return undefined as T;
  return genericWriteResult(init) as T;
}
