import { createFileRoute } from "@tanstack/react-router";
import { InspectorProductionWorkspace } from "@/components/inspector-production/InspectorProductionWorkspace";

export const Route = createFileRoute("/_authenticated/producao-inspetoria")({
  head: () => ({ meta: [{ title: "Produção da Inspetoria · SEGEMPAT" }] }),
  component: InspectorProductionWorkspace,
});
