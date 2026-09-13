import { createFileRoute } from "@tanstack/react-router";
import { TrainingModulesAdmin } from "@/components/training/TrainingModulesAdmin";

export const Route = createFileRoute("/_authenticated/modulos-treinamento")({
  head: () => ({
    meta: [
      { title: "Módulos de Treinamento · SEGEMPAT" },
      { name: "description", content: "Gestão dos módulos de treinamento do SEGEMPAT." },
    ],
  }),
  component: TrainingModulesAdmin,
});
