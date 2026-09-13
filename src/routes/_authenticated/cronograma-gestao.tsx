import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { CronogramaWorkspace } from "@/components/cronograma/CronogramaWorkspace";
import { Button } from "@/components/ui/button";
import { invalidateCronogramaFlow } from "@/lib/operational-query-sync";

export const Route = createFileRoute("/_authenticated/cronograma-gestao")({
  validateSearch: (search: Record<string, unknown>): { novo?: boolean } => {
    const novo = search["novo"] === true || search["novo"] === "1" || search["novo"] === "true";
    return novo ? { novo: true } : {};
  },
  head: () => ({
    meta: [
      { title: "Gestão do Cronograma · SEGEMPAT" },
      { name: "description", content: "Centro de planejamento, execução, pendências, recorrências e suspensões do SEGEMPAT." },
    ],
  }),
  component: CronogramaGestaoPage,
});

function CronogramaGestaoPage() {
  const { novo } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      // Ao sair da gestão, força a próxima tela a ler o estado mais recente do
      // Cronograma e recalcular os indicadores operacionais dependentes.
      void invalidateCronogramaFlow(queryClient);
    };
  }, [queryClient]);

  return (
    <div className="segempat-operational-cronograma-management min-w-0 w-full">
      <div className="mx-auto mb-3 flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/cronograma"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao cronograma</Link>
        </Button>
        <div className="hidden items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] sm:flex" style={{ color: "var(--text-4)" }}><CalendarDays className="h-3.5 w-3.5" /> Gestão de planejamento</div>
      </div>
      <CronogramaWorkspace
        autoOpenNew={Boolean(novo)}
        onAutoOpenHandled={() => navigate({ to: "/cronograma-gestao", search: {}, replace: true })}
      />
    </div>
  );
}
