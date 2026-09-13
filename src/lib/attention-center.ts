import { getOperationalSnapshot, employeeRisk } from "@/lib/insights";
import { listOccurrences } from "@/lib/occurrences";
import { listPracticalEvaluations } from "@/lib/operations";
import { listCertificateRecords } from "@/lib/certificate-records";
import { deriveTrainingStatus, listTrainingSchedules } from "@/lib/training-schedules";
import { getAttentionSupport } from "@/lib/backend/insights-gateway";
import { isSegempatApiConfigured } from "@/lib/backend/api-client";
import { addOperationalDays, operationalDate, operationalYear } from "@/lib/operational-time";

export type AttentionPriority = "critical" | "attention" | "monitor";
export type AttentionCategory = "Cronograma" | "Equipe" | "Ocorrências" | "Avaliação Prática" | "Certificados" | "Treinamento";

export interface AttentionItem {
  id: string;
  priority: AttentionPriority;
  category: AttentionCategory;
  title: string;
  description: string;
  context: string | null;
  date: string | null;
  href: string;
  actionLabel: string;
  sortWeight: number;
}

export interface AttentionSourceStatus {
  source: AttentionCategory;
  ok: boolean;
}

export interface AttentionCenterSnapshot {
  generatedAt: string;
  items: AttentionItem[];
  sourceStatus: AttentionSourceStatus[];
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function employeeContext(name: string | null | undefined, matricula: string | null | undefined, sector?: string | null) {
  const parts = [name || null, matricula ? `Mat. ${matricula}` : null, sector || null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

async function safe<T>(loader: () => Promise<T>, fallback: T): Promise<{ data: T; ok: boolean }> {
  try {
    return { data: await loader(), ok: true };
  } catch (error) {
    console.error("Falha parcial ao consolidar Central de Atenção", error);
    return { data: fallback, ok: false };
  }
}

export async function getInspectorAttentionCenter(year = operationalYear()): Promise<AttentionCenterSnapshot> {
  const today = operationalDate();
  const nextSeven = addOperationalDays(today, 7);
  const corporateApi = isSegempatApiConfigured();

  const [snapshotResult, occurrencesResult, practicalResult, supportResult] = await Promise.all([
    safe(() => getOperationalSnapshot(year), null),
    safe(() => listOccurrences(), []),
    safe(() => listPracticalEvaluations(), []),
    corporateApi ? safe(() => getAttentionSupport(), null) : Promise.resolve(null),
  ]);

  const certificatesResult = supportResult
    ? {
        data: (supportResult.data?.certificates ?? []).map((record) => ({ ...record, has_signature: Boolean(record.has_signature) })),
        ok: supportResult.ok,
      }
    : await safe(
        async () => (await listCertificateRecords()).map((record) => ({ ...record, has_signature: Boolean(record.signature_path) })),
        [],
      );

  const trainingResult = supportResult
    ? {
        data: (supportResult.data?.training ?? []).map((schedule) => ({ ...schedule, status: deriveTrainingStatus(schedule) })),
        ok: supportResult.ok,
      }
    : await safe(() => listTrainingSchedules(), []);

  const items: AttentionItem[] = [];
  const snapshot = snapshotResult.data;

  if (snapshot) {
    const activeEmployees = snapshot.employees.filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor");
    const activeIds = new Set(activeEmployees.map((employee) => employee.id));
    const activeMatriculas = new Set(activeEmployees.map((employee) => employee.matricula));
    const employeeById = new Map(activeEmployees.map((employee) => [employee.id, employee]));
    const employeeByMatricula = new Map(activeEmployees.map((employee) => [employee.matricula, employee]));

    const overdueByEmployee = new Map<string, typeof snapshot.cronograma>();
    const upcomingByEmployee = new Map<string, typeof snapshot.cronograma>();

    for (const entry of snapshot.cronograma) {
      if (entry.status !== "Pendente") continue;
      if (!activeIds.has(entry.employee_id) && !activeMatriculas.has(entry.employee_matricula)) continue;
      const employee = employeeById.get(entry.employee_id) ?? employeeByMatricula.get(entry.employee_matricula);
      if (!employee) continue;
      const planned = dateOnly(entry.planned_date);
      if (!planned) continue;
      if (planned < today) {
        const rows = overdueByEmployee.get(employee.id) ?? [];
        rows.push(entry);
        overdueByEmployee.set(employee.id, rows);
      } else if (planned <= nextSeven) {
        const rows = upcomingByEmployee.get(employee.id) ?? [];
        rows.push(entry);
        upcomingByEmployee.set(employee.id, rows);
      }
    }

    for (const [employeeId, rows] of overdueByEmployee) {
      const employee = employeeById.get(employeeId);
      if (!employee) continue;
      const firstDate = rows.map((entry) => dateOnly(entry.planned_date)).filter(Boolean).sort()[0] ?? null;
      items.push({
        id: `cron-overdue-${employeeId}`,
        priority: "critical",
        category: "Cronograma",
        title: `${rows.length} atividade${rows.length === 1 ? "" : "s"} vencida${rows.length === 1 ? "" : "s"}`,
        description: rows.length === 1 ? rows[0].theme : `Há ${rows.length} atividades do cronograma com data prevista ultrapassada.`,
        context: employeeContext(employee.full_name, employee.matricula, employee.sector),
        date: firstDate,
        href: "/cronograma",
        actionLabel: "Abrir Cronograma",
        sortWeight: 100,
      });
    }

    for (const [employeeId, rows] of upcomingByEmployee) {
      if (overdueByEmployee.has(employeeId)) continue;
      const employee = employeeById.get(employeeId);
      if (!employee) continue;
      const firstDate = rows.map((entry) => dateOnly(entry.planned_date)).filter(Boolean).sort()[0] ?? null;
      items.push({
        id: `cron-upcoming-${employeeId}`,
        priority: "monitor",
        category: "Cronograma",
        title: `${rows.length} atividade${rows.length === 1 ? "" : "s"} nos próximos 7 dias`,
        description: rows.length === 1 ? rows[0].theme : "O colaborador possui atividades programadas para a próxima semana.",
        context: employeeContext(employee.full_name, employee.matricula, employee.sector),
        date: firstDate,
        href: "/cronograma",
        actionLabel: "Ver programação",
        sortWeight: 30,
      });
    }

    for (const risk of employeeRisk(snapshot)) {
      if (risk.level === "Normal") continue;
      const priority: AttentionPriority = risk.level === "Alto" ? "critical" : risk.level === "Médio" ? "attention" : "monitor";
      items.push({
        id: `risk-${risk.employee.id}`,
        priority,
        category: "Equipe",
        title: `Colaborador em risco ${risk.level.toLowerCase()}`,
        description: `${risk.pending} pendência(s), ${risk.overdue} vencida(s) e ${risk.failed} avaliação(ões) ainda sem aprovação.`,
        context: employeeContext(risk.employee.full_name, risk.employee.matricula, risk.employee.sector),
        date: null,
        href: "/risco",
        actionLabel: "Abrir Zona de Risco",
        sortWeight: priority === "critical" ? 95 : priority === "attention" ? 65 : 25,
      });
    }
  }

  for (const occurrence of occurrencesResult.data) {
    if (occurrence.status === "Concluída") continue;
    const priority: AttentionPriority = occurrence.severity === "Crítica" ? "critical" : occurrence.severity === "Alta" ? "attention" : "monitor";
    if (priority === "monitor" && occurrence.status === "Aberta" && occurrence.severity === "Baixa") continue;
    items.push({
      id: `occurrence-${occurrence.id}`,
      priority,
      category: "Ocorrências",
      title: occurrence.title,
      description: `${occurrence.severity} · ${occurrence.status}${occurrence.current_situation ? ` · ${occurrence.current_situation}` : ""}`,
      context: [occurrence.location, occurrence.category].filter(Boolean).join(" · ") || null,
      date: dateOnly(occurrence.occurred_at),
      href: "/ocorrencias",
      actionLabel: "Abrir ocorrência",
      sortWeight: priority === "critical" ? 110 : priority === "attention" ? 75 : 35,
    });
  }

  for (const practical of practicalResult.data) {
    if (practical.status === "Concluída") continue;
    const due = dateOnly(practical.evaluation_date);
    const overdue = Boolean(due && due < today);
    const upcoming = Boolean(due && due >= today && due <= nextSeven);
    if (!overdue && !upcoming && practical.status !== "Em andamento") continue;
    const priority: AttentionPriority = overdue ? "critical" : practical.status === "Em andamento" ? "attention" : "monitor";
    items.push({
      id: `practical-${practical.id}`,
      priority,
      category: "Avaliação Prática",
      title: overdue ? "Avaliação prática vencida" : practical.status === "Em andamento" ? "Avaliação prática em andamento" : "Avaliação prática próxima",
      description: practical.title,
      context: employeeContext(practical.employee_name, practical.employee_matricula, practical.employee_sector),
      date: due,
      href: "/avaliacao-pratica",
      actionLabel: "Abrir avaliação",
      sortWeight: overdue ? 105 : practical.status === "Em andamento" ? 70 : 28,
    });
  }

  for (const certificate of certificatesResult.data) {
    if (!certificate.passed || certificate.certificate_revoked || certificate.formally_issued) continue;
    const missingSignature = !certificate.signature_agreed || !certificate.has_signature;
    items.push({
      id: `certificate-${certificate.id}`,
      priority: "attention",
      category: "Certificados",
      title: missingSignature ? "Aprovação aguardando assinatura" : "Certificado aguardando emissão formal",
      description: certificate.exam_title,
      context: employeeContext(certificate.employee_name, certificate.matricula, certificate.employee_sector),
      date: dateOnly(certificate.finished_at),
      href: "/assinaturas-provas",
      actionLabel: "Revisar certificado",
      sortWeight: missingSignature ? 62 : 58,
    });
  }

  for (const schedule of trainingResult.data) {
    if (schedule.status === "Em dia") continue;
    const priority: AttentionPriority = schedule.status === "Vencido" ? "critical" : "attention";
    items.push({
      id: `training-${schedule.id}`,
      priority,
      category: "Treinamento",
      title: schedule.status === "Vencido" ? "Ciclo de treinamento vencido" : "Ciclo próximo ao vencimento",
      description: schedule.window_end ? `Janela de treinamento até ${schedule.window_end}` : "Ciclo sem janela válida de treinamento.",
      context: employeeContext(schedule.employee_name, schedule.employee_matricula, null),
      date: dateOnly(schedule.window_end),
      href: "/ciclos-treinamento",
      actionLabel: "Abrir ciclos",
      sortWeight: priority === "critical" ? 102 : 60,
    });
  }

  const sourceStatus: AttentionSourceStatus[] = [
    { source: "Cronograma", ok: snapshotResult.ok },
    { source: "Equipe", ok: snapshotResult.ok },
    { source: "Ocorrências", ok: occurrencesResult.ok },
    { source: "Avaliação Prática", ok: practicalResult.ok },
    { source: "Certificados", ok: certificatesResult.ok },
    { source: "Treinamento", ok: trainingResult.ok },
  ];

  items.sort((a, b) => b.sortWeight - a.sortWeight || String(a.date ?? "9999-12-31").localeCompare(String(b.date ?? "9999-12-31")) || a.title.localeCompare(b.title, "pt-BR"));

  return { generatedAt: new Date().toISOString(), items, sourceStatus };
}
