import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";
import { CronogramaGroupedListPolished } from "@/components/cronograma/CronogramaGroupedListPolished";
import {
  annualSummary,
  cronogramaMetrics,
  currentMonthStr,
  formatDate,
  formatMonth,
  listCronogramaEntries,
  listCronogramaEntriesByYear,
  listSuspensions,
  shiftMonth,
  type CronogramaEntry,
  type CronogramaSuspension,
} from "@/lib/cronograma";
import { operationalDateParts } from "@/lib/operational-time";

type PrimaryView = "lista" | "calendario" | "ano";

const STATUS = {
  Pendente: { color: "#f59e0b", bg: "rgba(245,158,11,.10)" },
  Realizado: { color: "#10b981", bg: "rgba(16,185,129,.10)" },
  Justificado: { color: "#3b82f6", bg: "rgba(59,130,246,.10)" },
} as const;

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CronogramaSourcePolished({ actions }: { actions?: ReactNode }) {
  const [view, setView] = useState<PrimaryView>("lista");
  const [month, setMonth] = useState(currentMonthStr());
  const year = Number(month.slice(0, 4));

  const monthQuery = useQuery({
    queryKey: ["cronograma-polished-month", month],
    queryFn: () => listCronogramaEntries(month),
    enabled: view !== "ano",
  });
  const yearQuery = useQuery({
    queryKey: ["cronograma-polished-year", year],
    queryFn: () => listCronogramaEntriesByYear(year),
    enabled: view === "ano",
  });
  const suspensionQuery = useQuery({
    queryKey: ["cronograma-polished-suspensions", month],
    queryFn: () => listSuspensions(month),
    enabled: view === "calendario",
  });

  const activeError = view === "ano"
    ? yearQuery.isError
    : view === "calendario"
      ? monthQuery.isError || suspensionQuery.isError
      : monthQuery.isError;

  const retryActiveView = () => {
    if (view === "ano") {
      void yearQuery.refetch();
      return;
    }
    void monthQuery.refetch();
    if (view === "calendario") void suspensionQuery.refetch();
  };

  const entries = monthQuery.data ?? [];
  const metrics = cronogramaMetrics(entries);

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 pb-12">
      <PrimaryHeader month={month} setMonth={setMonth} view={view} setView={setView} actions={actions} />

      {view !== "ano" && !activeError && (
        <MonthlySummary entries={entries} loading={monthQuery.isLoading} metrics={metrics} />
      )}

      {activeError ? (
        <QueryError onRetry={retryActiveView} />
      ) : (
        <>
          {view === "lista" && (
            <CronogramaGroupedListPolished
              entries={entries}
              loading={monthQuery.isLoading}
              monthLabel={formatMonth(month)}
              canManage={Boolean(actions)}
            />
          )}

          {view === "calendario" && (
            <CalendarView
              month={month}
              entries={entries}
              suspensions={suspensionQuery.data ?? []}
              loading={monthQuery.isLoading || suspensionQuery.isLoading}
            />
          )}

          {view === "ano" && (
            <AnnualView
              year={year}
              currentMonth={month}
              entries={yearQuery.data ?? []}
              onSelectMonth={(selectedMonth) => {
                setMonth(selectedMonth);
                setView("calendario");
              }}
              loading={yearQuery.isLoading}
            />
          )}
        </>
      )}
    </div>
  );
}

function PrimaryHeader({
  month,
  setMonth,
  view,
  setView,
  actions,
}: {
  month: string;
  setMonth: (month: string) => void;
  view: PrimaryView;
  setView: (view: PrimaryView) => void;
  actions?: ReactNode;
}) {
  const currentMonth = currentMonthStr();
  const isCurrentMonth = month === currentMonth;

  return (
    <section
      className="relative overflow-hidden rounded-[1.5rem] p-4 md:p-5"
      style={{
        background: "linear-gradient(135deg,var(--bg-surface) 0%,var(--bg-surface) 62%,rgba(240,196,0,.07) 100%)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
      aria-labelledby="cronograma-title"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle,rgba(240,196,0,.13),transparent 70%)" }} />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg,#f0c400,#ffd700)", boxShadow: "0 7px 20px rgba(200,160,0,.24)" }}
          >
            <CalendarDays className="h-5 w-5 text-black" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="cronograma-title" className="text-xl font-black md:text-2xl" style={{ color: "var(--text-1)" }}>Cronograma de Treinamentos</h1>
              {isCurrentMonth && <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[.08em]" style={{ background: "rgba(16,185,129,.09)", color: "#10b981", border: "1px solid rgba(16,185,129,.20)" }}>Mês atual</span>}
            </div>
            <p className="mt-1 text-xs leading-relaxed md:text-sm" style={{ color: "var(--text-4)" }}>Planejamento, execução e acompanhamento mensal em uma única visão.</p>
          </div>
        </div>

        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <div className="flex w-full items-center overflow-hidden rounded-xl sm:w-auto" style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }} aria-label="Navegação mensal">
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]" style={{ color: "var(--text-3)" }} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
            <span className="flex h-10 min-w-0 flex-1 items-center justify-center px-3 text-sm font-bold capitalize sm:min-w-[165px] sm:flex-none" style={{ color: "var(--text-1)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>{formatMonth(month)}</span>
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]" style={{ color: "var(--text-3)" }} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
          </div>

          {!isCurrentMonth && (
            <button type="button" onClick={() => setMonth(currentMonth)} className="h-10 rounded-xl px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>Voltar ao mês atual</button>
          )}

          <div className="flex w-full items-center overflow-hidden rounded-xl sm:w-auto" style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }} role="tablist" aria-label="Visões do cronograma">
            <ViewButton active={view === "lista"} onClick={() => setView("lista")} icon={List} label="Lista" />
            <ViewButton active={view === "calendario"} onClick={() => setView("calendario")} icon={CalendarDays} label="Calendário" />
            <ViewButton active={view === "ano"} onClick={() => setView("ano")} icon={BarChart3} label="Ano" />
          </div>

          {actions && <div className="w-full sm:w-auto">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex h-10 flex-1 items-center justify-center gap-1.5 px-2.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:flex-none sm:gap-2 sm:px-3.5 sm:text-xs"
      style={active ? { background: "linear-gradient(135deg,#f0c400,#ffd700)", color: "#111", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)" } : { color: "var(--text-3)" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
    </button>
  );
}

function MonthlySummary({
  entries,
  loading,
  metrics,
}: {
  entries: CronogramaEntry[];
  loading: boolean;
  metrics: ReturnType<typeof cronogramaMetrics>;
}) {
  const cards = [
    { label: "Planejados", value: metrics.total, sub: "lançamentos no mês", color: "#64748b", icon: Target },
    { label: "Realizados", value: metrics.realizado, sub: "concluídos", color: "#10b981", icon: CheckCircle2 },
    { label: "Pendentes", value: metrics.pendente, sub: "aguardando execução", color: "#f59e0b", icon: Clock3 },
    { label: "Justificados", value: metrics.justificado, sub: "não realizados com justificativa", color: "#3b82f6", icon: ShieldCheck },
    { label: "Execução", value: entries.length ? `${metrics.executionRate}%` : "—", sub: "realizados ÷ total", color: metrics.executionRate >= 80 ? "#10b981" : metrics.executionRate >= 50 ? "#f59e0b" : "#ef4444", icon: BarChart3 },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumo mensal do cronograma" aria-busy={loading}>
      {cards.map(({ label, value, sub, color, icon: Icon }) => (
        <div key={label} className="relative min-h-[104px] overflow-hidden rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
          <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[.13em]" style={{ color: "var(--text-4)" }}>{label}</p>
              <p className="mt-2 text-2xl font-black" style={{ color: loading ? "var(--text-4)" : color }}>{loading ? "…" : value}</p>
              <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "var(--text-4)" }}>{sub}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}12`, border: `1px solid ${color}24` }}><Icon className="h-4 w-4" style={{ color }} /></div>
          </div>
        </div>
      ))}
    </section>
  );
}

function CalendarView({ month, entries, suspensions, loading }: { month: string; entries: CronogramaEntry[]; suspensions: CronogramaSuspension[]; loading: boolean }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekDay = new Date(year, monthIndex, 1).getDay();
  const operationalToday = operationalDateParts();
  const todayDay = operationalToday.year === year && operationalToday.monthNumber === monthNumber ? operationalToday.day : null;

  useEffect(() => {
    setSelectedDay(null);
  }, [month]);

  const byDay = useMemo(() => {
    const map: Record<number, CronogramaEntry[]> = {};
    entries.forEach((entry) => {
      if (!entry.planned_date) return;
      const [entryYear, entryMonth, entryDay] = entry.planned_date.slice(0, 10).split("-").map(Number);
      if (entryYear === year && entryMonth === monthNumber && Number.isInteger(entryDay)) (map[entryDay] ||= []).push(entry);
    });
    return map;
  }, [entries, monthNumber, year]);

  const unscheduled = useMemo(() => entries.filter((entry) => !entry.planned_date), [entries]);
  const monthSuspension = suspensions.find((item) => item.type === "mes_suspenso" && item.month === month);
  const monthSuspended = Boolean(monthSuspension);

  const absenceDays = useMemo(() => {
    const days = new Set<number>();
    suspensions
      .filter((item) => item.type === "ausencia_operador" && item.date_start && item.date_end)
      .forEach((item) => {
        const start = new Date(`${item.date_start}T12:00:00`);
        const end = new Date(`${item.date_end}T12:00:00`);
        for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
          if (cursor.getFullYear() === year && cursor.getMonth() === monthIndex) days.add(cursor.getDate());
        }
      });
    return days;
  }, [monthIndex, suspensions, year]);

  const cells: Array<number | null> = [];
  for (let index = 0; index < firstWeekDay; index += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(null);

  if (loading) return <Loading label="Montando calendário..." />;
  const selected = selectedDay ? byDay[selectedDay] ?? [] : [];

  return (
    <div className="space-y-4">
      {monthSuspension && (
        <section className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "rgba(139,92,246,.08)", border: "1px solid rgba(139,92,246,.25)" }} role="status">
          <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
          <div><p className="text-sm font-black text-violet-500">Mês suspenso</p><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{monthSuspension.reason}{monthSuspension.notes ? ` · ${monthSuspension.notes}` : ""}</p></div>
        </section>
      )}

      <div className="flex flex-wrap gap-2 text-xs font-bold" aria-label="Legenda do calendário">
        <Legend icon={Clock3} label="Pendente" color="#f59e0b" />
        <Legend icon={CheckCircle2} label="Realizado" color="#10b981" />
        <Legend icon={ShieldCheck} label="Justificado" color="#3b82f6" />
        {monthSuspended && <Legend icon={PauseCircle} label="Período suspenso" color="#8b5cf6" />}
      </div>

      <div className="overflow-x-auto pb-1" tabIndex={0} aria-label="Calendário mensal; deslize horizontalmente em telas menores">
        <section className="min-w-[720px] overflow-hidden rounded-2xl lg:min-w-0" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
          <div className="grid grid-cols-7">
            {WEEK.map((weekDay) => <div key={weekDay} className="py-3 text-center text-[11px] font-black uppercase tracking-widest" style={{ background: "var(--bg-surface-2)", color: weekDay === "Dom" || weekDay === "Sáb" ? "#C8102E" : "var(--text-3)", borderBottom: "1px solid var(--border)" }}>{weekDay}</div>)}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="min-h-[104px] md:min-h-[112px]" aria-hidden="true" style={{ background: "var(--bg-surface-2)", opacity: 0.45, borderRight: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }} />;

              const rows = byDay[day] ?? [];
              const isToday = day === todayDay;
              const isSelected = day === selectedDay;
              const suspended = monthSuspended || absenceDays.has(day);
              const weekend = index % 7 === 0 || index % 7 === 6;
              const dateLabel = new Date(year, monthIndex, day).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  aria-pressed={isSelected}
                  aria-label={`${dateLabel}. ${rows.length} atividade${rows.length === 1 ? "" : "s"}${suspended ? ". Período suspenso" : ""}.`}
                  className="relative min-h-[104px] overflow-hidden p-2 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] md:min-h-[112px]"
                  style={{ background: isSelected ? "rgba(240,196,0,.10)" : suspended ? "rgba(139,92,246,.06)" : weekend ? "var(--bg-surface-2)" : "transparent", borderRight: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-black" style={isToday ? { background: "#C8102E", color: "#fff", boxShadow: "0 0 0 3px rgba(200,16,46,.15)" } : { color: weekend ? "#C8102E" : "var(--text-1)" }}>{day}</span>
                    <div className="flex items-center gap-1">
                      {rows.length > 0 && <span className="rounded-md px-1.5 py-0.5 text-[9px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>{rows.length}</span>}
                      {suspended && <PauseCircle className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {rows.slice(0, 2).map((entry) => {
                      const style = STATUS[entry.status];
                      return <div key={entry.id} className="truncate rounded-md px-1.5 py-1 text-[10px] font-semibold" style={{ background: style.bg, color: style.color, borderLeft: `2px solid ${style.color}` }}>{entry.employee_name?.split(" ")[0]} · {entry.theme}</div>;
                    })}
                    {rows.length > 2 && <div className="text-[9px] font-black" style={{ color: "var(--text-4)" }}>+{rows.length - 2} mais</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {unscheduled.length > 0 && <UnscheduledList entries={unscheduled} />}

      {selectedDay && (
        <section className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid rgba(240,196,0,.35)" }} aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: "rgba(240,196,0,.08)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm font-black capitalize" style={{ color: "var(--text-1)" }}>{new Date(year, monthIndex, selectedDay).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
            <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>{selected.length} atividade{selected.length === 1 ? "" : "s"}</span>
          </div>
          {selected.length === 0 ? <p className="p-6 text-center text-sm" style={{ color: "var(--text-4)" }}>Nenhum treinamento previsto para este dia.</p> : selected.map((entry) => <CalendarEntry key={entry.id} entry={entry} />)}
        </section>
      )}
    </div>
  );
}

function UnscheduledList({ entries }: { entries: CronogramaEntry[] }) {
  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: "var(--bg-surface-2)", borderBottom: "1px solid var(--border)" }}>
        <Clock3 className="h-4 w-4 text-amber-500" /><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Sem data prevista</p><p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>Lançamentos do mês que ainda precisam de uma data de planejamento.</p></div>
        <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>{entries.length}</span>
      </div>
      <div>{entries.map((entry) => <CalendarEntry key={entry.id} entry={entry} compact />)}</div>
    </section>
  );
}

function CalendarEntry({ entry, compact = false }: { entry: CronogramaEntry; compact?: boolean }) {
  const status = STATUS[entry.status];
  return (
    <article className="px-4 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {!compact && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black" style={{ background: "linear-gradient(135deg,#f0c400,#ffd700)", color: "#111" }}>{entry.employee_name?.charAt(0)}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{entry.employee_name}</p><span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ background: status.bg, color: status.color }}>{entry.status}</span></div>
          <p className="mt-1 break-words text-xs font-semibold" style={{ color: "var(--text-2)" }}>{entry.theme}</p>
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>Mat. {entry.employee_matricula} · {entry.employee_sector}</p>
          {!compact && <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2"><Info label="Data prevista" value={formatDate(entry.planned_date)} /><Info label="Data de conclusão" value={formatDate(entry.completion_date)} /></div>}
          {entry.status === "Justificado" && entry.justification && <div className="mt-3 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(59,130,246,.07)", border: "1px solid rgba(59,130,246,.22)", color: "var(--text-2)" }}><p className="text-[10px] font-black uppercase tracking-[.08em]" style={{ color: "#3b82f6" }}>Justificativa</p><p className="mt-1 font-semibold">{entry.justification}</p></div>}
          {entry.exam_title && <p className="mt-3 text-[11px]" style={{ color: "var(--text-3)" }}>Avaliação vinculada: <strong>{entry.exam_title}</strong></p>}
          {entry.notes && <p className="mt-2 break-words text-[11px]" style={{ color: "var(--text-3)" }}>Observação: {entry.notes}</p>}
        </div>
        {compact && <div className="shrink-0 text-left sm:text-right"><p className="text-[9px] font-black uppercase tracking-[.08em]" style={{ color: "var(--text-4)" }}>Conclusão</p><p className="mt-1 text-xs font-bold" style={{ color: "var(--text-2)" }}>{formatDate(entry.completion_date)}</p></div>}
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}><span style={{ color: "var(--text-4)" }}>{label}</span><p className="mt-0.5 font-black" style={{ color: "var(--text-2)" }}>{value}</p></div>;
}

function AnnualView({ year, currentMonth, entries, onSelectMonth, loading }: { year: number; currentMonth: string; entries: CronogramaEntry[]; onSelectMonth: (month: string) => void; loading: boolean }) {
  const rows = annualSummary(entries, year);
  if (loading) return <Loading label="Consolidando visão anual..." />;

  const annualTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const annualDone = rows.reduce((sum, row) => sum + row.realizado, 0);
  const annualRate = annualTotal ? Math.round((annualDone / annualTotal) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--bg-surface-2)", borderBottom: "1px solid var(--border)" }}>
        <div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Visão anual · {year}</p><p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>Selecione um mês para abrir o calendário correspondente.</p></div>
        <div className="flex gap-2"><span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>{annualTotal} lançamentos</span><span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: annualTotal ? "rgba(16,185,129,.08)" : "var(--bg-surface-3)", color: annualTotal ? "#10b981" : "var(--text-4)" }}>{annualTotal ? `${annualRate}% executado` : "Sem dados"}</span></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {rows.map((row) => {
          const current = row.month === currentMonth;
          const percent = row.executionRate;
          const color = !row.total ? "#7c8597" : percent >= 80 ? "#10b981" : percent >= 50 ? "#f59e0b" : "#ef4444";
          const monthName = new Date(year, Number(row.month.slice(5)) - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
          return (
            <button
              type="button"
              key={row.month}
              onClick={() => onSelectMonth(row.month)}
              aria-label={`${monthName} de ${year}: ${row.total ? `${row.realizado} de ${row.total} realizados, ${percent}% de execução` : "sem lançamentos"}`}
              className="relative flex min-h-[128px] flex-col items-center justify-center p-4 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
              style={{ border: "1px solid var(--border-subtle)", background: current ? "rgba(200,16,46,.05)" : "transparent" }}
            >
              {current && <span className="absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase" style={{ background: "rgba(200,16,46,.10)", color: "#C8102E" }}>selecionado</span>}
              <p className="mb-2 text-xs font-black capitalize" style={{ color: current ? "#C8102E" : "var(--text-2)" }}>{monthName}</p>
              <div className="relative h-11 w-11">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-surface-3)" strokeWidth="3.5" /><circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3.5" strokeDasharray={`${percent * 0.879} 87.9`} strokeLinecap="round" /></svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black" style={{ color }}>{row.total ? `${percent}%` : "—"}</span>
              </div>
              <p className="mt-1 text-[9px]" style={{ color: "var(--text-4)" }}>{row.total ? `${row.realizado}/${row.total} realizados` : "Sem lançamentos"}</p>
              {row.pendente > 0 && <span className="mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: "rgba(245,158,11,.12)", color: "#f59e0b", border: "1px dashed rgba(245,158,11,.45)" }}>{row.pendente} pendente{row.pendente === 1 ? "" : "s"}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ icon: Icon, label, color }: { icon: typeof Clock3; label: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: `${color}18`, color, border: `1px solid ${color}44` }}><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="rounded-2xl px-5 py-10 text-center" role="alert" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.25)" }}><AlertTriangle className="h-6 w-6 text-amber-500" /></div>
      <h2 className="mt-4 text-base font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o Cronograma</h2>
      <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--text-4)" }}>A consulta desta visão falhou. Nenhum dado foi alterado; tente novamente quando a conexão estiver disponível.</p>
      <button type="button" onClick={onRetry} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ background: "#C8102E" }}><RefreshCw className="h-4 w-4" />Tentar novamente</button>
    </section>
  );
}

function Loading({ label = "Carregando cronograma..." }: { label?: string }) {
  return <div className="flex min-h-[280px] flex-col items-center justify-center py-16" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /><p className="mt-3 text-xs font-semibold" style={{ color: "var(--text-4)" }}>{label}</p></div>;
}
