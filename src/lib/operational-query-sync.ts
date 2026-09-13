import type { QueryClient } from "@tanstack/react-query";

const SNAPSHOT_ROOTS = [
  "admin-snapshot",
  "operational-snapshot",
  "individual-snapshot",
  "reports-snapshot",
  "monthly-report-snapshot",
  "risk-snapshot",
] as const;

const CRONOGRAMA_ROOTS = [
  "cronograma",
  "cronograma-year",
  "cronograma-recurring",
  "cronograma-suspensions",
  "cronograma-parity-month",
  "cronograma-parity-year",
  "cronograma-parity-susp",
  "my-pending",
  "panel-cron",
  "my-progress-cron",
] as const;

const EXAM_ROOTS = [
  "exams",
  "operator-exam-attempts",
  "exam-attempts-my",
  "my-progress-attempts",
  "panel-attempts",
  "my-cert-attempts",
  "available-exams-certificates",
  "panel-available-exams",
  "my-pending-available-exams",
] as const;

async function invalidateRoots(queryClient: QueryClient, roots: readonly string[]) {
  await Promise.all(roots.map((root) => queryClient.invalidateQueries({ queryKey: [root] })));
}

export async function invalidateOperationalSnapshots(queryClient: QueryClient) {
  await invalidateRoots(queryClient, SNAPSHOT_ROOTS);
}

export async function invalidateCronogramaFlow(queryClient: QueryClient) {
  await Promise.all([
    invalidateRoots(queryClient, CRONOGRAMA_ROOTS),
    invalidateOperationalSnapshots(queryClient),
  ]);
}

export async function invalidateExamFlow(queryClient: QueryClient) {
  await Promise.all([
    invalidateRoots(queryClient, EXAM_ROOTS),
    invalidateRoots(queryClient, CRONOGRAMA_ROOTS),
    invalidateOperationalSnapshots(queryClient),
  ]);
}

export async function invalidateEmployeeFlow(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["employees"] }),
    queryClient.invalidateQueries({ queryKey: ["current-user"] }),
    invalidateRoots(queryClient, CRONOGRAMA_ROOTS),
    invalidateOperationalSnapshots(queryClient),
  ]);
}
