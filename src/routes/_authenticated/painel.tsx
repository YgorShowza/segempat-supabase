import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, ClipboardList, TrendingUp, ClipboardCheck, FileText, AlertTriangle, CheckCircle2, Target, ShieldCheck, CalendarClock, LockKeyhole } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { formatDate, listCronogramaEntriesByYear } from "@/lib/cronograma";
import { listAvailableExams, listAttemptsByYear } from "@/lib/exams";
import { operationalYear } from "@/lib/operational-time";

export const Route = createFileRoute("/_authenticated/painel")({ head:()=>({meta:[{title:"Início · SEGEMPAT"}]}), component:PanelPage });

function Card({children,className=""}:{children:React.ReactNode;className?:string}){return <div className={`rounded-2xl ${className}`} style={{background:"var(--bg-surface)",border:"1px solid var(--border)",boxShadow:"var(--shadow-card, var(--shadow-md))"}}>{children}</div>}
function Metric({label,value,icon:Icon,accent,sub}:{label:string;value:string|number;icon:typeof ClipboardList;accent:string;sub:string}){return <Card className="relative overflow-hidden p-4"><div className="absolute left-0 top-0 h-[3px] w-full" style={{background:accent}}/><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.13em]" style={{color:"var(--text-4)"}}>{label}</p><p className="mt-2 text-3xl font-black" style={{color:"var(--text-1)"}}>{value}</p><p className="mt-1 text-[11px] font-semibold" style={{color:accent}}>{sub}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{background:`${accent}12`,border:`1px solid ${accent}30`}}><Icon className="h-4 w-4" style={{color:accent}}/></div></div></Card>}

function PanelPage(){
  const {data:user}=useCurrentUser();
  const year=operationalYear();
  const cron=useQuery({queryKey:["panel-cron",year],queryFn:()=>listCronogramaEntriesByYear(year)});
  const exams=useQuery({queryKey:["panel-available-exams"],queryFn:listAvailableExams});
  const attempts=useQuery({queryKey:["panel-attempts",year],queryFn:()=>listAttemptsByYear(year)});

  const loading=cron.isLoading||exams.isLoading||attempts.isLoading;
  const failed=cron.isError||exams.isError||attempts.isError;

  if(loading)return <div className="flex justify-center py-20"><div className="h-9 w-9 animate-spin rounded-full border-4" style={{borderColor:"var(--border)",borderTopColor:"#C8102E"}}/></div>;
  if(failed)return <Card className="mx-auto max-w-xl p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-500"/><p className="mt-3 font-bold" style={{color:"var(--text-1)"}}>Não foi possível carregar o painel.</p><p className="mt-1 text-sm" style={{color:"var(--text-4)"}}>Tente atualizar a página. Se persistir, informe a Inspetoria.</p></Card>;

  const rows=cron.data??[];
  const pending=rows.filter(e=>e.status==="Pendente").sort((a,b)=>(a.planned_date||"9999-12-31").localeCompare(b.planned_date||"9999-12-31"));
  const done=rows.filter(e=>e.status==="Realizado").length;
  const justified=rows.filter(e=>e.status==="Justificado").length;
  const available=exams.data??[];
  const availableExamIds=new Set(available.map(exam=>exam.id));
  const myAttempts=attempts.data??[];
  const passed=myAttempts.filter(a=>a.passed).length;
  const execution=rows.length?Math.round(done/rows.length*100):0;
  const approval=myAttempts.length?Math.round((passed/myAttempts.length)*100):0;
  const first=user?.nome?.split(" ")[0]||"colaborador";
  const now=new Date();
  const h=Number(new Intl.DateTimeFormat("en-US",{hour:"2-digit",hourCycle:"h23",timeZone:"America/Maceio"}).format(now));
  const greeting=h<12?"Bom dia":h<18?"Boa tarde":"Boa noite";
  const links=[
    {to:"/pendencias",label:"Pendências",icon:ClipboardList,sub:`${pending.length} pendente(s)`,accent:"#f59e0b"},
    {to:"/provas",label:"Provas",icon:FileText,sub:`${available.length} publicada(s)`,accent:"#e11d48"},
    {to:"/progresso",label:"Progresso",icon:TrendingUp,sub:`${execution}% executado`,accent:"#3b82f6"},
    {to:"/pratico",label:"Avaliação Prática",icon:ClipboardCheck,sub:"Acompanhar",accent:"#8b5cf6"},
    {to:"/minhas-ocorrencias",label:"Ocorrências",icon:AlertTriangle,sub:"Registrar/consultar",accent:"#f97316"},
  ];

  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6" style={{background:"linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)",border:"1px solid rgba(200,16,46,.28)",boxShadow:"0 12px 38px rgba(80,0,18,.16)"}}>
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{background:"radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)"}}/>
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em]" style={{color:"rgba(255,255,255,.44)"}}><LayoutDashboard className="h-4 w-4"/> Painel operacional</div><h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">{greeting}, {first}</h1><p className="mt-1 text-sm" style={{color:"rgba(255,255,255,.52)"}}>Mat. {user?.matricula||"—"}{user?.setor?` · ${user.setor}`:""} · acompanhe suas prioridades e desempenho.</p></div>
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.13)"}}><span className={`h-2.5 w-2.5 rounded-full ${pending.length?"bg-amber-400":"bg-emerald-500"}`}/><div><p className="text-[10px] font-black uppercase tracking-[.1em]" style={{color:"rgba(255,255,255,.40)"}}>Situação</p><p className="text-sm font-black text-white">{pending.length?`${pending.length} pendência${pending.length===1?"":"s"}`:"Em dia"}</p></div></div>
      </div>
    </section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Pendências" value={pending.length} icon={CalendarClock} accent="#f59e0b" sub={`${justified} justificada(s)`}/><Metric label="Concluídos" value={done} icon={CheckCircle2} accent="#10b981" sub={`${rows.length} planejado(s)`}/><Metric label="Execução" value={`${execution}%`} icon={Target} accent="#3b82f6" sub="cobertura anual"/><Metric label="Aprovação" value={`${approval}%`} icon={ShieldCheck} accent="#e11d48" sub={`${passed}/${myAttempts.length||0} tentativas`}/></div>

    {pending.length>0?<Card className="overflow-hidden"><div className="flex items-center gap-2 p-4" style={{borderBottom:"1px solid var(--border)"}}><ClipboardList className="h-4 w-4 text-amber-500"/><div><h2 className="text-sm font-black" style={{color:"var(--text-1)"}}>Próximas pendências</h2><p className="mt-0.5 text-[11px]" style={{color:"var(--text-4)"}}>Prioridades mais próximas do seu cronograma</p></div><Link to="/pendencias" className="ml-auto text-xs font-bold" style={{color:"var(--accent)"}}>Ver todas</Link></div><div className="space-y-2 p-3">{pending.slice(0,4).map(e=>{const canStart=Boolean(e.exam_id&&availableExamIds.has(e.exam_id));return <div key={e.id} className="relative flex flex-col gap-3 overflow-hidden rounded-xl p-3 pl-4 sm:flex-row sm:items-center sm:justify-between" style={{background:"var(--bg-surface-2)",border:"1px solid var(--border-subtle)"}}><div className="absolute bottom-0 left-0 top-0 w-[3px] bg-amber-500"/><div className="min-w-0"><p className="break-words text-sm font-black" style={{color:"var(--text-1)"}}>{e.theme}</p><p className="mt-1 text-xs" style={{color:"var(--text-4)"}}>{e.planned_date?formatDate(e.planned_date):"Sem data definida"} · {e.type}</p></div>{canStart?<Link to="/prova-realizar" search={{id:e.exam_id!}} className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-xs font-black text-white" style={{background:"#C8102E"}}>Realizar prova</Link>:e.exam_id?<span className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-black" style={{background:"var(--bg-surface-3)",border:"1px solid var(--border)",color:"var(--text-4)"}}><LockKeyhole className="h-3 w-3"/> Aguardando liberação</span>:null}</div>})}</div></Card>:<Card className="flex items-center gap-3 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{background:"rgba(16,185,129,.10)",border:"1px solid rgba(16,185,129,.18)"}}><CheckCircle2 className="h-5 w-5 text-emerald-500"/></div><div><p className="font-black" style={{color:"var(--text-1)"}}>Você está em dia.</p><p className="mt-1 text-sm" style={{color:"var(--text-4)"}}>Nenhuma pendência registrada neste momento.</p></div></Card>}

    <Card className="p-3 md:p-4"><div className="mb-3 flex items-center gap-2 px-1"><span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{background:"var(--accent-soft)"}}><Target className="h-3.5 w-3.5" style={{color:"var(--accent)"}}/></span><h2 className="text-xs font-black uppercase tracking-[.08em]" style={{color:"var(--text-3)"}}>Acesso rápido</h2></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{links.map(({to,label,icon:Icon,sub,accent})=><Link key={to} to={to as any}><div className="relative flex h-full min-h-[92px] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl p-3 text-center transition-transform duration-150 hover:-translate-y-0.5" style={{background:"var(--bg-surface-2)",border:"1px solid var(--border)"}}><div className="absolute -right-7 -top-7 h-16 w-16 rounded-full opacity-[.08]" style={{background:accent}}/><div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{background:`${accent}12`}}><Icon className="h-4 w-4" style={{color:accent}}/></div><div><p className="text-[11px] font-black" style={{color:"var(--text-2)"}}>{label}</p><p className="mt-0.5 text-[9px]" style={{color:"var(--text-4)"}}>{sub}</p></div></div></Link>)}</div></Card>
  </div>;
}
