import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock3,
  FilterX,
  Gauge,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { employeeRisk, getOperationalSnapshot } from "@/lib/insights";
import { operationalYear } from "@/lib/operational-time";

export const Route = createFileRoute("/_authenticated/risco")({
  head: () => ({ meta: [{ title: "Zona de Risco · SEGEMPAT" }] }),
  component: RiskPage,
});

type RiskLevel = "Alto" | "Médio" | "Baixo" | "Normal";
type RiskFilter = RiskLevel | "Todos";

const RISK_LEVELS: RiskLevel[] = ["Alto", "Médio", "Baixo", "Normal"];

function Card({ children, className = "", role }: { children: React.ReactNode; className?: string; role?: "alert" }) {
  return (
    <section
      role={role}
      className={`rounded-2xl ${className}`}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
    >
      {children}
    </section>
  );
}

function riskColor(level: RiskLevel) {
  if (level === "Alto") return "#ef4444";
  if (level === "Médio") return "#f59e0b";
  if (level === "Baixo") return "#60a5fa";
  return "#10b981";
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: number;
  icon: typeof AlertTriangle;
  color: string;
  sub: string;
}) {
  return (
    <Card className="relative min-h-[116px] overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p>
          <p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{value}</p>
          <p className="mt-1 text-[10px] font-semibold" style={{ color }}>{sub}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}12`, border: `1px solid ${color}2f` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
    </Card>
  );
}

function RiskPage() {
  const year = operationalYear();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<RiskFilter>("Todos");
  const [sectorFilter, setSectorFilter] = useState("Todos");

  const query = useQuery({
    queryKey: ["risk-snapshot", year],
    queryFn: () => getOperationalSnapshot(year),
    staleTime: 60_000,
  });

  const rows = useMemo(() => (query.data ? employeeRisk(query.data) : []), [query.data]);
  const sectors = useMemo(
    () => ["Todos", ...Array.from(new Set(rows.map((row) => row.employee.sector))).sort((a, b) => a.localeCompare(b, "pt-BR"))],
    [rows],
  );
  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);
    return rows.filter((row) => {
      if (levelFilter !== "Todos" && row.level !== levelFilter) return false;
      if (sectorFilter !== "Todos" && row.employee.sector !== sectorFilter) return false;
      if (!normalized) return true;
      return [row.employee.full_name, row.employee.matricula, row.employee.sector, row.level]
        .some((value) => normalizeSearch(String(value)).includes(normalized));
    });
  }, [rows, search, levelFilter, sectorFilter]);

  if (query.isLoading) return <Loading />;

  if (query.isError || !query.data) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center" role="alert">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "rgba(245,158,11,.09)", border: "1px solid rgba(245,158,11,.2)" }}>
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <p className="mt-4 font-black" style={{ color: "var(--text-1)" }}>Não foi possível calcular a Zona de Risco.</p>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-4)" }}>
          Nenhuma conclusão de risco é exibida enquanto os dados operacionais não forem carregados corretamente.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          {query.isFetching ? "Tentando novamente..." : "Tentar novamente"}
        </Button>
      </Card>
    );
  }

  const high = rows.filter((row) => row.level === "Alto").length;
  const medium = rows.filter((row) => row.level === "Médio").length;
  const low = rows.filter((row) => row.level === "Baixo").length;
  const normal = rows.filter((row) => row.level === "Normal").length;
  const hasFilters = Boolean(search.trim()) || levelFilter !== "Todos" || sectorFilter !== "Todos";
  const clearFilters = () => {
    setSearch("");
    setLevelFilter("Todos");
    setSectorFilter("Todos");
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
      <section
        className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6 xl:p-7"
        style={{
          background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)",
          border: "1px solid rgba(200,16,46,.26)",
          boxShadow: "0 12px 38px rgba(80,0,18,.14)",
        }}
      >
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.22),transparent 68%)" }} />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-white/40">
              <AlertTriangle className="h-4 w-4" /> Priorização operacional
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl xl:text-[2.1rem]">Zona de Risco</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/55">
              Prioriza colaboradores com pendências, atrasos e reprovações ainda não superadas, usando dados operacionais reais de {year}.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="self-start border-white/15 bg-white/5 font-bold text-white hover:bg-white/10 hover:text-white lg:self-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            {query.isFetching ? "Atualizando..." : "Atualizar dados"}
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Alto risco" value={high} icon={AlertTriangle} color="#ef4444" sub="8 pontos ou mais" />
        <MetricCard label="Risco médio" value={medium} icon={Clock3} color="#f59e0b" sub="4 a 7 pontos" />
        <MetricCard label="Risco baixo" value={low} icon={Clock3} color="#60a5fa" sub="1 a 3 pontos" />
        <MetricCard label="Normal" value={normal} icon={ShieldCheck} color="#10b981" sub="sem sinal de risco" />
        <MetricCard label="Monitorados" value={rows.length} icon={UserRoundSearch} color="var(--accent)" sub="ativos operacionais" />
      </div>

      <Card className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
            <Gauge className="h-4 w-4" style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Como o indicador é calculado</p>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[.1em]" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Info className="h-3 w-3" /> Regra transparente
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
              Cada pendência soma 1 ponto; se estiver vencida, recebe mais 3 pontos; cada reprovação sem aprovação posterior na mesma prova soma 2 pontos. Normal = 0, Baixo = 1–3, Médio = 4–7 e Alto = 8 ou mais.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-4)" }}>
              Vencidas já fazem parte do total de pendências. O indicador serve para priorização de acompanhamento e não substitui análise individual do contexto operacional.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Colaboradores monitorados</p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>
              {query.isFetching ? `Atualizando · ${filteredRows.length} de ${rows.length} exibidos` : `${filteredRows.length} de ${rows.length} exibidos`}
            </p>
          </div>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="self-start lg:self-auto">
              <FilterX className="mr-2 h-4 w-4" /> Limpar filtros
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(320px,1fr)_190px_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, matrícula, setor ou nível..."
              className="pl-10"
              aria-label="Buscar colaboradores na Zona de Risco"
            />
          </div>
          <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as RiskFilter)}>
            <SelectTrigger aria-label="Filtrar por nível de risco"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os níveis</SelectItem>
              {RISK_LEVELS.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger aria-label="Filtrar por setor"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sectors.map((sector) => <SelectItem key={sector} value={sector}>{sector === "Todos" ? "Todos os setores" : sector}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="space-y-3">
        {filteredRows.map((row) => {
          const level = row.level as RiskLevel;
          const color = riskColor(level);
          return (
            <Card key={row.employee.id} className="overflow-hidden">
              <div className="h-[3px]" style={{ background: color }} />
              <div className="flex flex-col gap-4 p-4 md:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words font-black" style={{ color: "var(--text-1)" }}>{row.employee.full_name}</p>
                    <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ color, background: `${color}16`, border: `1px solid ${color}24` }}>{row.level}</span>
                    <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ color: "var(--text-3)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>Score {row.score}</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Mat. {row.employee.matricula} · {row.employee.sector}</p>
                </div>

                <div className="grid w-full grid-cols-3 gap-2 text-center lg:w-auto lg:min-w-[330px] lg:gap-3">
                  <div className="rounded-xl p-2.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <p className="text-lg font-black text-amber-500">{row.pending}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[.08em] sm:text-[10px]" style={{ color: "var(--text-4)" }}>Pendências</p>
                  </div>
                  <div className="rounded-xl p-2.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <p className="text-lg font-black text-red-500">{row.overdue}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[.08em] sm:text-[10px]" style={{ color: "var(--text-4)" }}>Vencidas</p>
                  </div>
                  <div className="rounded-xl p-2.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <p className="text-lg font-black" style={{ color: row.failed ? "#ef4444" : "#10b981" }}>{row.failed}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[.08em] sm:text-[10px]" style={{ color: "var(--text-4)" }}>Reprovações</p>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {!rows.length && (
          <Card className="p-10 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>Nenhum colaborador ativo para analisar.</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Quando houver equipe operacional ativa, os indicadores serão calculados automaticamente.</p>
          </Card>
        )}

        {rows.length > 0 && filteredRows.length === 0 && (
          <Card className="p-9 text-center">
            <Search className="mx-auto h-8 w-8" style={{ color: "var(--text-4)" }} />
            <p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>Nenhum colaborador corresponde aos filtros.</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Ajuste a busca, o nível de risco ou o setor para visualizar outros registros.</p>
            <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" /> Limpar filtros</Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-3 py-20" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} />
      <span className="text-sm font-semibold" style={{ color: "var(--text-3)" }}>Calculando Zona de Risco...</span>
    </div>
  );
}
