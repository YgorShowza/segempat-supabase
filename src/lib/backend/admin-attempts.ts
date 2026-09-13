import { apiRequest } from "./api-client";
import type { ExamAttempt } from "@/lib/exams";
import { isDemoModeEnabled } from "@/lib/demo-mode";

function demoAttemptDate(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function demoPerformanceAttempts(): ExamAttempt[] {
  const base = {
    user_id: "demo-emp-01",
    matricula: "100101",
    signature_path: null,
    signature_name: null,
    signed_at: null,
    signature_agreed: false,
  } as const;

  return [
    {
      ...base,
      id: "demo-attempt-perf-01",
      exam_id: "demo-exam-03",
      score: 5.8,
      passed: false,
      certificate_code: null,
      finished_at: demoAttemptDate(60),
      created_at: demoAttemptDate(60),
    },
    {
      ...base,
      id: "demo-attempt-perf-02",
      exam_id: "demo-exam-01",
      score: 6.6,
      passed: false,
      certificate_code: null,
      finished_at: demoAttemptDate(40),
      created_at: demoAttemptDate(40),
    },
    {
      ...base,
      id: "demo-attempt-perf-03",
      exam_id: "demo-exam-01",
      score: 7.6,
      passed: true,
      certificate_code: "DEMO-CERT-PERF-003",
      finished_at: demoAttemptDate(25),
      created_at: demoAttemptDate(25),
    },
    {
      ...base,
      id: "demo-attempt-perf-04",
      exam_id: "demo-exam-02",
      score: 8.8,
      passed: true,
      certificate_code: "DEMO-CERT-PERF-004",
      finished_at: demoAttemptDate(8),
      created_at: demoAttemptDate(8),
    },
  ];
}

function normalizeDemoScore(attempt: ExamAttempt): ExamAttempt {
  const score = Number(attempt.score || 0);
  if (!Number.isFinite(score) || score <= 10) return attempt;
  return { ...attempt, score: Math.round(score) / 10 };
}

export async function listAdminAttemptsByYear(year: number): Promise<ExamAttempt[]> {
  const attempts = await apiRequest<ExamAttempt[]>(`/api/admin/exam-attempts?year=${encodeURIComponent(String(year))}`);
  if (!isDemoModeEnabled() || year !== new Date().getFullYear()) return attempts;

  const normalized = attempts.map(normalizeDemoScore);
  return [
    ...normalized.filter((attempt) => attempt.matricula !== "100101"),
    ...demoPerformanceAttempts(),
  ];
}
