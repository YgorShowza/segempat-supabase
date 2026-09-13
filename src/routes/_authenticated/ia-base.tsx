import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";

export const Route = createFileRoute("/_authenticated/ia-base")({
  head: () => ({ meta: [{ title: "IA Base · SEGEMPAT" }] }),
  component: () => <KnowledgeWorkspace searchMode />,
});
