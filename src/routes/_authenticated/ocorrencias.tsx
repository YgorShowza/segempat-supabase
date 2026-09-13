import { createFileRoute } from "@tanstack/react-router";
import { OccurrencesWorkspace } from "@/components/occurrences/OccurrencesWorkspace";
import "@/operational-desktop.css";

export const Route = createFileRoute("/_authenticated/ocorrencias")({
  head: () => ({ meta: [{ title: "Ocorrências · SEGEMPAT" }] }),
  component: OccurrencesDesktopRoute,
});

function OccurrencesDesktopRoute() {
  return (
    <div className="segempat-operational-occurrences">
      <OccurrencesWorkspace />
    </div>
  );
}
