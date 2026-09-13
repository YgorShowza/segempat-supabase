import { createFileRoute } from "@tanstack/react-router";
import { OccurrencesWorkspace } from "@/components/occurrences/OccurrencesWorkspace";

export const Route = createFileRoute("/_authenticated/minhas-ocorrencias")({
  head: () => ({ meta: [{ title: "Minhas Ocorrências · SEGEMPAT" }] }),
  component: () => <OccurrencesWorkspace operatorTitle />,
});
