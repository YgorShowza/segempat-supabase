import { createFileRoute } from "@tanstack/react-router";
import { TrainingCyclesAdmin } from "@/components/training/TrainingCyclesAdmin";

function TrainingCyclesPage() {
  return (
    <div className="segempat-training-cycles">
      <TrainingCyclesAdmin />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/ciclos-treinamento")({
  head: () => ({
    meta: [
      { title: "Ciclos e Vencimentos · SEGEMPAT" },
      { name: "description", content: "Controle de ciclos e vencimentos de treinamento do SEGEMPAT." },
    ],
  }),
  component: TrainingCyclesPage,
});
