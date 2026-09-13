import { createFileRoute } from "@tanstack/react-router";
import { PracticalWorkspace } from "@/components/practical/PracticalWorkspace";

export const Route = createFileRoute("/_authenticated/pratico")({
  head: () => ({ meta: [{ title: "Minha Avaliação Prática · SEGEMPAT" }] }),
  component: () => <PracticalWorkspace operatorTitle />,
});
