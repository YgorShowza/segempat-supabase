import { createFileRoute } from "@tanstack/react-router";
import { SimulatorWorkspace } from "@/components/training/SimulatorWorkspace";

export const Route = createFileRoute("/_authenticated/simulador")({
  head: () => ({
    meta: [
      { title: "Simulador · SEGEMPAT" },
      { name: "description", content: "Simulador de ocorrências operacionais com feedback e XP." },
    ],
  }),
  component: SimulatorWorkspace,
});
