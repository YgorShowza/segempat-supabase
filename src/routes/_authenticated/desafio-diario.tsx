import { createFileRoute } from "@tanstack/react-router";
import { DailyChallengeWorkspace } from "@/components/training/DailyChallengeWorkspace";

export const Route = createFileRoute("/_authenticated/desafio-diario")({
  head: () => ({
    meta: [
      { title: "Desafio Diário · SEGEMPAT" },
      { name: "description", content: "Desafio diário com questões operacionais e recompensa de XP." },
    ],
  }),
  component: DailyChallengeWorkspace,
});
