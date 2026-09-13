import { createFileRoute } from "@tanstack/react-router";
import { CronogramaPorted } from "@/components/cronograma/CronogramaPorted";

export const Route = createFileRoute("/_authenticated/cronograma")({
  head: () => ({
    meta: [
      { title: "Cronograma · SEGEMPAT" },
      { name: "description", content: "Cronograma de treinamentos com Lista, Calendário, Ano e geração anual." },
    ],
  }),
  component: CronogramaPorted,
});
