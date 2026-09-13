import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  FilterX,
  GraduationCap,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  getInspectorAttentionCenter,
  type AttentionCategory,
  type AttentionItem,
  type AttentionPriority,
} from "@/lib/attention-center";
import { operationalYear } from "@/lib/operational-time";

// O routeTree é regenerado pelo plugin TanStack durante o build. Até essa
// geração ocorrer, o arquivo tipado versionado ainda não conhece esta rota.
// @ts-expect-error rota file-based registrada pelo gerador TanStack no build
export const Route = createFileRoute("/_authenticated/atencao")({
  head: () => ({ meta: [{ title: "Central de Atenção · SEGEMPAT" }] }),
  component: AttentionCenterPage,
});

const PRIORITY = {
  critical: { label: "Crítica", color: "#ef4444", soft: "rgba(239,68,68,.10)", icon: ShieldAlert },
  attention: { label: "Atenção", color: "#f59e0b", soft: "rgba(245,158,11,.10)", icon: AlertTriangle },
  monitor: { label: "Acompanhar", color: "#3b82f6", soft: "rgba(59,130,246,.10)", icon: Target },
} satisfies Record<AttentionPriority, { label: string; color: string; soft: string; icon: typeof AlertTriangle }>;

const CATEGORY_ICON: Record<AttentionCategory, typeof AlertTriangle> = {
  Cronograma: CalendarClock,
  Equipe: UserRoundSearch,
  Ocorrências: CircleAlert,
  "Avaliação Prática": ClipboardCheck,
  Certificados: FileCheck2,
  Treinamento: GraduationCap,
};

function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}
    >
      {children}
    </div>
  );
}

function displayDate(value: string | null) {
  if (!value) return null;
  const raw = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).replace(".", "");
}

function AttentionCenterPage() {
  const year = operationalYear();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const query = useQuery({
    queryKey: ["inspector-attention-center", year],
    queryFn: () => getInspectorAttentionCenter(year),
    enabled: Boolean(user?.isAdmin),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const [priorityFilter, setPriorityFilter] = useState<"all" | AttentionPriority>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AttentionCategory>("all");

  if (userLoading) return <Loading />;
  if (!user?.isAdmin) {
    return (
      <Surface className="mx-auto max-w-xl p-7 text-center md:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--accent-soft)" }}>
          <ShieldCheck className="h-6 w-6" style={{ color: "var(--accent)" }} />
        </div>
        <h1 className="mt-4 text-lg font-black" style={{ color: "var(--text-1)" }}>Acesso restrito</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-4)" }}>A Central de Atenção é uma visão gerencial exclusiva da Inspetoria.</p>
      </Surface>
    );
  }
  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) {
    return (
      <Surface className="mx-auto max-w-xl p-7 text-center md:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.20)" }}>
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <p className="mt-4 font-black" style={{ color: "var(--text-1)" }}>Não foi possível consolidar a Central de Atenção.</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-4)" }}>Nenhuma conclusão operacional é exibida enquanto a consolidação não terminar corretamente.</p>
        <Button className="mt-5" variant="outline" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
      </Surface>
    );
  }

  const data = query.data;
  const critical = data.items.filter((item) => item.priority === "critical");
  const attention = data.items.filter((item) => item.priority === "attention");
  const monitor = data.items.filter((item) => item.priority === "monitor");
  const failedSources = data.sourceStatus.filter((source) => !source.ok);
  const isPartial = failedSources.length > 0;
  const operationalState = isPartial ? "Consolidação parcial" : critical.length > 0 ? "Crítico" : attention.length > 0 ? "Atenção" : monitor.length > 0 ? "Acompanhamento" : "Normal";
  const stateColor = isPartial ? "#f59e0b" : critical.length > 0 ? "#ef4444" : attention.length > 0 ? "#f59e0b" : monitor.length > 0 ? "#3b82f6" : "#10b981";
  const StateIcon = isPartial ? AlertTriangle : critical.length > 0 ? ShieldAlert : attention.length > 0 ? AlertTriangle : monitor.length > 0 ? Target : ShieldCheck;
  const categories = data.sourceStatus.map((source) => source.source);
  const filtered = data.items.filter((item) =>
    (priorityFilter === "all" || item.priority === priorityFilter) &&
    (categoryFilter === "all" || item.category === categoryFilter),
  );
  const filtersActive = priorityFilter !== "all" || categoryFilter !== "all";
  const generated = new Date(data.generatedAt).toLocaleTimeString("pt-BR", {
    timeZone: "America/Maceio",
    hour: "2-digit",
    minute: "2-digit",
  });

  const clearFilters = () => {
    setPriorityFilter("all");
    setCategoryFilter("all");
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 pb-8 md:space-y-5 md:pb-10">
      <section
        className="relative overflow-hidden rounded-[1.5rem] p-4 md:rounded-[1.8rem] md:p-7"
        style={{ background: "linear-gradient(135deg,#151014 0%,#330912 54%,#120f12 100%)", border: "1px solid rgba(200,16,46,.30)", boxShadow: "0 16px 44px rgba(80,0,18,.20)" }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full" style={{ background: `radial-gradient(circle,${stateColor}33,transparent 68%)` }} />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.20em] text-white/45 md:text-[10px] md:tracking-[.24em]"><BellRing className="h-3.5 w-3.5 md:h-4 md:w-4" /> Prioridades da Inspetoria</div>
            <h1 className="mt-1.5 text-[1.7rem] font-black leading-tight tracking-tight text-white md:mt-2 md:text-4xl">Central de Atenção</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-5 text-white/55 md:text-sm md:leading-6">Uma leitura única do que exige ação, decisão ou acompanhamento. O tratamento continua sendo feito no módulo de origem, preservando histórico e auditoria.</p>
          </div>
          <div className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 sm:w-auto sm:min-w-[270px] md:gap-4 md:px-4 md:py-4" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:h-12 md:w-12 md:rounded-2xl" style={{ background: `${stateColor}18`, border: `1px solid ${stateColor}45` }}><StateIcon className="h-5 w-5" style={{ color: stateColor }} /></div>
            <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[.14em] text-white/40 md:text-[10px] md:tracking-[.16em]">Situação atual</p><p className="mt-0.5 text-base font-black leading-tight md:mt-1 md:text-lg" style={{ color: stateColor }}>{operationalState}</p><p className="mt-1 text-[9px] text-white/35 md:text-[10px]">Atualizado às {generated}</p></div>
            <button type="button" onClick={() => query.refetch()} disabled={query.isFetching} className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/65 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50" aria-label={query.isFetching ? "Atualizando Central de Atenção" : "Atualizar Central de Atenção"} title="Atualizar Central de Atenção"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
      </section>

      {isPartial && (
        <Surface className="overflow-hidden">
          <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-start md:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(245,158,11,.10)" }}><AlertTriangle className="h-4 w-4 text-amber-500" /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Consolidação parcial</p><p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>Não foi possível consultar {failedSources.length === 1 ? "um módulo" : `${failedSources.length} módulos`}. A Central mantém os demais sinais visíveis, mas não classifica a situação como normal enquanto houver fonte indisponível.</p><div className="mt-2 flex flex-wrap gap-1.5">{failedSources.map((source) => <span key={source.source} className="rounded-lg px-2 py-1 text-[10px] font-bold text-amber-500" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.16)" }}>{source.source}</span>)}</div></div>
          </div>
        </Surface>
      )}

      <section className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4" aria-label="Resumo das prioridades">
        <Metric label="Ações críticas" value={critical.length} icon={ShieldAlert} color="#ef4444" sub="prioridade imediata" />
        <Metric label="Em atenção" value={attention.length} icon={AlertTriangle} color="#f59e0b" sub="requer decisão" />
        <Metric label="Acompanhar" value={monitor.length} icon={Target} color="#3b82f6" sub="monitoramento" />
        <Metric label="Total sinalizado" value={data.items.length} icon={BellRing} color="#C8102E" sub="todos os módulos" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3 md:space-y-4">
          <Surface className="p-3 md:p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between xl:gap-3">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Filtrar por prioridade">
                  <FilterButton active={priorityFilter === "all"} label={`Todas · ${data.items.length}`} color="#C8102E" onClick={() => setPriorityFilter("all")} />
                  <FilterButton active={priorityFilter === "critical"} label={`Críticas · ${critical.length}`} color="#ef4444" onClick={() => setPriorityFilter("critical")} />
                  <FilterButton active={priorityFilter === "attention"} label={`Atenção · ${attention.length}`} color="#f59e0b" onClick={() => setPriorityFilter("attention")} />
                  <FilterButton active={priorityFilter === "monitor"} label={`Acompanhar · ${monitor.length}`} color="#3b82f6" onClick={() => setPriorityFilter("monitor")} />
                </div>
                <select aria-label="Filtrar Central de Atenção por módulo" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "all" | AttentionCategory)} className="h-10 w-full rounded-xl px-3 text-xs font-bold outline-none focus-visible:ring-2 sm:w-auto" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                  <option value="all">Todos os módulos</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border-subtle)" }}>
                <p className="text-[11px] font-semibold" style={{ color: "var(--text-4)" }}>Exibindo <strong style={{ color: "var(--text-2)" }}>{filtered.length}</strong> de {data.items.length} {data.items.length === 1 ? "sinal" : "sinais"} operacionais</p>
                {filtersActive && <button type="button" onClick={clearFilters} className="inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-lg px-2.5 text-[11px] font-black transition-colors hover:bg-[var(--bg-surface-2)] focus-visible:outline-none focus-visible:ring-2 sm:self-auto" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}><FilterX className="h-3.5 w-3.5" />Limpar filtros</button>}
              </div>
            </div>
          </Surface>

          {filtered.length === 0 ? (
            <Surface className="p-8 text-center md:p-10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl md:h-14 md:w-14" style={{ background: "rgba(16,185,129,.10)", border: "1px solid rgba(16,185,129,.20)" }}><CheckCircle2 className="h-6 w-6 text-emerald-500 md:h-7 md:w-7" /></div>
              <p className="mt-3 font-black md:mt-4" style={{ color: "var(--text-1)" }}>{filtersActive ? "Nenhum sinal com estes filtros." : "Nenhuma prioridade sinalizada."}</p>
              <p className="mx-auto mt-1 max-w-lg text-sm leading-6" style={{ color: "var(--text-4)" }}>{filtersActive ? "Ajuste os filtros ou volte à visão completa da Central." : "Quando um módulo exigir atenção, o sinal aparecerá automaticamente aqui."}</p>
              {filtersActive && <Button className="mt-4" variant="outline" onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" /> Limpar filtros</Button>}
            </Surface>
          ) : (
            <div className="space-y-2.5 md:space-y-3" aria-live="polite">{filtered.map((item) => <AttentionCard key={item.id} item={item} />)}</div>
          )}
        </div>

        <aside className="space-y-3 md:space-y-4" aria-label="Radar dos módulos">
          <Surface className="overflow-hidden">
            <div className="p-3.5 md:p-4" style={{ borderBottom: "1px solid var(--border)" }}><p className="text-[9px] font-black uppercase tracking-[.14em] md:text-[10px] md:tracking-[.16em]" style={{ color: "var(--text-4)" }}>Leitura por módulo</p><h2 className="mt-1 text-[15px] font-black md:text-base" style={{ color: "var(--text-1)" }}>Radar de prioridades</h2><p className="mt-1 text-[10px] leading-4" style={{ color: "var(--text-4)" }}>Selecione um módulo para concentrar a leitura.</p></div>
            <div className="space-y-0.5 p-2.5 md:space-y-1 md:p-3">
              {data.sourceStatus.map((source) => {
                const count = data.items.filter((item) => item.category === source.source && (priorityFilter === "all" || item.priority === priorityFilter)).length;
                const Icon = CATEGORY_ICON[source.source];
                const active = categoryFilter === source.source;
                return (
                  <button type="button" key={source.source} onClick={() => setCategoryFilter(active ? "all" : source.source)} aria-pressed={active} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 md:p-3" style={{ background: active ? "var(--accent-soft)" : undefined, border: active ? "1px solid var(--accent)" : "1px solid transparent" }}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: source.ok ? (active ? "var(--bg-surface)" : "var(--accent-soft)") : "rgba(245,158,11,.10)" }}><Icon className="h-4 w-4" style={{ color: source.ok ? "var(--accent)" : "#f59e0b" }} /></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-black" style={{ color: "var(--text-1)" }}>{source.source}</p><p className="mt-0.5 text-[10px]" style={{ color: source.ok ? "var(--text-4)" : "#f59e0b" }}>{source.ok ? `${count} sinal${count === 1 ? "" : "is"}` : "consulta indisponível"}</p></div>
                    <span className="text-lg font-black" style={{ color: count > 0 ? "var(--text-1)" : "var(--text-4)" }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </Surface>

          <Surface className="p-3.5 md:p-4">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /><p className="text-xs font-black" style={{ color: "var(--text-1)" }}>Como a Central funciona</p></div>
            <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-4)" }}>A Central é uma camada de leitura. Ela não altera ocorrências, notas, certificados ou cronogramas: cada ação é concluída no módulo de origem, preservando permissões, histórico e auditoria.</p>
          </Surface>
        </aside>
      </section>
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const tone = PRIORITY[item.priority];
  const PriorityIcon = tone.icon;
  const CategoryIcon = CATEGORY_ICON[item.category];
  return (
    <Surface className="group relative overflow-hidden">
      <div className="absolute bottom-0 left-0 top-0 w-[4px]" style={{ background: tone.color }} />
      <div className="p-3.5 pl-5 md:p-5 md:pl-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2.5 md:gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:h-11 md:w-11 md:rounded-2xl" style={{ background: tone.soft, border: `1px solid ${tone.color}28` }}><CategoryIcon className="h-5 w-5" style={{ color: tone.color }} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2"><span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[.10em]" style={{ background: tone.soft, color: tone.color }}><PriorityIcon className="h-3 w-3" />{tone.label}</span><span className="text-[9px] font-black uppercase tracking-[.08em] md:text-[10px]" style={{ color: "var(--text-4)" }}>{item.category}</span></div>
              <h3 className="mt-1.5 break-words text-[13px] font-black leading-5 md:mt-2 md:text-base" style={{ color: "var(--text-1)" }}>{item.title}</h3>
              <p className="mt-1 text-[12px] leading-5 md:text-sm" style={{ color: "var(--text-3)" }}>{item.description}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-semibold md:mt-2 md:gap-x-4 md:text-[10px]" style={{ color: "var(--text-4)" }}>{item.context && <span>{item.context}</span>}{item.date && <span>{displayDate(item.date)}</span>}</div>
            </div>
          </div>
          <Link to={item.href as any} className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-black transition-[transform,background-color] group-hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 md:h-10 md:w-auto md:text-xs" style={{ background: tone.soft, border: `1px solid ${tone.color}28`, color: tone.color }}>{item.actionLabel}<ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
    </Surface>
  );
}

function Metric({ label, value, icon: Icon, color, sub }: { label: string; value: number; icon: typeof AlertTriangle; color: string; sub: string }) {
  return (
    <Surface className="relative min-h-[108px] overflow-hidden p-3.5 md:min-h-[122px] md:p-5">
      <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: color }} />
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[.08]" style={{ background: color }} />
      <div className="relative flex items-start justify-between gap-2.5 md:gap-3">
        <div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[.13em] md:text-[10px] md:tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-1.5 text-2xl font-black md:mt-2 md:text-3xl" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-0.5 truncate text-[9px] font-bold md:mt-1 md:text-[11px]" style={{ color }}>{sub}</p></div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-10 md:w-10" style={{ background: `${color}12`, border: `1px solid ${color}25` }}><Icon className="h-4 w-4" style={{ color }} /></div>
      </div>
    </Surface>
  );
}

function FilterButton({ active, label, onClick, color = "#C8102E" }: { active: boolean; label: string; onClick: () => void; color?: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className="w-full rounded-xl px-2.5 py-2 text-[10px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 sm:w-auto md:px-3 md:text-xs" style={active ? { background: `${color}14`, border: `1px solid ${color}40`, color } : { background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-4)" }}>{label}</button>;
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-20" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} />
      <p className="mt-3 text-xs font-semibold" style={{ color: "var(--text-4)" }}>Consolidando prioridades...</p>
    </div>
  );
}
