import type { ExamAttempt } from "@/lib/exams";
import type { CronogramaEntry } from "@/lib/cronograma";
import type { Employee } from "@/lib/employees";
import type { OperationalSnapshot } from "@/lib/insights";
import { operationalDate, operationalMonth } from "@/lib/operational-time";

export type ReportingSummary = {
  activeEmployees: number;
  planned: number;
  realized: number;
  pending: number;
  justified: number;
  executionRate: number | null;
  attempts: number;
  passed: number;
  approvalRate: number | null;
  averageScore: number | null;
};

export type MonthlyReportingRow = {
  month: string;
  label: string;
  planned: number;
  realized: number;
  pending: number;
  justified: number;
  executionRate: number | null;
  attempts: number;
  passed: number;
  approvalRate: number | null;
  averageScore: number | null;
};

export type SectorReportingRow = ReportingSummary & { sector: string };

export type ExamReportingRow = {
  examId: string;
  title: string;
  type: string;
  targetSector: string;
  minApprovalPct: number;
  attempts: number;
  passed: number;
  approvalRate: number | null;
  averageScore: number | null;
  lastAttemptAt: string | null;
};

export type MonthlyEmployeeRow = {
  employee: Employee;
  attemptsMonth: Array<ExamAttempt & { examTitle: string; examType: string }>;
  cron: CronogramaEntry[];
  realized: number;
  pending: number;
  overdue: number;
  justified: number;
  executionRate: number | null;
  passed: number;
  approvalRate: number | null;
  averageScore: number | null;
};

export function normalizeReportingText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizeReportingMatricula(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

function mean(attempts: ExamAttempt[]) {
  if (!attempts.length) return null;
  return Math.round((attempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / attempts.length) * 10) / 10;
}

function activeEmployees(data: OperationalSnapshot, sector = "Todos") {
  return data.employees.filter(
    (employee) =>
      employee.status === "Ativo" &&
      employee.access_profile !== "Inspetor" &&
      (sector === "Todos" || employee.sector === sector),
  );
}

export function availableReportingSectors(data: OperationalSnapshot) {
  return Array.from(new Set(activeEmployees(data).map((employee) => employee.sector))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function reportingScope(data: OperationalSnapshot, sector = "Todos") {
  const employees = activeEmployees(data, sector);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const matriculas = new Set(employees.map((employee) => normalizeReportingMatricula(employee.matricula)).filter(Boolean));
  const cronograma = data.cronograma.filter(
    (entry) => employeeIds.has(entry.employee_id) || matriculas.has(normalizeReportingMatricula(entry.employee_matricula)),
  );
  const attempts = data.attempts.filter(
    (attempt) => Boolean(attempt.matricula) && matriculas.has(normalizeReportingMatricula(attempt.matricula)),
  );
  return { employees, cronograma, attempts };
}

function summarize(employees: Employee[], cronograma: CronogramaEntry[], attempts: ExamAttempt[]): ReportingSummary {
  const realized = cronograma.filter((entry) => entry.status === "Realizado").length;
  const pending = cronograma.filter((entry) => entry.status === "Pendente").length;
  const justified = cronograma.filter((entry) => entry.status === "Justificado").length;
  const passed = attempts.filter((attempt) => attempt.passed).length;
  return {
    activeEmployees: employees.length,
    planned: cronograma.length,
    realized,
    pending,
    justified,
    executionRate: percent(realized, cronograma.length),
    attempts: attempts.length,
    passed,
    approvalRate: percent(passed, attempts.length),
    averageScore: mean(attempts),
  };
}

export function reportingSummary(data: OperationalSnapshot, sector = "Todos") {
  const scope = reportingScope(data, sector);
  return summarize(scope.employees, scope.cronograma, scope.attempts);
}

export function monthlyReporting(data: OperationalSnapshot, year: number, sector = "Todos"): MonthlyReportingRow[] {
  const scope = reportingScope(data, sector);
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const cronograma = scope.cronograma.filter((entry) => entry.month === month);
    const attempts = scope.attempts.filter((attempt) => {
      const value = attempt.finished_at || attempt.created_at;
      return value ? operationalMonth(new Date(value)) === month : false;
    });
    const summary = summarize(scope.employees, cronograma, attempts);
    return {
      month,
      label: new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Maceio" }).replace(".", ""),
      planned: summary.planned,
      realized: summary.realized,
      pending: summary.pending,
      justified: summary.justified,
      executionRate: summary.executionRate,
      attempts: summary.attempts,
      passed: summary.passed,
      approvalRate: summary.approvalRate,
      averageScore: summary.averageScore,
    };
  });
}

export function sectorReporting(data: OperationalSnapshot): SectorReportingRow[] {
  return availableReportingSectors(data).map((sector) => ({ sector, ...reportingSummary(data, sector) }));
}

export function examReporting(data: OperationalSnapshot, sector = "Todos"): ExamReportingRow[] {
  const scope = reportingScope(data, sector);
  const examById = new Map(data.exams.map((exam) => [exam.id, exam]));
  const grouped = new Map<string, ExamAttempt[]>();
  for (const attempt of scope.attempts) {
    const current = grouped.get(attempt.exam_id) ?? [];
    current.push(attempt);
    grouped.set(attempt.exam_id, current);
  }

  return Array.from(grouped.entries())
    .map(([examId, attempts]) => {
      const exam = examById.get(examId);
      const passed = attempts.filter((attempt) => attempt.passed).length;
      const ordered = [...attempts].sort((a, b) => String(b.finished_at || b.created_at).localeCompare(String(a.finished_at || a.created_at)));
      return {
        examId,
        title: exam?.title ?? "Avaliação não identificada",
        type: exam?.exam_type ?? "—",
        targetSector: exam?.target_sector ?? "—",
        minApprovalPct: Number(exam?.min_approval_pct ?? 70),
        attempts: attempts.length,
        passed,
        approvalRate: percent(passed, attempts.length),
        averageScore: mean(attempts),
        lastAttemptAt: ordered[0]?.finished_at || ordered[0]?.created_at || null,
      };
    })
    .sort((a, b) => b.attempts - a.attempts || a.title.localeCompare(b.title, "pt-BR"));
}

export function monthlyEmployeeRows(data: OperationalSnapshot, month: string): MonthlyEmployeeRow[] {
  const examById = new Map(data.exams.map((exam) => [exam.id, exam]));
  const nowMonth = operationalMonth();
  const today = operationalDate();

  return activeEmployees(data)
    .map((employee) => {
      const matricula = normalizeReportingMatricula(employee.matricula);
      const attemptsMonth = data.attempts
        .filter((attempt) => normalizeReportingMatricula(attempt.matricula) === matricula)
        .filter((attempt) => {
          const value = attempt.finished_at || attempt.created_at;
          return value ? operationalMonth(new Date(value)) === month : false;
        })
        .map((attempt) => {
          const exam = examById.get(attempt.exam_id);
          return { ...attempt, examTitle: exam?.title ?? "Avaliação", examType: exam?.exam_type ?? "—" };
        });
      const cron = data.cronograma.filter(
        (entry) =>
          (entry.employee_id === employee.id || normalizeReportingMatricula(entry.employee_matricula) === matricula) &&
          entry.month === month,
      );
      const realized = cron.filter((entry) => entry.status === "Realizado").length;
      const pendingEntries = cron.filter((entry) => entry.status === "Pendente");
      const pending = pendingEntries.length;
      const overdue = pendingEntries.filter(
        (entry) => entry.month < nowMonth || (entry.month === nowMonth && Boolean(entry.planned_date) && String(entry.planned_date) < today),
      ).length;
      const justified = cron.filter((entry) => entry.status === "Justificado").length;
      const passed = attemptsMonth.filter((attempt) => attempt.passed).length;
      return {
        employee,
        attemptsMonth,
        cron,
        realized,
        pending,
        overdue,
        justified,
        executionRate: percent(realized, cron.length),
        passed,
        approvalRate: percent(passed, attemptsMonth.length),
        averageScore: mean(attemptsMonth),
      };
    })
    .sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name, "pt-BR"));
}
