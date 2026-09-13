import { createFileRoute } from "@tanstack/react-router";
import { IndividualAnalysisPolished } from "@/components/individual-analysis/IndividualAnalysisPolished";

export const Route = createFileRoute("/_authenticated/individual")({
  head: () => ({ meta: [{ title: "Análise Individual · SEGEMPAT" }] }),
  component: IndividualAnalysisPage,
});

function IndividualAnalysisPage() {
  return (
    <div className="segempat-analytical-individual w-full">
      <IndividualAnalysisPolished />
    </div>
  );
}
