import { createFileRoute } from "@tanstack/react-router";
import { QuickTestWorkspace } from "@/components/training/QuickTestWorkspace";

export const Route = createFileRoute("/_authenticated/teste-rapido")({
  head: () => ({
    meta: [
      { title: "Teste Rápido · SEGEMPAT" },
      { name: "description", content: "Teste rápido com questões aleatórias do banco e registro de XP." },
    ],
  }),
  component: QuickTestWorkspace,
});
