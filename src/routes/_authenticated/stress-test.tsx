import { createFileRoute } from "@tanstack/react-router";
import { StressTestWorkspace } from "@/components/training/StressTestWorkspace";

export const Route = createFileRoute("/_authenticated/stress-test")({
  head: () => ({
    meta: [
      { title: "Stress Test · SEGEMPAT" },
      { name: "description", content: "Treinamento cronometrado de tomada de decisão operacional sob pressão." },
    ],
  }),
  component: StressTestWorkspace,
});
