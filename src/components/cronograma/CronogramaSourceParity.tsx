import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, List, BarChart3, Clock3, CheckCircle2, ShieldCheck, PauseCircle } from "lucide-react";
import { CronogramaWorkspace } from "@/components/cronograma/CronogramaWorkspace";
import {
  annualSummary,
  currentMonthStr,
  formatMonth,
  listCronogramaEntries,
  listCronogramaEntriesByYear,
  listSuspensions,
  shiftMonth,
  type CronogramaEntry,
  type CronogramaSuspension,
} from "@/lib/cronograma";

type PrimaryView = "lista" | "calendario" | "ano";

const STATUS = {
  Pendente: { color: "#f59e0b", bg: "rgba(245,158,11,.10)", label: "Pendente" },
  Realizado: { color: "#10b981", bg: "rgba(16,185,129,.10)", label: "Realizado" },
  Justificado: { color: "#3b82f6", bg: "rgba(59,130,246,.10)", label: "Justificado" },
} as const;

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CronogramaSourceParity() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<PrimaryView>("lista");
  const [month, setMonth] = useState(currentMonthStr());
  const year = Number(month.slice(0, 4));

  const monthQuery = useQuery({ queryKey: ["cronograma-parity-month", month], queryFn: () => listCronogramaEntries(month), enabled: view !== "lista" });
  const yearQuery = useQuery({ queryKey: ["cronograma-parity-year", year], queryFn: () => listCronogramaEntriesByYear(year), enabled: view === "ano" });
  const suspensionQuery = useQuery({ queryKey: ["cronograma-parity-susp", month], queryFn: () => listSuspensions(month), enabled: view !== "lista" });

  const changeView = (nextView: PrimaryView) => {
    if (view === "lista" && nextView !== "lista") {
      const activeMonthQuery = queryClient
        .getQueryCache()
        .findAll({ queryKey: ["cronograma"], type: "active" })
        .find((query) => typeof query.queryKey[1] === "string" && /^\d{4}-\d{2}$/.test(String(query.queryKey[1])));
      const listMonth = activeMonthQuery?.queryKey[1];
      if (typeof listMonth === "string") setMonth(listMonth);
    }
    setView(nextView);
  };

  if (view === "lista") {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 pb-10">
        <ListNavigation view={view} onChangeView={changeView} />
        <CronogramaWorkspace />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pb-10">
      <PrimaryHeader month={month} setMonth={setMonth} view={view} onChangeView={changeView} />
      {view === "calendario" ? (
        <CalendarView month={month} entries={monthQuery.data ?? []} suspensions={suspensionQuery.data ?? []} loading={monthQuery.isLoading || suspensionQuery.isLoading} />
      ) : (
        <AnnualView year={year} currentMonth={month} entries={yearQuery.data ?? []} onSelectMonth={(m) => { setMonth(m); setView("calendario"); }} loading={yearQuery.isLoading} />
      )}
    </div>
  );
}

function ListNavigation({ view, onChangeView }: { view: PrimaryView; onChangeView: (v: PrimaryView) => void }) {
  return (
    <section className="flex items-center justify-between gap-3 rounded-2xl p-2.5 md:p-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="hidden min-w-0 sm:block">
        <p className="text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "var(--text-4)" }}>Visualização</p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>Alterne sem repetir os controles do planejamento.</p>
      </div>
      <div className="ml-auto flex items-center overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}>
        <ViewButton active={view === "lista"} onClick={() => onChangeView("lista")} icon={List} label="Lista" />
        <ViewButton active={view === "calendario"} onClick={() => onChangeView("calendario")} icon={CalendarDays} label="Calendário" />
        <ViewButton active={view === "ano"} onClick={() => onChangeView("ano")} icon={BarChart3} label="Ano" />
      </div>
    </section>
  );
}

function PrimaryHeader({ month, setMonth, view, onChangeView }: { month: string; setMonth: (m: string) => void; view: PrimaryView; onChangeView: (v: PrimaryView) => void }) {
  return (
    <section className="rounded-2xl p-4 md:p-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#f0c400,#ffd700)", boxShadow: "0 6px 18px rgba(200,160,0,.28)" }}>
          <CalendarDays className="w-5 h-5 text-black" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-black truncate" style={{ color: "var(--text-1)" }}>Cronograma de Treinamentos</h1>
          <p className="text-sm capitalize mt-0.5" style={{ color: "var(--text-4)" }}>{formatMonth(month)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}>
          <button className="h-10 w-10 flex items-center justify-center" style={{ color: "var(--text-3)" }} onClick={() => setMonth(shiftMonth(month,-1))}><ChevronLeft className="w-4 h-4" /></button>
          <button className="h-10 min-w-[155px] px-3 text-sm font-bold capitalize" style={{ color: "var(--text-1)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }} onClick={() => setMonth(currentMonthStr())}>{formatMonth(month)}</button>
          <button className="h-10 w-10 flex items-center justify-center" style={{ color: "var(--text-3)" }} onClick={() => setMonth(shiftMonth(month,1))}><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}>
          <ViewButton active={view === "lista"} onClick={() => onChangeView("lista")} icon={List} label="Lista" />
          <ViewButton active={view === "calendario"} onClick={() => onChangeView("calendario")} icon={CalendarDays} label="Calendário" />
          <ViewButton active={view === "ano"} onClick={() => onChangeView("ano")} icon={BarChart3} label="Ano" />
        </div>
      </div>
    </section>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return <button onClick={onClick} className="h-10 px-3.5 flex items-center gap-2 text-xs font-bold transition-all" style={active ? { background: "linear-gradient(135deg,#f0c400,#ffd700)", color: "#111", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)" } : { color: "var(--text-3)" }}><Icon className="w-3.5 h-3.5" />{label}</button>;
}

function CalendarView({ month, entries, suspensions, loading }: { month: string; entries: CronogramaEntry[]; suspensions: CronogramaSuspension[]; loading: boolean }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [year, monthIdx] = month.split("-").map(Number);
  const idx = monthIdx - 1;
  const days = new Date(year, idx + 1, 0).getDate();
  const first = new Date(year, idx, 1).getDay();
  const today = new Date();
  const todayDay = today.getFullYear() === year && today.getMonth() === idx ? today.getDate() : null;

  const byDay = useMemo(() => {
    const map: Record<number, CronogramaEntry[]> = {};
    entries.forEach((e) => {
      const raw = e.planned_date || e.completion_date;
      if (!raw) return;
      const d = new Date(`${raw.slice(0,10)}T12:00:00`);
      if (d.getFullYear() === year && d.getMonth() === idx) (map[d.getDate()] ||= []).push(e);
    });
    return map;
  }, [entries, year, idx]);

  const monthSuspended = suspensions.some((s) => s.type === "mes_suspenso" && s.month === month);
  const absenceDays = useMemo(() => {
    const set = new Set<number>();
    suspensions.filter((s) => s.type === "ausencia_operador" && s.date_start && s.date_end).forEach((s) => {
      const start = new Date(`${s.date_start}T12:00:00`);
      const end = new Date(`${s.date_end}T12:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) if (d.getFullYear() === year && d.getMonth() === idx) set.add(d.getDate());
    });
    return set;
  }, [suspensions, year, idx]);

  const cells: Array<number | null> = [];
  for (let i=0;i<first;i++) cells.push(null);
  for (let d=1;d<=days;d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  if (loading) return <Loading />;
  const selected = selectedDay ? (byDay[selectedDay] || []) : [];

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2 text-xs font-bold">
      <Legend icon={Clock3} label="Pendente" color="#f59e0b" />
      <Legend icon={CheckCircle2} label="Realizado" color="#10b981" />
      <Legend icon={ShieldCheck} label="Justificado" color="#3b82f6" />
      {monthSuspended && <Legend icon={PauseCircle} label="Mês suspenso" color="#8b5cf6" />}
    </div>
    <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="grid grid-cols-7">{WEEK.map((w) => <div key={w} className="py-3 text-center text-[11px] font-black uppercase tracking-widest" style={{ background: "var(--bg-surface-2)", color: w === "Dom" || w === "Sáb" ? "#C8102E" : "var(--text-3)", borderBottom: "1px solid var(--border)" }}>{w}</div>)}</div>
      <div className="grid grid-cols-7">{cells.map((day,i) => {
        if (!day) return <div key={`e-${i}`} className="min-h-[92px] md:min-h-[112px]" style={{ background: "var(--bg-surface-2)", opacity:.45, borderRight:"1px solid var(--border-subtle)", borderBottom:"1px solid var(--border-subtle)" }} />;
        const rows = byDay[day] || [];
        const isToday = day === todayDay;
        const isSelected = day === selectedDay;
        const suspended = monthSuspended || absenceDays.has(day);
        const weekend = i%7===0 || i%7===6;
        return <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)} className="min-h-[92px] md:min-h-[112px] text-left p-2 relative transition-colors overflow-hidden" style={{ background: isSelected ? "rgba(240,196,0,.10)" : suspended ? "rgba(139,92,246,.06)" : weekend ? "var(--bg-surface-2)" : "transparent", borderRight:"1px solid var(--border-subtle)", borderBottom:"1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between gap-1 mb-2"><span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black" style={isToday ? {background:"#C8102E",color:"#fff",boxShadow:"0 0 0 3px rgba(200,16,46,.15)"}:{color: weekend ? "#C8102E" : "var(--text-1)"}}>{day}</span><div className="flex items-center gap-1">{rows.length>0&&<span className="text-[9px] font-black px-1.5 py-0.5 rounded-md" style={{background:"var(--bg-surface-3)",color:"var(--text-3)"}}>{rows.length}</span>}{suspended&&<span className="text-[10px]">⏸</span>}</div></div>
          <div className="space-y-1">{rows.slice(0,2).map((e) => { const s = STATUS[e.status]; return <div key={e.id} className="truncate text-[9px] md:text-[10px] font-semibold px-1.5 py-1 rounded-md" style={{background:s.bg,color:s.color,borderLeft:`2px solid ${s.color}`}}>{e.employee_name?.split(" ")[0]} · {e.theme}</div>; })}{rows.length>2&&<div className="text-[9px] font-black" style={{color:"var(--text-4)"}}>+{rows.length-2} mais</div>}</div>
        </button>;
      })}</div>
    </section>
    {selectedDay && <section className="rounded-2xl overflow-hidden" style={{background:"var(--bg-surface)",border:"1px solid rgba(240,196,0,.35)"}}><div className="px-4 py-3 font-black text-sm" style={{background:"rgba(240,196,0,.08)",borderBottom:"1px solid var(--border)",color:"var(--text-1)"}}>{new Date(year,idx,selectedDay).toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</div>{selected.length===0?<p className="p-6 text-center text-sm" style={{color:"var(--text-4)"}}>Nenhum treinamento previsto para este dia.</p>:selected.map((e)=><div key={e.id} className="px-4 py-3 flex items-center gap-3" style={{borderBottom:"1px solid var(--border-subtle)"}}><div className="w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0" style={{background:"linear-gradient(135deg,#f0c400,#ffd700)",color:"#111"}}>{e.employee_name?.charAt(0)}</div><div className="min-w-0 flex-1"><p className="text-sm font-bold" style={{color:"var(--text-1)"}}>{e.employee_name}</p><p className="text-xs truncate" style={{color:"var(--text-3)"}}>{e.theme}</p><p className="text-[10px]" style={{color:"var(--text-4)"}}>Mat. {e.employee_matricula} · {e.employee_sector}</p></div><span className="text-[10px] font-black px-2 py-1 rounded-full shrink-0" style={{background:STATUS[e.status].bg,color:STATUS[e.status].color}}>{e.status}</span></div>)}</section>}
  </div>;
}

function AnnualView({ year, currentMonth, entries, onSelectMonth, loading }: { year:number; currentMonth:string; entries:CronogramaEntry[]; onSelectMonth:(m:string)=>void; loading:boolean }) {
  const rows = annualSummary(entries,year);
  if (loading) return <Loading />;
  return <section className="rounded-2xl overflow-hidden" style={{background:"var(--bg-surface)",border:"1px solid var(--border)",boxShadow:"var(--shadow-card, var(--shadow-md))"}}><div className="px-4 py-3 flex items-center gap-2" style={{background:"var(--bg-surface-2)",borderBottom:"1px solid var(--border)"}}><span className="font-black text-sm uppercase tracking-widest" style={{color:"var(--text-1)"}}>📆 Visão anual — {year}</span><span className="ml-auto text-xs hidden sm:block" style={{color:"var(--text-4)"}}>Clique em um mês para navegar</span></div><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6">{rows.map((m)=>{const current=m.month===currentMonth; const pct=m.executionRate; const color=pct>=80?"#10b981":pct>=50?"#f59e0b":"#ef4444"; return <button key={m.month} onClick={()=>onSelectMonth(m.month)} className="p-4 min-h-[118px] flex flex-col items-center justify-center relative" style={{border:"1px solid var(--border-subtle)",background:current?"rgba(200,16,46,.05)":"transparent"}}>{current&&<span className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-[#C8102E]"/>}<p className="text-xs font-black capitalize mb-2" style={{color:current?"#C8102E":"var(--text-2)"}}>{new Date(year,Number(m.month.slice(5))-1,1).toLocaleDateString("pt-BR",{month:"short"}).replace(".","")} de {String(year).slice(-2)}</p><div className="relative w-11 h-11"><svg viewBox="0 0 36 36" className="w-full h-full -rotate-90"><circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-surface-3)" strokeWidth="3.5"/><circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3.5" strokeDasharray={`${pct*.879} 87.9`} strokeLinecap="round"/></svg><span className="absolute inset-0 flex items-center justify-center text-[10px] font-black" style={{color}}>{m.total?`${pct}%`:"—"}</span></div><p className="mt-1 text-[9px]" style={{color:"var(--text-4)"}}>{m.total?`${m.realizado}/${m.total}`:"Sem reg."}</p>{m.pendente>0&&<span className="mt-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{background:"rgba(245,158,11,.12)",color:"#f59e0b",border:"1px dashed rgba(245,158,11,.45)"}}>⏳ {m.pendente} plan.</span>}</button>})}</div></section>;
}

function Legend({ icon: Icon, label, color }: { icon: typeof Clock3; label:string; color:string }) { return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{background:`${color}18`,color,border:`1px solid ${color}44`}}><Icon className="w-3.5 h-3.5"/>{label}</span>; }
function Loading(){return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-4 animate-spin" style={{borderColor:"var(--border)",borderTopColor:"#C8102E"}}/></div>}