import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  Maximize2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOperationalSnapshot } from "@/lib/insights";
import { operationalYear } from "@/lib/operational-time";
import {
  availableReportingSectors,
  examReporting,
  monthlyReporting,
  reportingSummary,
  sectorReporting,
} from "@/lib/reporting-insights";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics · SEGEMPAT" }] }),
  component: AnalyticsPage,
});

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl ${className}`}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}
    >
      {children}
    </section>
  );
}

function AnalyticsPage() {
  const currentYear = operationalYear();
  const [year, setYear] = useState(currentYear);
  const [sector, setSector] = useState("Todos");
  const query = useQuery({
    queryKey: ["operational-snapshot", year],
    queryFn: () => getOperationalSnapshot(year),
    staleTime: 60_000,
  });

  const sectors = useMemo(() => (query.data ? availableReportingSectors(query.data) : []), [query.data]);
  useEffect(() => {
    if (sector !== "Todos" && !sectors.includes(sector)) setSector("Todos");
  }, [sector, sectors]);

  if (query.isLoading && !query.data) return <Loading />;
  if (query.isError || !query.data) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-500" />
        <h1 className="mt-3 text-lg font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o Analytics.</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Nenhum indicador é estimado quando a fonte operacional falha.</p>
        <Button variant="outline" className="mt-4" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
      </Card>
    );
  }

  const data = query.data;
  const summary = reportingSummary(data, sector);
  const months = monthlyReporting(data, year, sector);
  const allSectorRows = sectorReporting(data);
  const sectorRows = sector === "Todos" ? allSectorRows : allSectorRows.filter((row) => row.sector === sector);
  const exams = examReporting(data, sector);
  const hasVolume = summary.activeEmployees > 0 || summary.planned > 0 || summary.attempts > 0;
  const updatedAt = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Maceio", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
  const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - 3 + index);

  return (
    <div className="segempat-analytical-analytics mx-auto max-w-7xl space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6 lg:p-7" style={{ background: "linear-gradient(135deg,#171118 0%,#310912 54%,#111216 100%)", border: "1px solid rgba(200,16,46,.28)", boxShadow: "0 12px 38px rgba(80,0,18,.16)" }}>
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)" }} />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-white/45"><BarChart3 className="h-4 w-4" /> Inteligência operacional</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Analytics</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">Leitura consolidada de equipe, cronograma e avaliações. Percentuais sem base são exibidos como “—”, nunca como falso zero.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeaderLink to="/individual" icon={FileBarChart} label="Análise individual" />
            <HeaderLink to="/relatorios" icon={FileSpreadsheet} label="Relatórios" />
            <Link to="/tv" className="group inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black text-white" style={{ background: "linear-gradient(135deg,#e31837,#a90b28)", boxShadow: "0 10px 24px rgba(200,16,46,.22)" }}><Monitor className="h-4 w-4" /> Painel TV <Maximize2 className="h-3.5 w-3.5 opacity-60" /></Link>
          </div>
        </div>
      </section>

      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em]" style={{ color: "var(--accent)" }}>Escopo analítico</p>
            <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-1)" }}>Os filtros abaixo recalculam todos os indicadores, meses, setores e avaliações desta página.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[140px_minmax(190px,260px)_auto]">
            <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>
              Ano
              <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl px-3 text-sm font-bold outline-none" style={{ background: "var(--bg-surface-2)", color: "var(--text-1)", border: "1px solid var(--border)" }}>
                {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>
              Setor
              <select value={sector} onChange={(event) => setSector(event.target.value)} className="mt-1 h-10 w-full rounded-xl px-3 text-sm font-bold outline-none" style={{ background: "var(--bg-surface-2)", color: "var(--text-1)", border: "1px solid var(--border)" }}>
                <option value="Todos">Todos os setores</option>
                {sectors.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <Button variant="outline" className="h-10 self-end gap-2" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--text-4)" }}><span>Ano operacional: <strong style={{ color: "var(--text-2)" }}>{year}</strong></span><span>Setor: <strong style={{ color: "var(--text-2)" }}>{sector}</strong></span><span>Atualizado: <strong style={{ color: "var(--text-2)" }}>{updatedAt}</strong></span></div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPI label="Equipe ativa" value={summary.activeEmployees} detail="fora do perfil Inspetor" icon={Users} />
        <KPI label="Execução" value={formatPercent(summary.executionRate)} detail={`${summary.realized}/${summary.planned} realizados`} icon={Target} />
        <KPI label="Aprovação" value={formatPercent(summary.approvalRate)} detail={`${summary.passed}/${summary.attempts} tentativas aprovadas`} icon={CheckCircle2} />
        <KPI label="Tentativas" value={summary.attempts} detail="avaliações concluídas" icon={ClipboardList} />
        <KPI label="Média" value={formatScore(summary.averageScore)} detail="escala de 0 a 10" icon={TrendingUp} />
      </div>

      {!hasVolume && (
        <Card className="p-5">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><div><p className="font-black" style={{ color: "var(--text-1)" }}>Sem volume operacional neste escopo</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>A página está carregada corretamente, mas não há equipe ativa, cronograma ou avaliações suficientes para produzir indicadores neste recorte.</p></div></div>
        </Card>
      )}

      <Card className="p-4 md:p-5">
        <SectionHeading icon={BarChart3} title="Evolução mensal" subtitle="Execução do cronograma e aprovação em avaliações, mês a mês, no mesmo escopo dos indicadores acima." />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12">
          {months.map((month) => <MonthCard key={month.month} month={month} />)}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
        <Card className="overflow-hidden">
          <div className="p-4 md:p-5"><SectionHeading icon={Users} title="Desempenho por setor" subtitle="Volumes e percentuais mantêm seus denominadores visíveis para evitar interpretações fora de contexto." /></div>
          {sectorRows.length === 0 ? <EmptyState text="Nenhum setor disponível neste recorte." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead style={{ background: "var(--bg-surface-2)" }}><tr>{["Setor", "Equipe", "Cronograma", "Pendentes", "Execução", "Tentativas", "Aprovação", "Média"].map((label) => <th key={label} className={`p-3 text-[9px] font-black uppercase tracking-[.1em] ${label === "Setor" ? "text-left" : "text-right"}`} style={{ color: "var(--text-4)" }}>{label}</th>)}</tr></thead>
                <tbody>{sectorRows.map((row) => <tr key={row.sector} style={{ borderTop: "1px solid var(--border-subtle)" }}><td className="p-3 font-black" style={{ color: "var(--text-1)" }}>{row.sector}</td><td className="p-3 text-right" style={{ color: "var(--text-3)" }}>{row.activeEmployees}</td><td className="p-3 text-right" style={{ color: "var(--text-3)" }}>{row.realized}/{row.planned}</td><td className="p-3 text-right" style={{ color: row.pending ? "#f59e0b" : "var(--text-3)" }}>{row.pending}</td><td className="p-3 text-right"><RateBadge value={row.executionRate} /></td><td className="p-3 text-right" style={{ color: "var(--text-3)" }}>{row.attempts}</td><td className="p-3 text-right"><RateBadge value={row.approvalRate} /></td><td className="p-3 text-right font-black" style={{ color: "var(--text-1)" }}>{formatScore(row.averageScore)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 md:p-5"><SectionHeading icon={ClipboardList} title="Avaliações no período" subtitle="Ranking por volume de tentativas. O mínimo exibido é o critério individual configurado em cada prova." /></div>
          {exams.length === 0 ? <EmptyState text="Nenhuma avaliação concluída neste escopo." /> : (
            <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {exams.slice(0, 8).map((exam) => <div key={exam.examId} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{exam.title}</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>{exam.type} · mínimo individual {exam.minApprovalPct}% · {exam.attempts} tentativa{exam.attempts === 1 ? "" : "s"}</p></div><div className="shrink-0 text-right"><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{formatScore(exam.averageScore)}</p><p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-4)" }}>média</p></div></div><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}><div className="h-full rounded-full" style={{ width: `${exam.approvalRate ?? 0}%`, background: rateColor(exam.approvalRate) }} /></div><span className="w-12 text-right text-xs font-black" style={{ color: rateColor(exam.approvalRate) }}>{formatPercent(exam.approvalRate)}</span></div></div>)}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4 md:p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} /><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Critérios de leitura e rastreabilidade</p><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>O Analytics é determinístico e usa os registros operacionais do SEGEMPAT, sem julgamento de IA. O escopo considera colaboradores ativos fora do perfil Inspetor; cronograma é vinculado por ID ou matrícula normalizada; avaliações são vinculadas pela matrícula. “—” significa ausência de denominador suficiente, e não desempenho igual a zero.</p></div></div>
      </Card>
    </div>
  );
}

function HeaderLink({ to, icon: Icon, label }: { to: "/individual" | "/relatorios"; icon: typeof FileBarChart; label: string }) {
  return <Link to={to} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black text-white/80" style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }}><Icon className="h-4 w-4" /> {label}<ArrowRight className="h-3.5 w-3.5 opacity-55" /></Link>;
}

function KPI({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof Users }) {
  return <Card className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-2xl font-black md:text-3xl" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-1 truncate text-[10px]" style={{ color: "var(--text-4)" }}>{detail}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", border: "1px solid rgba(200,16,46,.16)" }}><Icon className="h-4 w-4" style={{ color: "var(--accent)" }} /></div></div></Card>;
}

function SectionHeading({ icon: Icon, title, subtitle }: { icon: typeof BarChart3; title: string; subtitle: string }) {
  return <div className="flex items-start gap-2.5"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}><Icon className="h-4 w-4" style={{ color: "var(--accent)" }} /></div><div><h2 className="text-sm font-black" style={{ color: "var(--text-1)" }}>{title}</h2><p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--text-4)" }}>{subtitle}</p></div></div>;
}

function MonthCard({ month }: { month: ReturnType<typeof monthlyReporting>[number] }) {
  return <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}><p className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{month.label}</p><div className="mt-3 space-y-2"><MiniProgress label="Exec." value={month.executionRate} count={`${month.realized}/${month.planned}`} /><MiniProgress label="Aprov." value={month.approvalRate} count={`${month.passed}/${month.attempts}`} /></div><p className="mt-2 text-[9px]" style={{ color: "var(--text-4)" }}>{month.pending} pend. · {month.justified} just.</p></div>;
}

function MiniProgress({ label, value, count }: { label: string; value: number | null; count: string }) {
  return <div><div className="mb-1 flex items-center justify-between gap-2"><span className="text-[9px] font-bold" style={{ color: "var(--text-4)" }}>{label} {count}</span><span className="text-[9px] font-black" style={{ color: value == null ? "var(--text-4)" : rateColor(value) }}>{formatPercent(value)}</span></div><div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}><div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: rateColor(value) }} /></div></div>;
}

function RateBadge({ value }: { value: number | null }) {
  return <span className="inline-flex min-w-12 justify-center rounded-lg px-2 py-1 text-xs font-black" style={{ background: value == null ? "var(--bg-surface-2)" : `${rateColor(value)}14`, color: value == null ? "var(--text-4)" : rateColor(value) }}>{formatPercent(value)}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>{text}</div>;
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

function formatScore(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

function rateColor(value: number | null) {
  if (value == null) return "var(--text-4)";
  if (value >= 80) return "#10b981";
  if (value >= 60) return "#f59e0b";
  return "#e11d48";
}

function Loading() {
  return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
}
