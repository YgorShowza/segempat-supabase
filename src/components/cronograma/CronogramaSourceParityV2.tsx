import { useMemo, useState, type ReactNode } from "react";
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
} from "lucide-react";
import { CronogramaGroupedList } from "@/components/cronograma/CronogramaGroupedList";
import {
  annualSummary,
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

export function CronogramaSourceParityV2({ actions }: { actions?: ReactNode }) {
  const [view, setView] = useState<PrimaryView>("lista");
  const [month, setMonth] = useState(currentMonthStr());
  const year = Number(month.slice(0, 4));

  const monthQuery = useQuery({
    queryKey: ["cronograma-parity-month", month],
    queryFn: () => listCronogramaEntries(month),
    enabled: view !== "ano",
  });
  const yearQuery = useQuery({
    queryKey: ["cronograma-parity-year", year],
    queryFn: () => listCronogramaEntriesByYear(year),
    enabled: view === "ano",
  });
  const suspensionQuery = useQuery({
    queryKey: ["cronograma-parity-susp", month],
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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pb-10">
      <PrimaryHeader month={month} setMonth={setMonth} view={view} setView={setView} actions={actions} />

      {activeError ? (
        <QueryError onRetry={retryActiveView} />
      ) : (
        <>
          {view === "lista" && (
            <CronogramaGroupedList
              entries={monthQuery.data ?? []}
              loading={monthQuery.isLoading}
              monthLabel={formatMonth(month)}
            />
          )}

          {view === "calendario" && (
            <CalendarView
              month={month}
              entries={monthQuery.data ?? []}
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
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl p-4 md:p-5 xl:flex-row xl:items-center xl:justify-between"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg,#f0c400,#ffd700)",
            boxShadow: "0 6px 18px rgba(200,160,0,.28)",
          }}
        >
          <CalendarDays className="h-5 w-5 text-black" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black md:text-2xl" style={{ color: "var(--text-1)" }}>
            Cronograma de Treinamentos
          </h1>
          <p className="mt-0.5 text-sm capitalize" style={{ color: "var(--text-4)" }}>
            {formatMonth(month)}
          </p>
        </div>
      </div>

      <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        <div
          className="flex w-full items-center overflow-hidden rounded-xl sm:w-auto"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}
        >
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center"
            style={{ color: "var(--text-3)" }}
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="h-10 min-w-0 flex-1 px-3 text-sm font-bold capitalize sm:min-w-[155px] sm:flex-none"
            style={{
              color: "var(--text-1)",
              borderLeft: "1px solid var(--border)",
              borderRight: "1px solid var(--border)",
            }}
            onClick={() => setMonth(currentMonthStr())}
          >
            {formatMonth(month)}
          </button>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center"
            style={{ color: "var(--text-3)" }}
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex w-full items-center overflow-hidden rounded-xl sm:w-auto"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}
        >
          <ViewButton active={view === "lista"} onClick={() => setView("lista")} icon={List} label="Lista" />
          <ViewButton active={view === "calendario"} onClick={() => setView("calendario")} icon={CalendarDays} label="Calendário" />
          <ViewButton active={view === "ano"} onClick={() => setView("ano")} icon={BarChart3} label="Ano" />
        </div>

        {actions && (
          <>
            <span
              className="hidden h-8 w-px shrink-0 sm:block"
              style={{ background: "var(--border)" }}
              aria-hidden
            />
            {actions}
          </>
        )}
      </div>
    </section>
  );
}

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof List;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 flex-1 items-center justify-center gap-1.5 px-2.5 text-[11px] font-bold transition-colors sm:flex-none sm:gap-2 sm:px-3.5 sm:text-xs"
      style={
        active
          ? {
              background: "linear-gradient(135deg,#f0c400,#ffd700)",
              color: "#111",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
            }
          : { color: "var(--text-3)" }
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}

function CalendarView({
  month,
  entries,
  suspensions,
  loading,
}: {
  month: string;
  entries: CronogramaEntry[];
  suspensions: CronogramaSuspension[];
  loading: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekDay = new Date(year, monthIndex, 1).getDay();
  const operationalToday = operationalDateParts();
  const todayDay = operationalToday.year === year && operationalToday.monthNumber === monthNumber ? operationalToday.day : null;

  const byDay = useMemo(() => {
    const map: Record<number, CronogramaEntry[]> = {};
    entries.forEach((entry) => {
      if (!entry.planned_date) return;
      const [entryYear, entryMonth, entryDay] = entry.planned_date.slice(0, 10).split("-").map(Number);
      if (entryYear === year && entryMonth === monthNumber && Number.isInteger(entryDay)) {
        (map[entryDay] ||= []).push(entry);
      }
    });
    return map;
  }, [entries, monthNumber, year]);

  const unscheduled = useMemo(() => entries.filter((entry) => !entry.planned_date), [entries]);

  const monthSuspended = suspensions.some((item) => item.type === "mes_suspenso" && item.month === month);
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

  if (loading) return <Loading />;
  const selected = selectedDay ? byDay[selectedDay] ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <Legend icon={Clock3} label="Pendente" color="#f59e0b" />
        <Legend icon={CheckCircle2} label="Realizado" color="#10b981" />
        <Legend icon={ShieldCheck} label="Justificado" color="#3b82f6" />
        {monthSuspended && <Legend icon={PauseCircle} label="Mês suspenso" color="#8b5cf6" />}
      </div>

      <div className="overflow-x-auto pb-1">
        <section
          className="min-w-[720px] overflow-hidden rounded-2xl lg:min-w-0"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card, var(--shadow-md))",
          }}
        >
          <div className="grid grid-cols-7">
            {WEEK.map((weekDay) => (
              <div
                key={weekDay}
                className="py-3 text-center text-[11px] font-black uppercase tracking-widest"
                style={{
                  background: "var(--bg-surface-2)",
                  color: weekDay === "Dom" || weekDay === "Sáb" ? "#C8102E" : "var(--text-3)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {weekDay}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((day, index) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="min-h-[104px] md:min-h-[112px]"
                    style={{
                      background: "var(--bg-surface-2)",
                      opacity: 0.45,
                      borderRight: "1px solid var(--border-subtle)",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  />
                );
              }

              const rows = byDay[day] ?? [];
              const isToday = day === todayDay;
              const isSelected = day === selectedDay;
              const suspended = monthSuspended || absenceDays.has(day);
              const weekend = index % 7 === 0 || index % 7 === 6;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className="relative min-h-[104px] overflow-hidden p-2 text-left transition-colors md:min-h-[112px]"
                  style={{
                    background: isSelected
                      ? "rgba(240,196,0,.10)"
                      : suspended
                        ? "rgba(139,92,246,.06)"
                        : weekend
                          ? "var(--bg-surface-2)"
                          : "transparent",
                    borderRight: "1px solid var(--border-subtle)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-black"
                      style={
                        isToday
                          ? { background: "#C8102E", color: "#fff", boxShadow: "0 0 0 3px rgba(200,16,46,.15)" }
                          : { color: weekend ? "#C8102E" : "var(--text-1)" }
                      }
                    >
                      {day}
                    </span>
                    <div className="flex items-center gap-1">
                      {rows.length > 0 && (
                        <span className="rounded-md px-1.5 py-0.5 text-[9px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>
                          {rows.length}
                        </span>
                      )}
                      {suspended && <span className="text-[10px]">⏸</span>}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {rows.slice(0, 2).map((entry) => {
                      const style = STATUS[entry.status];
                      return (
                        <div
                          key={entry.id}
                          className="truncate rounded-md px-1.5 py-1 text-[10px] font-semibold"
                          style={{ background: style.bg, color: style.color, borderLeft: `2px solid ${style.color}` }}
                        >
                          {entry.employee_name?.split(" ")[0]} · {entry.theme}
                        </div>
                      );
                    })}
                    {rows.length > 2 && <div className="text-[9px] font-black" style={{ color: "var(--text-4)" }}>+{rows.length - 2} mais</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {unscheduled.length > 0 && (
        <section className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: "var(--bg-surface-2)", borderBottom: "1px solid var(--border)" }}>
            <Clock3 className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Sem data prevista</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>Registros do mês ainda sem um dia de planejamento definido.</p>
            </div>
            <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>{unscheduled.length}</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {unscheduled.map((entry) => {
              const status = STATUS[entry.status];
              return (
                <article key={entry.id} className="px-4 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{entry.employee_name}</p>
                        <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ background: status.bg, color: status.color }}>{entry.status}</span>
                      </div>
                      <p className="mt-1 break-words text-xs font-semibold" style={{ color: "var(--text-2)" }}>{entry.theme}</p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>Mat. {entry.employee_matricula} · {entry.employee_sector}</p>
                      {entry.status === "Justificado" && entry.justification && <p className="mt-2 text-xs" style={{ color: "#3b82f6" }}>Motivo da não realização: <strong>{entry.justification}</strong></p>}
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-[10px] font-black uppercase tracking-[.08em]" style={{ color: "var(--text-4)" }}>Conclusão</p>
                      <p className="mt-1 text-xs font-bold" style={{ color: "var(--text-2)" }}>{formatDate(entry.completion_date)}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {selectedDay && (
        <section className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid rgba(240,196,0,.35)" }}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: "rgba(240,196,0,.08)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm font-black capitalize" style={{ color: "var(--text-1)" }}>
              {new Date(year, monthIndex, selectedDay).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>
              {selected.length} atividade{selected.length === 1 ? "" : "s"}
            </span>
          </div>
          {selected.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: "var(--text-4)" }}>Nenhum treinamento previsto para este dia.</p>
          ) : selected.map((entry) => {
            const status = STATUS[entry.status];
            return (
              <article key={entry.id} className="px-4 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black" style={{ background: "linear-gradient(135deg,#f0c400,#ffd700)", color: "#111" }}>
                    {entry.employee_name?.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{entry.employee_name}</p>
                      <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black" style={{ background: status.bg, color: status.color }}>
                        {entry.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-xs font-semibold" style={{ color: "var(--text-2)" }}>{entry.theme}</p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>Mat. {entry.employee_matricula} · {entry.employee_sector}</p>

                    <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                      <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                        <span style={{ color: "var(--text-4)" }}>Data prevista</span>
                        <p className="mt-0.5 font-black" style={{ color: "var(--text-2)" }}>{formatDate(entry.planned_date)}</p>
                      </div>
                      <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                        <span style={{ color: "var(--text-4)" }}>Data de conclusão</span>
                        <p className="mt-0.5 font-black" style={{ color: "var(--text-2)" }}>{formatDate(entry.completion_date)}</p>
                      </div>
                    </div>

                    {entry.status === "Justificado" && entry.justification && (
                      <div className="mt-3 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(59,130,246,.07)", border: "1px solid rgba(59,130,246,.22)", color: "var(--text-2)" }}>
                        <p className="text-[10px] font-black uppercase tracking-[.08em]" style={{ color: "#3b82f6" }}>Motivo da não realização</p>
                        <p className="mt-1 font-semibold">{entry.justification}</p>
                      </div>
                    )}

                    {entry.exam_title && (
                      <p className="mt-3 text-[11px]" style={{ color: "var(--text-3)" }}>
                        Avaliação vinculada: <strong>{entry.exam_title}</strong>
                      </p>
                    )}
                    {entry.notes && <p className="mt-2 break-words text-[11px]" style={{ color: "var(--text-3)" }}>Observação: {entry.notes}</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function AnnualView({
  year,
  currentMonth,
  entries,
  onSelectMonth,
  loading,
}: {
  year: number;
  currentMonth: string;
  entries: CronogramaEntry[];
  onSelectMonth: (month: string) => void;
  loading: boolean;
}) {
  const rows = annualSummary(entries, year);
  if (loading) return <Loading />;

  return (
    <section
      className="overflow-hidden rounded-2xl"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--bg-surface-2)", borderBottom: "1px solid var(--border)" }}>
        <span className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--text-1)" }}>📆 Visão anual — {year}</span>
        <span className="ml-auto hidden text-xs sm:block" style={{ color: "var(--text-4)" }}>Clique em um mês para navegar</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {rows.map((row) => {
          const current = row.month === currentMonth;
          const percent = row.executionRate;
          const color = percent >= 80 ? "#10b981" : percent >= 50 ? "#f59e0b" : "#ef4444";
          return (
            <button
              key={row.month}
              onClick={() => onSelectMonth(row.month)}
              className="relative flex min-h-[118px] flex-col items-center justify-center p-4 transition-colors"
              style={{ border: "1px solid var(--border-subtle)", background: current ? "rgba(200,16,46,.05)" : "transparent" }}
            >
              {current && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#C8102E]" />}
              <p className="mb-2 text-xs font-black capitalize" style={{ color: current ? "#C8102E" : "var(--text-2)" }}>
                {new Date(year, Number(row.month.slice(5)) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")} de {String(year).slice(-2)}
              </p>
              <div className="relative h-11 w-11">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-surface-3)" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3.5" strokeDasharray={`${percent * 0.879} 87.9`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black" style={{ color }}>
                  {row.total ? `${percent}%` : "—"}
                </span>
              </div>
              <p className="mt-1 text-[9px]" style={{ color: "var(--text-4)" }}>{row.total ? `${row.realizado}/${row.total}` : "Sem reg."}</p>
              {row.pendente > 0 && (
                <span className="mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: "rgba(245,158,11,.12)", color: "#f59e0b", border: "1px dashed rgba(245,158,11,.45)" }}>
                  ⏳ {row.pendente} plan.
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ icon: Icon, label, color }: { icon: typeof Clock3; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: `${color}18`, color, border: `1px solid ${color}44` }}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="rounded-2xl px-5 py-10 text-center"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.25)" }}>
        <AlertTriangle className="h-6 w-6 text-amber-500" />
      </div>
      <h2 className="mt-4 text-base font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o Cronograma</h2>
      <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--text-4)" }}>A consulta desta visão falhou. Seus dados não foram alterados. Verifique a conexão e tente novamente.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white"
        style={{ background: "#C8102E" }}
      >
        <RefreshCw className="h-4 w-4" />
        Tentar novamente
      </button>
    </section>
  );
}

function Loading() {
  return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
}
