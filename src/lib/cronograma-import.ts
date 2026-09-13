import { createCronogramaEntries, listCronogramaEntries, updateCronogramaEntry } from "@/lib/cronograma";
import { listEmployees } from "@/lib/employees";
import { apiRequest, isSegempatApiConfigured } from "@/lib/backend/api-client";

export type AtomicCronogramaImportRow = {
  matricula: string;
  tema: string;
  nota: number;
  month: string;
  completion_date: string;
};

export type AtomicCronogramaImportResult = {
  updated: number;
  created: number;
  ignored: number;
};

function normalize(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

export async function importCronogramaResultsAtomic(rows: AtomicCronogramaImportRow[]): Promise<AtomicCronogramaImportResult> {
  if (!rows.length) return { updated: 0, created: 0, ignored: 0 };

  if (isSegempatApiConfigured()) {
    return apiRequest<AtomicCronogramaImportResult>("/api/cronograma/import-results", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
  }

  // Compatibilidade temporária do preview legado. O modo corporativo não entra
  // neste ramo e executa a importação inteira em uma única transação MySQL.
  // O trigger do preview continua sendo a última barreira de integridade para
  // lançamentos vinculados a prova e deriva a data oficial da tentativa aprovada.
  const employees = await listEmployees();
  const employeeByMatricula = new Map(employees.map((employee) => [normalize(employee.matricula), employee]));
  const months = [...new Set(rows.map((row) => row.month))];
  const entriesByMonth = new Map<string, Awaited<ReturnType<typeof listCronogramaEntries>>>();
  await Promise.all(months.map(async (month) => entriesByMonth.set(month, await listCronogramaEntries(month))));

  let updated = 0;
  let created = 0;
  let ignored = 0;

  for (const row of rows) {
    const employee = employeeByMatricula.get(normalize(row.matricula));
    if (!employee || employee.access_profile === "Inspetor" || employee.status !== "Ativo") {
      ignored += 1;
      continue;
    }

    const entries = entriesByMonth.get(row.month) ?? [];
    const existing = entries.find((entry) => normalize(entry.employee_matricula) === normalize(row.matricula) && normalize(entry.theme) === normalize(row.tema));
    const notes = Number.isFinite(Number(row.nota)) ? `Resultado importado · Nota ${Number(row.nota).toFixed(1)}` : "Resultado importado";

    if (existing) {
      // Uma planilha posterior não reescreve evidência já formalizada. Em um
      // Pendente ligado a prova, o trigger do banco exige aprovação e substitui
      // completion_date pela data oficial da primeira tentativa aprovada.
      if (existing.status === "Realizado" || existing.status === "Justificado") {
        ignored += 1;
        continue;
      }

      await updateCronogramaEntry(existing.id, {
        status: "Realizado",
        type: "Realizado",
        completion_date: row.completion_date,
        justification: null,
        notes: existing.notes ? `${existing.notes}\n${notes}` : notes,
      });
      updated += 1;
      continue;
    }

    await createCronogramaEntries([{
      month: row.month,
      employee_id: employee.id,
      employee_name: employee.full_name,
      employee_matricula: employee.matricula,
      employee_sector: employee.sector,
      theme: row.tema,
      type: "Realizado",
      status: "Realizado",
      completion_date: row.completion_date,
      notes,
    }]);
    created += 1;
  }

  return { updated, created, ignored };
}
