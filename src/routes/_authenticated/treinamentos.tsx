import { createFileRoute } from "@tanstack/react-router";
import { TrainingLibrary } from "@/components/training/TrainingLibrary";

export const Route = createFileRoute("/_authenticated/treinamentos")({
  head: () => ({
    meta: [
      { title: "Academia SEGEMPAT · SEGEMPAT" },
      { name: "description", content: "Ambiente integrado de capacitação, prática e desenvolvimento operacional." },
    ],
  }),
  component: TrainingLibrary,
});
