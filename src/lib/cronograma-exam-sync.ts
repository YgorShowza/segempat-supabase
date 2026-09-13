import { syncCronogramaWithExamAttempts } from "@/lib/cronograma";
import { operationalMonth } from "@/lib/operational-time";

export async function syncCronogramaForExamAttempt(input: {
  examId: string;
  matricula: string | null;
  finishedAt?: string | null;
}) {
  if (!input.matricula) return 0;
  const referenceDate = input.finishedAt ? new Date(input.finishedAt) : new Date();
  if (Number.isNaN(referenceDate.getTime())) throw new Error("Tentativa de prova possui data de conclusão inválida");
  return syncCronogramaWithExamAttempts(operationalMonth(referenceDate));
}
