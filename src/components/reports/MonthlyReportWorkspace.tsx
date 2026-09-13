import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Award,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Filter,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  UserRound,
  XCircle,
} from "lucide-react";
import { getOperationalSnapshot } from "@/lib/insights";
import { operationalMonth } from "@/lib/operational-time";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { hasPermission } from "@/lib/access-control";
import {
  availableReportingSectors,
  monthlyEmployeeRows,
  normalizeReportingText,
  type MonthlyEmployeeRow,
} from "@/lib/reporting-insights";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function currentMonth() {
  return operationalMonth();
}

function monthLabel(value: string) {
  if (!value) return "";
  return new Date(`${value}-15T12:00:00`).toLocaleDateString("pt-BR", {
    timeZone: "America/Maceio",
    month: "long",
    year: "numeric",
  });
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const raw = value.length === 10 ? `${value}T12:00:00` : value;
  return new Date(raw).toLocaleDateString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type SituationFilter = "Todos" | "Com atraso" | "Com pendência" | "Com avaliação" | "Sem atividade";

export function MonthlyReportWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [month, setMonth] = useState(currentMonth());
  const [sector, setSector] = useState("Todos");
  const [search, setSearch] = useState("");
  const [situation, setSituation] = useState<SituationFilter>("Todos");
  const [openEmployees, setOpenEmployees] = useState<Set<string>>(() => new Set());
  const year = Number(month.slice(0, 4));
  const canViewReports = hasPermission(user, "reports.view");

  const snapshot = useQuery({
    queryKey: ["monthly-report-snapshot", year],
    queryFn: () => getOperationalSnapshot(year),
    enabled: Boolean(user && canViewReports),
    staleTime: 60_000,
  });

  const allRows = useMemo(() => (snapshot.data ? monthlyEmployeeRows(snapshot.data, month) : []), [snapshot.data, month]);
  const sectors = useMemo(() => (snapshot.data ? availableReportingSectors(snapshot.data) : []), [snapshot.data]);
  const scopedRows = useMemo(() => allRows.filter((row) => sector === "Todos" || row.employee.sector === sector), [allRows, sector]);
  const visibleRows = useMemo(() => {
    const q = normalizeReportingText(search);
    return scopedRows.filter((row) => {
      const matchesSearch = !q || [row.employee.full_name, row.employee.matricula, row.employee.sector].some((value) => normalizeReportingText(value).includes(q));
      if (!matchesSearch) return false;
      if (situation === "Com atraso") return row.overdue > 0;
      if (situation === "Com pendência") return row.pending > 0;
      if (situation === "Com avaliação") return row.attemptsMonth.length > 0;
      if (situation === "Sem atividade") return row.cron.length === 0 && row.attemptsMonth.length === 0;
      return true;
    });
  }, [scopedRows, search, situation]);

  const totals = useMemo(() => {
    const attempts = scopedRows.reduce((sum, row) => sum + row.attemptsMonth.length, 0);
    const scores = scopedRows.flatMap((row) => row.attemptsMonth.map((attempt) => Number(attempt.score || 0)));
    return {
      employees: scopedRows.length,
      planned: scopedRows.reduce((sum, row) => sum + row.cron.length, 0),
      realized: scopedRows.reduce((sum, row) => sum + row.realized, 0),
      pending: scopedRows.reduce((sum, row) => sum + row.pending, 0),
      overdue: scopedRows.reduce((sum, row) => sum + row.overdue, 0),
      justified: scopedRows.reduce((sum, row) => sum + row.justified, 0),
      attempts,
      passed: scopedRows.reduce((sum, row) => sum + row.passed, 0),
      averageScore: scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null,
    };
  }, [scopedRows]);

  if (userLoading) return <Loading />;
  if (!user?.isAdmin || !canViewReports) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <ShieldCheck className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--accent)" }} />
        <h1 className="text-lg font-black" style={{ color: "var(--text-1)" }}>Acesso restrito</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>O relatório mensal exige a permissão de visualização de relatórios.</p>
      </div>
    );
  }

  const toggleEmployee = (employeeId: string) => {
    setOpenEmployees((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const expandAll = () => setOpenEmployees(new Set(visibleRows.map((row) => row.employee.id)));
  const collapseAll = () => setOpenEmployees(new Set());
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Maceio", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`segempat-monthly-report-root ${embedded ? "w-full" : "mx-auto w-full max-w-6xl"} space-y-5 pb-10`}>
      {!embedded ? (
        <header className="reports-no-print rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/40"><CalendarDays className="h-4 w-4" /> Fechamento mensal</div>
              <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Relatório Mensal</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/50">Performance individual, avaliações e execução do cronograma com rastreabilidade por colaborador.</p>
            </div>
            <MonthlyControls month={month} onMonthChange={(value) => { setMonth(value); setOpenEmployees(new Set()); }} dark />
          </div>
        </header>
      ) : (
        <section className="reports-no-print flex flex-col gap-4 rounded-2xl p-4 lg:flex-row lg:items-center lg:justify-between" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em]" style={{ color: "var(--accent)" }}><CalendarDays className="h-4 w-4" /> Fechamento mensal</div>
            <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-1)" }}>Performance individual, avaliações e execução do cronograma · {monthLabel(month)}</p>
          </div>
          <MonthlyControls month={month} onMonthChange={(value) => { setMonth(value); setOpenEmployees(new Set()); }} />
        </section>
      )}

      <section className="segempat-report-print rounded-2xl p-4" style={{ background: "#fff", color: "#171A1F", border: "1px solid #d7d9de" }}>
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-[#C8102E]">EMPRESA ALAGOANA DE TERMINAIS · UNIDADE DE SEGURANÇA PORTUÁRIA</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black">Fechamento mensal · {monthLabel(month)}</h2><p className="mt-1 text-xs text-[#616772]">Setor: {sector === "Todos" ? "todos os setores operacionais" : sector} · Gerado em {generatedAt}</p></div><p className="text-[10px] text-[#737780]">Busca e filtro de situação localizam registros, mas não alteram o consolidado mensal.</p></div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric label="Colaboradores" value={totals.employees} icon={UserRound} />
        <Metric label="Planejados" value={totals.planned} icon={ClipboardList} />
        <Metric label="Realizados" value={totals.realized} icon={Target} />
        <Metric label="Pendentes" value={totals.pending} icon={AlertTriangle} tone={totals.pending ? "#f59e0b" : undefined} />
        <Metric label="Em atraso" value={totals.overdue} icon={AlertTriangle} tone={totals.overdue ? "#ef4444" : undefined} />
        <Metric label="Avaliações" value={totals.attempts} icon={Award} />
      </section>

      <section className="reports-no-print rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_200px_auto] lg:items-end">
          <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>
            Buscar
            <div className="relative mt-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, matrícula ou setor" className="pl-9" /></div>
          </label>
          <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>Setor<select value={sector} onChange={(event) => { setSector(event.target.value); setOpenEmployees(new Set()); }} className="mt-1 h-10 w-full rounded-xl px-3 text-sm font-bold outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}><option value="Todos">Todos os setores</option>{sectors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>Situação<select value={situation} onChange={(event) => setSituation(event.target.value as SituationFilter)} className="mt-1 h-10 w-full rounded-xl px-3 text-sm font-bold outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}>{["Todos", "Com atraso", "Com pendência", "Com avaliação", "Sem atividade"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <Button variant="outline" className="h-10 gap-2" onClick={() => { setSearch(""); setSituation("Todos"); setSector("Todos"); }}><Filter className="h-4 w-4" /> Limpar filtros</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-4)" }}><span>Mostrando <strong style={{ color: "var(--text-2)" }}>{visibleRows.length}</strong> de {scopedRows.length} colaboradores no escopo.</span><div className="flex gap-2"><button type="button" onClick={expandAll} className="font-black" style={{ color: "var(--accent)" }}>Expandir resultados</button><span>·</span><button type="button" onClick={collapseAll} className="font-black" style={{ color: "var(--accent)" }}>Recolher</button></div></div>
      </section>

      {snapshot.isLoading && !snapshot.data ? <Loading /> : snapshot.isError ? (
        <section className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar os dados do fechamento mensal.</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Nenhum consolidado é estimado quando a fonte falha.</p><Button variant="outline" className="mt-4" onClick={() => snapshot.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></section>
      ) : scopedRows.length === 0 ? (
        <EmptyPanel title="Nenhum colaborador no escopo" detail="Não há colaboradores ativos deste setor para o período selecionado." />
      ) : visibleRows.length === 0 ? (
        <EmptyPanel title="Nenhum resultado para os filtros" detail="O consolidado mensal existe, mas nenhum colaborador corresponde à busca ou situação selecionada." />
      ) : (
        <div className="space-y-3">
          {visibleRows.map((row) => <EmployeeReportCard key={row.employee.id} row={row} month={month} open={openEmployees.has(row.employee.id)} onToggle={() => toggleEmployee(row.employee.id)} />)}
        </div>
      )}

      <section className="segempat-report-print rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} /><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Critério do fechamento</p><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>O consolidado considera colaboradores ativos fora do perfil Inspetor. Cronograma é vinculado por ID ou matrícula e avaliações pela matrícula. “Em atraso” representa item pendente de mês anterior ou, no mês operacional atual, item pendente cuja data planejada já passou. Indicadores sem base suficiente são exibidos como “—”.</p></div></div>
      </section>

      <style>{`
        @media print {
          .segempat-monthly-report-root .reports-no-print { display:none !important; }
          .segempat-monthly-report-root [data-monthly-details] { display:block !important; }
          .segempat-monthly-report-root [data-collapse-icon] { display:none !important; }
          .segempat-monthly-report-root { max-width:none !important; padding:0 !important; }
          .segempat-monthly-report-root .segempat-report-print, .segempat-monthly-report-root article { box-shadow:none !important; break-inside:avoid; }
          .segempat-monthly-report-root article { margin-bottom:5mm; }
          @page { size:A4 portrait; margin:12mm; }
        }
      `}</style>
    </div>
  );
}

function EmployeeReportCard({ row, month, open, onToggle }: { row: MonthlyEmployeeRow; month: string; open: boolean; onToggle: () => void }) {
  return (
    <article className="segempat-report-print overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset" style={{ color: "var(--accent)" }}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-black text-white" style={{ background: "linear-gradient(135deg,#C8102E,#861023)" }}>{row.employee.full_name.charAt(0)}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{row.employee.full_name}</p><p className="text-xs" style={{ color: "var(--text-4)" }}>Mat. {row.employee.matricula} · {row.employee.sector} · {monthLabel(month)}</p></div>
        <div className="hidden items-center gap-5 md:flex"><InlineStat label="Execução" value={formatPercent(row.executionRate)} tone={rateColor(row.executionRate)} /><InlineStat label="Média" value={formatScore(row.averageScore)} /><InlineStat label="Aprovação" value={formatPercent(row.approvalRate)} tone={rateColor(row.approvalRate)} />{row.overdue > 0 && <InlineStat label="Atraso" value={String(row.overdue)} tone="#ef4444" />}</div>
        <span data-collapse-icon>{open ? <ChevronUp className="h-4 w-4" style={{ color: "var(--text-4)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "var(--text-4)" }} />}</span>
      </button>

      <div data-monthly-details className={`${open ? "block" : "hidden"} border-t p-4`} style={{ borderColor: "var(--border-subtle)" }}>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <SmallMetric label="Planejados" value={row.cron.length} />
          <SmallMetric label="Realizados" value={row.realized} good />
          <SmallMetric label="Pendentes" value={row.pending} warn={row.pending > 0} />
          <SmallMetric label="Em atraso" value={row.overdue} danger={row.overdue > 0} />
          <SmallMetric label="Justificados" value={row.justified} />
          <SmallMetric label="Avaliações" value={row.attemptsMonth.length} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ReportBlock title="Cronograma do mês" icon={ClipboardList}>
            {row.cron.length === 0 ? <Empty text="Sem itens no cronograma deste mês." /> : <div className="space-y-2">{row.cron.map((entry) => <div key={entry.id} className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-bold" style={{ color: "var(--text-1)" }}>{entry.theme}</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>Prevista: {dateLabel(entry.planned_date)} · Realização: {dateLabel(entry.completion_date)}</p>{entry.status === "Justificado" && entry.justification && <p className="mt-1 text-[10px] font-bold text-blue-500">Motivo da não realização: {entry.justification}</p>}{entry.notes && <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "var(--text-4)" }}>Observação: {entry.notes}</p>}</div><StatusBadge status={entry.status} /></div></div>)}</div>}
          </ReportBlock>

          <ReportBlock title="Avaliações do mês" icon={Award}>
            {row.attemptsMonth.length === 0 ? <Empty text="Sem avaliações concluídas neste mês." /> : <div className="space-y-2">{row.attemptsMonth.map((attempt) => <div key={attempt.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>{attempt.passed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="h-4 w-4 shrink-0 text-red-500" />}<div className="min-w-0 flex-1"><p className="text-xs font-bold" style={{ color: "var(--text-1)" }}>{attempt.examTitle}</p><p className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>{attempt.examType} · {dateLabel(attempt.finished_at || attempt.created_at)}</p></div><span className="text-sm font-black" style={{ color: attempt.passed ? "#10b981" : "#ef4444" }}>{Number(attempt.score).toFixed(1)}</span></div>)}</div>}
          </ReportBlock>
        </div>
      </div>
    </article>
  );
}

function MonthlyControls({ month, onMonthChange, dark = false }: { month: string; onMonthChange: (value: string) => void; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} aria-label="Mês do relatório" className="h-10 rounded-xl px-3 text-sm outline-none" style={dark ? { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", color: "#fff" } : { background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
      <Button onClick={() => window.print()} variant="outline" className={dark ? "gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" : "gap-2"}><Printer className="h-4 w-4" /> Imprimir visão atual</Button>
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof UserRound; tone?: string }) {
  return <section className="segempat-report-print rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-2xl font-black" style={{ color: tone ?? "var(--text-1)" }}>{value}</p></div><Icon className="h-4 w-4" style={{ color: tone ?? "var(--accent)" }} /></div></section>;
}

function InlineStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="text-right"><p className="text-[9px] font-black uppercase tracking-[.1em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-0.5 text-xs font-black" style={{ color: tone ?? "var(--text-1)" }}>{value}</p></div>;
}

function SmallMetric({ label, value, good = false, warn = false, danger = false }: { label: string; value: number; good?: boolean; warn?: boolean; danger?: boolean }) {
  const tone = danger ? "#ef4444" : warn ? "#f59e0b" : good ? "#10b981" : "var(--text-1)";
  return <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}><p className="text-lg font-black" style={{ color: tone }}>{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.1em]" style={{ color: "var(--text-4)" }}>{label}</p></div>;
}

function ReportBlock({ title, icon: Icon, children }: { title: string; icon: typeof ClipboardList; children: React.ReactNode }) {
  return <section><div className="mb-2 flex items-center gap-2"><Icon className="h-4 w-4" style={{ color: "var(--accent)" }} /><h3 className="text-xs font-black" style={{ color: "var(--text-1)" }}>{title}</h3></div>{children}</section>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "Realizado" ? "#10b981" : status === "Justificado" ? "#3b82f6" : "#f59e0b";
  return <span className="shrink-0 rounded-lg px-2 py-1 text-[9px] font-black uppercase" style={{ background: `${tone}14`, color: tone }}>{status}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl p-5 text-center text-xs" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)" }}>{text}</p>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <section className="rounded-2xl p-10 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{title}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{detail}</p></section>;
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
  return <div className="flex justify-center py-14"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
}
