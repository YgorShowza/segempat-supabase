import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, CheckCircle2, Clock3, Award, Target, AlertTriangle, BarChart3 } from "lucide-react";
import { listCronogramaEntriesByYear } from "@/lib/cronograma";
import { listAttemptsByYear } from "@/lib/exams";
import { operationalYear } from "@/lib/operational-time";

export const Route = createFileRoute("/_authenticated/progresso")({ head: () => ({ meta: [{ title: "Progresso · SEGEMPAT" }] }), component: ProgressPage });

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <div className={`rounded-2xl ${className}`} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>{children}</div>; }
function Metric({label,value,icon:Icon,accent,sub}:{label:string;value:string|number;icon:typeof Target;accent:string;sub:string}){return <Card className="relative overflow-hidden p-4"><div className="absolute left-0 top-0 h-[3px] w-full" style={{background:accent}}/><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.13em]" style={{color:"var(--text-4)"}}>{label}</p><p className="mt-2 text-3xl font-black" style={{color:"var(--text-1)"}}>{value}</p><p className="mt-1 text-[11px] font-semibold" style={{color:accent}}>{sub}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{background:`${accent}12`,border:`1px solid ${accent}30`}}><Icon className="h-4 w-4" style={{color:accent}}/></div></div></Card>}

function ProgressPage() {
  const year = operationalYear();
  const cron = useQuery({ queryKey: ["my-progress-cron", year], queryFn: () => listCronogramaEntriesByYear(year) });
  const attempts = useQuery({ queryKey: ["my-progress-attempts", year], queryFn: () => listAttemptsByYear(year) });

  if (cron.isLoading || attempts.isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
  if (cron.isError || attempts.isError) return <Card className="mx-auto max-w-xl p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-500"/><p className="mt-3 font-bold" style={{color:"var(--text-1)"}}>Não foi possível carregar seu progresso.</p><p className="mt-1 text-sm" style={{color:"var(--text-4)"}}>Atualize a página. Se o problema persistir, informe a Inspetoria.</p></Card>;

  const rows = cron.data ?? [];
  const ats = attempts.data ?? [];
  const done = rows.filter((e) => e.status === "Realizado").length;
  const pending = rows.filter((e) => e.status === "Pendente").length;
  const justified = rows.filter((e) => e.status === "Justificado").length;
  const passed = ats.filter((a) => a.passed).length;
  const execution = rows.length ? Math.round(done / rows.length * 100) : 0;
  const approval = ats.length ? Math.round(passed / ats.length * 100) : 0;
  const avg = ats.length ? Math.round(ats.reduce((s,a) => s + Number(a.score || 0), 0) / ats.length * 10) / 10 : 0;
  const recentRows = rows.slice().sort((a,b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0,6);
  const recentAttempts = ats.slice().sort((a,b) => (b.finished_at || "").localeCompare(a.finished_at || "")).slice(0,6);

  return <div className="mx-auto max-w-5xl space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6" style={{background:"linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)",border:"1px solid rgba(200,16,46,.28)",boxShadow:"0 12px 38px rgba(80,0,18,.16)"}}><div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{background:"radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)"}}/><div className="relative"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em]" style={{color:"rgba(255,255,255,.44)"}}><TrendingUp className="h-4 w-4"/> Evolução operacional</div><h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Meu Progresso</h1><p className="mt-1 text-sm" style={{color:"rgba(255,255,255,.52)"}}>Seu desempenho real em treinamentos e provas · {year}.</p></div></section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Execução" value={`${execution}%`} icon={Target} accent="#3b82f6" sub={`${done}/${rows.length||0} concluídos`}/><Metric label="Pendências" value={pending} icon={Clock3} accent="#f59e0b" sub={`${justified} justificada(s)`}/><Metric label="Aprovação" value={`${approval}%`} icon={Award} accent="#10b981" sub={`${passed}/${ats.length||0} tentativas`}/><Metric label="Média provas" value={avg} icon={BarChart3} accent="#e11d48" sub="nota consolidada"/></div>

    <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black" style={{ color: "var(--text-1)" }}>Cobertura do cronograma</h2><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{done} de {rows.length} atividades concluídas</p></div><span className="text-2xl font-black" style={{ color: execution >= 80 ? "#10b981" : execution >= 50 ? "#f59e0b" : "#e11d48" }}>{execution}%</span></div><div className="mt-4 h-3 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${execution}%`, background: execution >= 80 ? "linear-gradient(90deg,#059669,#10b981)" : execution >= 50 ? "linear-gradient(90deg,#d97706,#f59e0b)" : "linear-gradient(90deg,#9f1239,#e11d48)" }} /></div><div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold" style={{color:"var(--text-4)"}}><span className="text-emerald-500">✓ {done} realizados</span><span className="text-amber-500">⏳ {pending} pendentes</span><span className="text-blue-500">🛡 {justified} justificados</span></div></Card>

    <div className="grid gap-4 md:grid-cols-2">
      <Card className="overflow-hidden"><div className="flex items-center gap-2 p-4" style={{borderBottom:"1px solid var(--border)"}}><CheckCircle2 className="h-4 w-4 text-emerald-500"/><div><h2 className="text-sm font-black" style={{color:"var(--text-1)"}}>Últimas atividades</h2><p className="mt-0.5 text-[11px]" style={{color:"var(--text-4)"}}>Movimentações recentes do cronograma</p></div></div><div className="divide-y" style={{borderColor:"var(--border-subtle)"}}>{recentRows.map(e=>{const color=e.status==="Realizado"?"#10b981":e.status==="Pendente"?"#f59e0b":"#60a5fa";return <div key={e.id} className="relative flex items-center justify-between gap-3 p-4 pl-5"><div className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r" style={{background:color}}/><div className="min-w-0"><p className="break-words text-sm font-black" style={{color:"var(--text-1)"}}>{e.theme}</p><p className="mt-1 text-xs" style={{color:"var(--text-4)"}}>{e.month}</p></div><span className="shrink-0 rounded-lg px-2 py-1 text-[9px] font-black" style={{color,background:`${color}12`}}>{e.status}</span></div>})}{!rows.length&&<p className="p-6 text-sm" style={{color:"var(--text-4)"}}>Sem atividades registradas.</p>}</div></Card>

      <Card className="overflow-hidden"><div className="flex items-center gap-2 p-4" style={{borderBottom:"1px solid var(--border)"}}><Award className="h-4 w-4 text-amber-500"/><div><h2 className="text-sm font-black" style={{color:"var(--text-1)"}}>Histórico de provas</h2><p className="mt-0.5 text-[11px]" style={{color:"var(--text-4)"}}>Resultados formais mais recentes</p></div></div><div className="divide-y" style={{borderColor:"var(--border-subtle)"}}>{recentAttempts.map(a=>{const color=a.passed?"#10b981":"#ef4444";return <div key={a.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-black" style={{color:"var(--text-1)"}}>Nota {Number(a.score||0).toFixed(1)}</p><p className="mt-1 text-xs" style={{color:"var(--text-4)"}}>{new Date(a.finished_at).toLocaleDateString("pt-BR", { timeZone: "America/Maceio" })}</p></div><span className="rounded-lg px-2 py-1 text-[9px] font-black" style={{color,background:`${color}12`}}>{a.passed?"APROVADO":"REPROVADO"}</span></div>})}{!ats.length&&<p className="p-6 text-sm" style={{color:"var(--text-4)"}}>Sem provas realizadas.</p>}</div></Card>
    </div>
  </div>;
}
