import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock3, CalendarDays, BookOpen, CheckCircle2, AlertTriangle, CalendarClock, PlayCircle, RefreshCw, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCronogramaEntriesByYear, formatDate } from "@/lib/cronograma";
import { listAvailableExams } from "@/lib/exams";
import { addOperationalDays, operationalDate, operationalYear } from "@/lib/operational-time";

export const Route = createFileRoute("/_authenticated/pendencias")({ head: () => ({ meta: [{ title: "Pendências · SEGEMPAT" }] }), component: PendingPage });

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <div className={`rounded-2xl ${className}`} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>{children}</div>; }
function Metric({label,value,icon:Icon,accent,sub}:{label:string;value:number;icon:typeof Clock3;accent:string;sub:string}){return <Card className="relative overflow-hidden p-4"><div className="absolute left-0 top-0 h-[3px] w-full" style={{background:accent}}/><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.13em]" style={{color:"var(--text-4)"}}>{label}</p><p className="mt-2 text-3xl font-black" style={{color:"var(--text-1)"}}>{value}</p><p className="mt-1 text-[11px] font-semibold" style={{color:accent}}>{sub}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{background:`${accent}12`,border:`1px solid ${accent}30`}}><Icon className="h-4 w-4" style={{color:accent}}/></div></div></Card>}

function PendingPage() {
  const year = operationalYear();
  const query = useQuery({ queryKey: ["my-pending", year], queryFn: () => listCronogramaEntriesByYear(year) });
  const exams = useQuery({ queryKey: ["my-pending-available-exams"], queryFn: listAvailableExams });

  if (query.isLoading || exams.isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
  if (query.isError || exams.isError) return <Card className="mx-auto max-w-xl p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-500"/><p className="mt-3 font-black" style={{color:"var(--text-1)"}}>Não foi possível carregar suas pendências.</p><p className="mt-1 text-sm" style={{color:"var(--text-4)"}}>Tente novamente. Se o problema persistir, informe a Inspetoria.</p><Button variant="outline" className="mt-4" onClick={()=>{query.refetch();exams.refetch();}}><RefreshCw className="mr-2 h-4 w-4"/> Tentar novamente</Button></Card>;

  const data=query.data??[];
  const availableExamIds = new Set((exams.data ?? []).map((exam) => exam.id));
  const pending = data.filter((e) => e.status === "Pendente").sort((a,b) => (a.planned_date || "9999-12-31").localeCompare(b.planned_date || "9999-12-31"));
  const today = operationalDate();
  const nextSeven = addOperationalDays(today, 7);
  const overdue=pending.filter(e=>Boolean(e.planned_date && e.planned_date < today)).length;
  const upcoming=pending.filter(e=>Boolean(e.planned_date && e.planned_date >= today && e.planned_date <= nextSeven)).length;
  const completed=data.filter(e=>e.status==="Realizado").length;

  return <div className="mx-auto max-w-5xl space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6" style={{background:"linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)",border:"1px solid rgba(200,16,46,.28)",boxShadow:"0 12px 38px rgba(80,0,18,.16)"}}><div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{background:"radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)"}}/><div className="relative"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em]" style={{color:"rgba(255,255,255,.44)"}}><Clock3 className="h-4 w-4"/> Prioridades operacionais</div><h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Minhas Pendências</h1><p className="mt-1 text-sm" style={{color:"rgba(255,255,255,.52)"}}>Treinamentos e avaliações que ainda exigem sua atenção · {year}.</p></div></section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Pendentes" value={pending.length} icon={Clock3} accent="#f59e0b" sub="total em aberto"/><Metric label="Vencidas" value={overdue} icon={AlertTriangle} accent="#e11d48" sub="data prevista ultrapassada"/><Metric label="Próx. 7 dias" value={upcoming} icon={CalendarClock} accent="#3b82f6" sub="atenção imediata"/><Metric label="Concluídos" value={completed} icon={CheckCircle2} accent="#10b981" sub="realizados no ano"/></div>

    {pending.length === 0 ? <Card className="p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{background:"rgba(16,185,129,.10)",border:"1px solid rgba(16,185,129,.18)"}}><CheckCircle2 className="h-7 w-7 text-emerald-500" /></div><p className="mt-4 font-black" style={{ color: "var(--text-1)" }}>Você está em dia.</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Nenhuma pendência registrada neste momento.</p></Card> : <div className="space-y-3">{pending.map((e) => {const late=Boolean(e.planned_date&&e.planned_date<today);const accent=late?"#e11d48":"#f59e0b";const canStart=Boolean(e.exam_id&&availableExamIds.has(e.exam_id));return <Card key={e.id} className="relative overflow-hidden"><div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{background:accent}}/><div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{background:`${accent}12`,border:`1px solid ${accent}25`}}><BookOpen className="h-4 w-4" style={{color:accent}} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-black" style={{ color: "var(--text-1)" }}>{e.theme}</p>{late&&<span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{background:"rgba(225,29,72,.10)",color:"#e11d48"}}>VENCIDA</span>}</div><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{e.employee_sector} · {e.type}</p><div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-3)" }}><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Previsto: {formatDate(e.planned_date)}</span>{e.exam_title && <span>Prova: {e.exam_title}</span>}</div></div></div>{canStart?<Link to="/prova-realizar" search={{id:e.exam_id!}} className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black text-white sm:w-auto" style={{background:"#C8102E"}}><PlayCircle className="h-3.5 w-3.5"/> Realizar prova</Link>:e.exam_id?<span className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black sm:w-auto" style={{background:"var(--bg-surface-3)",border:"1px solid var(--border)",color:"var(--text-4)"}}><LockKeyhole className="h-3.5 w-3.5"/> Aguardando liberação</span>:null}</div></Card>})}</div>}
  </div>;
}
