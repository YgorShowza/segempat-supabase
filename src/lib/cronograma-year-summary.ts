import { annualSummary, listCronogramaEntriesByYear } from "@/lib/cronograma";

export interface CronogramaYearMonthSummary {
  month: string;
  total: number;
  realizado: number;
  pendente: number;
  justificado: number;
  executionRate: number;
}

export async function listCronogramaYearSummary(year: number): Promise<CronogramaYearMonthSummary[]> {
  const entries = await listCronogramaEntriesByYear(year);
  return annualSummary(entries, year);
}
