import { createClientOnlyFn } from "@tanstack/react-start";
import type { CronogramaEntry } from "@/lib/cronograma";
import type { Employee } from "@/lib/employees";

export const exportCronogramaDetailedPdf = createClientOnlyFn(
  async (entries: CronogramaEntry[], employees: Employee[], month: string) => {
    const pdf = await import("@/lib/cronograma-pdf");
    return pdf.exportCronogramaDetailedPdf(entries, employees, month);
  },
);

export const exportCronogramaAttendancePdf = createClientOnlyFn(
  async (entries: CronogramaEntry[], month: string) => {
    const pdf = await import("@/lib/cronograma-pdf");
    return pdf.exportCronogramaAttendancePdf(entries, month);
  },
);
