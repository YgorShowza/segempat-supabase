import { operationalMonth, operationalYear } from "@/lib/operational-time";
import {
  employeeRisk,
  getOperationalSnapshot,
  monthlyExecution,
  sectorMetrics,
  snapshotMetrics,
  type OperationalSnapshot,
} from "@/lib/insights";
import { listOccurrences, type Occurrence } from "@/lib/occurrences";
import { listPracticalEvaluations, type PracticalEvaluation } from "@/lib/operations";
import { isDemoModeEnabled } from "@/lib/demo-mode";

export type OperationLevel = "Normal" | "Atenção" | "Crítica";

export interface TvMonthPoint {
  month: string;
  label: string;
  executionRate: number;
  averageScore: number;
  approvalRate: number;
  attempts: number;
}

export interface TvSectorPoint {
  sector: string;
  executionRate: number;
  approvalRate: number;
  employees: number;
  planned: number;
  realized: number;
}

export interface TvAttentionItem {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface TvDashboardData {
  year: number;
  generatedAt: string;
  isDemo: boolean;
  level: OperationLevel;
  levelReason: string;
  metrics: {
    activeEmployees: number;
    monthExecutionRate: number;
    annualExecutionRate: number;
    pending: number;
    overdue: number;
    approvalRate: number;
    averageScore: number;
    activeOccurrences: number;
    criticalOccurrences: number;
    practicalPending: number;
    practicalApprovalRate: number;
  };
  risk: {
    normal: number;
    low: number;
    medium: number;
    high: number;
  };
  occurrence: {
    open: number;
    analysis: number;
    concluded: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  practical: {
    planned: number;
    running: number;
    concluded: number;
    approved: number;
    approvalRate: number;
  };
  months: TvMonthPoint[];
  sectors: TvSectorPoint[];
  attention: TvAttentionItem[];
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function score10(value: number) {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) return 0;
  return Math.round((score > 10 ? score / 10 : score) * 10) / 10;
}

function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number);
  if (!year || !index) return month;
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Maceio" })
    .format(new Date(Date.UTC(year, index - 1, 15)))
    .replace(".", "")
    .toUpperCase();
}

function attemptMonth(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}`;
}

function performanceByMonth(snapshot: OperationalSnapshot, year: number) {
  const byMonth = new Map<string, { scores: number[]; passed: number }>();
  for (const attempt of snapshot.attempts) {
    const month = attemptMonth(attempt.finished_at || attempt.created_at);
    if (!month.startsWith(`${year}-`)) continue;
    const current = byMonth.get(month) ?? { scores: [], passed: 0 };
    current.scores.push(score10(Number(attempt.score || 0)));
    if (attempt.passed) current.passed += 1;
    byMonth.set(month, current);
  }
  return byMonth;
}

function demoTrend(months: TvMonthPoint[]) {
  const currentIndex = Math.max(0, months.findIndex((point) => point.month === operationalMonth()));
  const values = [
    { executionRate: 68, averageScore: 6.8, approvalRate: 64, attempts: 8 },
    { executionRate: 72, averageScore: 7.1, approvalRate: 69, attempts: 9 },
    { executionRate: 76, averageScore: 7.3, approvalRate: 72, attempts: 10 },
    { executionRate: 81, averageScore: 7.6, approvalRate: 78, attempts: 11 },
    { executionRate: 84, averageScore: 7.9, approvalRate: 82, attempts: 12 },
    { executionRate: 88, averageScore: 8.2, approvalRate: 86, attempts: 12 },
  ];
  const start = Math.max(0, currentIndex - values.length + 1);
  return months.map((point, index) => {
    if (index < start || index > currentIndex) return point;
    const value = values[index - start + (values.length - (currentIndex - start + 1))];
    return value ? { ...point, ...value } : point;
  });
}

function buildMonths(snapshot: OperationalSnapshot, year: number) {
  const execution = monthlyExecution(snapshot, year);
  const performance = performanceByMonth(snapshot, year);
  let months: TvMonthPoint[] = execution.map((month) => {
    const key = month.month;
    const perf = performance.get(key);
    const averageScore = perf?.scores.length
      ? Math.round((perf.scores.reduce((sum, score) => sum + score, 0) / perf.scores.length) * 10) / 10
      : 0;
    const approvalRate = perf?.scores.length ? Math.round(((perf.passed || 0) / perf.scores.length) * 100) : 0;
    return {
      month: key,
      label: monthLabel(key),
      executionRate: clamp(month.rate),
      averageScore,
      approvalRate,
      attempts: perf?.scores.length ?? 0,
    };
  });

  if (isDemoModeEnabled()) months = demoTrend(months);
  return months;
}

function buildOccurrenceStats(rows: Occurrence[]) {
  return {
    open: rows.filter((row) => row.status === "Aberta").length,
    analysis: rows.filter((row) => row.status === "Em análise").length,
    concluded: rows.filter((row) => row.status === "Concluída").length,
    low: rows.filter((row) => row.severity === "Baixa").length,
    medium: rows.filter((row) => row.severity === "Média").length,
    high: rows.filter((row) => row.severity === "Alta").length,
    critical: rows.filter((row) => row.severity === "Crítica").length,
  };
}

function practicalApproved(row: PracticalEvaluation) {
  const max = Number(row.max_score || 10);
  const normalized = max > 0 ? (Number(row.score || 0) / max) * 10 : 0;
  return normalized >= Number(row.min_approval_score ?? 7);
}

function buildPracticalStats(rows: PracticalEvaluation[]) {
  const concluded = rows.filter((row) => row.status === "Concluída");
  const approved = concluded.filter(practicalApproved).length;
  return {
    planned: rows.filter((row) => row.status === "Planejada").length,
    running: rows.filter((row) => row.status === "Em andamento").length,
    concluded: concluded.length,
    approved,
    approvalRate: concluded.length ? Math.round((approved / concluded.length) * 100) : 0,
  };
}

function buildAttention(input: {
  overdue: number;
  pending: number;
  riskHigh: number;
  riskMedium: number;
  occurrenceActive: number;
  occurrenceCritical: number;
  practicalPending: number;
  approvalRate: number;
  executionRate: number;
}) {
  const items: TvAttentionItem[] = [];
  if (input.occurrenceCritical > 0) items.push({ id: "occ-critical", level: "critical", title: "Ocorrência crítica ativa", detail: `${input.occurrenceCritical} registro(s) exigem prioridade operacional.` });
  if (input.riskHigh > 0) items.push({ id: "risk-high", level: "critical", title: "Risco de desempenho elevado", detail: `${input.riskHigh} profissional(is) no nível Alto.` });
  if (input.overdue > 0) items.push({ id: "overdue", level: "warning", title: "Atividades vencidas", detail: `${input.overdue} item(ns) do cronograma estão fora do prazo.` });
  if (input.occurrenceActive > 0) items.push({ id: "occ-active", level: "warning", title: "Ocorrências em tratamento", detail: `${input.occurrenceActive} ocorrência(s) abertas ou em análise.` });
  if (input.practicalPending > 0) items.push({ id: "practical", level: "warning", title: "Avaliações práticas pendentes", detail: `${input.practicalPending} avaliação(ões) aguardam execução/conclusão.` });
  if (input.riskMedium > 0) items.push({ id: "risk-medium", level: "warning", title: "Acompanhamento recomendado", detail: `${input.riskMedium} profissional(is) em risco Médio.` });
  if (input.executionRate < 80) items.push({ id: "execution", level: "warning", title: "Ritmo de execução abaixo da meta", detail: `Execução anual em ${input.executionRate}%.` });
  if (input.approvalRate < 75) items.push({ id: "approval", level: "warning", title: "Aprovação requer atenção", detail: `Taxa geral de aprovação em ${input.approvalRate}%.` });
  if (!items.length) items.push({ id: "stable", level: "info", title: "Operação dentro do esperado", detail: "Nenhum alerta agregado relevante no momento." });
  return items.slice(0, 4);
}

export async function getTvDashboardData(year = operationalYear()): Promise<TvDashboardData> {
  const [snapshot, occurrences, practicalRows] = await Promise.all([
    getOperationalSnapshot(year),
    listOccurrences(),
    listPracticalEvaluations(),
  ]);

  const metrics = snapshotMetrics(snapshot);
  const sectors = sectorMetrics(snapshot)
    .sort((a, b) => b.employees - a.employees || b.executionRate - a.executionRate)
    .map((sector) => ({
      sector: sector.sector,
      executionRate: clamp(sector.executionRate),
      approvalRate: clamp(sector.approvalRate),
      employees: sector.employees,
      planned: sector.planned,
      realized: sector.realized,
    }));
  const risks = employeeRisk(snapshot);
  const risk = {
    normal: risks.filter((row) => row.level === "Normal").length,
    low: risks.filter((row) => row.level === "Baixo").length,
    medium: risks.filter((row) => row.level === "Médio").length,
    high: risks.filter((row) => row.level === "Alto").length,
  };
  const overdue = risks.reduce((sum, row) => sum + row.overdue, 0);
  const occurrence = buildOccurrenceStats(occurrences);
  const activeOccurrences = occurrence.open + occurrence.analysis;
  const criticalActive = occurrences.filter((row) => row.status !== "Concluída" && row.severity === "Crítica").length;
  const practical = buildPracticalStats(practicalRows);
  const practicalPending = practical.planned + practical.running;
  const currentMonth = operationalMonth();
  const monthEntries = snapshot.cronograma.filter((entry) => entry.month === currentMonth);
  const monthRealized = monthEntries.filter((entry) => entry.status === "Realizado").length;
  const monthExecutionRate = monthEntries.length ? Math.round((monthRealized / monthEntries.length) * 100) : 0;

  let level: OperationLevel = "Normal";
  let levelReason = "Indicadores agregados dentro do esperado.";
  if (criticalActive > 0 || risk.high > 0) {
    level = "Crítica";
    levelReason = criticalActive > 0 ? "Há ocorrência crítica ativa." : "Há profissional em risco de desempenho Alto.";
  } else if (overdue > 0 || activeOccurrences > 0 || practicalPending > 0 || metrics.executionRate < 80 || risk.medium > 0) {
    level = "Atenção";
    levelReason = overdue > 0 ? "Existem atividades vencidas no cronograma." : "Existem pontos operacionais que exigem acompanhamento.";
  }

  const attention = buildAttention({
    overdue,
    pending: metrics.pending,
    riskHigh: risk.high,
    riskMedium: risk.medium,
    occurrenceActive: activeOccurrences,
    occurrenceCritical: criticalActive,
    practicalPending,
    approvalRate: metrics.approvalRate,
    executionRate: metrics.executionRate,
  });

  return {
    year,
    generatedAt: new Date().toISOString(),
    isDemo: isDemoModeEnabled(),
    level,
    levelReason,
    metrics: {
      activeEmployees: metrics.activeEmployees,
      monthExecutionRate,
      annualExecutionRate: metrics.executionRate,
      pending: metrics.pending,
      overdue,
      approvalRate: metrics.approvalRate,
      averageScore: score10(metrics.averageScore),
      activeOccurrences,
      criticalOccurrences: criticalActive,
      practicalPending,
      practicalApprovalRate: practical.approvalRate,
    },
    risk,
    occurrence,
    practical,
    months: buildMonths(snapshot, year),
    sectors,
    attention,
  };
}
