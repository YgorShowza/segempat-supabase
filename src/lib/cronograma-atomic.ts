import { createCronogramaEntries, type CronogramaEntryInput } from "@/lib/cronograma";

export async function createCronogramaEntriesAtomic(entries: CronogramaEntryInput[]) {
  if (!entries.length) return { created: 0 };
  await createCronogramaEntries(entries);
  return { created: entries.length };
}
