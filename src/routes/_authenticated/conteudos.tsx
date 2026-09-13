import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";

function KnowledgePage() {
  return (
    <div className="segempat-training-knowledge">
      <KnowledgeWorkspace />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/conteudos")({
  head: () => ({ meta: [{ title: "Conteúdos · SEGEMPAT" }] }),
  component: KnowledgePage,
});
