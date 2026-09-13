import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Play, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listActiveQuestionBank, type OperationalQuestionBankItem } from "@/lib/question-bank";
import { submitTrainingActivity } from "@/lib/training-activities";
import { getCurrentEmployeeByAuth } from "@/lib/insights";

function shuffle<T>(items: T[]) { return [...items].sort(() => Math.random() - 0.5); }

export function StressTestWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const employeeQuery = useQuery({ queryKey: ["current-employee-training"], queryFn: getCurrentEmployeeByAuth, staleTime: 60_000 });
  const scenariosQuery = useQuery({ queryKey: ["question-bank-operational"], queryFn: listActiveQuestionBank, staleTime: 60_000 });
  const [session, setSession] = useState<OperationalQuestionBankItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<{ scenarioId: string; selectedIndex: number; timedOut: boolean }[]>([]);
  const [finished, setFinished] = useState<{ correct: number; score: number; xp: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const eligible = useMemo(() => {
    const sector = employeeQuery.data?.sector || "";
    if (!sector) return [];
    return (scenariosQuery.data ?? []).filter((row) => row.bank_type === "simulacoes" && (row.target_sector === "Todos" || row.target_sector === sector));
  }, [scenariosQuery.data, employeeQuery.data?.sector]);

  const start = () => {
    setSession(shuffle(eligible).slice(0, Math.min(5, eligible.length)));
    setCurrent(0); setTimeLeft(30); setSelected(null); setResults([]); setFinished(null); setSubmitError(null);
  };

  const scenario = session[current];
  const answered = selected !== null || (scenario && results.some((r) => r.scenarioId === scenario.id));

  const registerChoice = (index: number, timedOut = false) => {
    if (!scenario || answered) return;
    setSelected(index);
    setSubmitError(null);
    setResults((prev) => [...prev, { scenarioId: scenario.id, selectedIndex: index, timedOut }]);
  };

  useEffect(() => {
    if (!session.length || finished || answered || submitting) return;
    if (timeLeft <= 0) {
      if (scenario) {
        setResults((prev) => [...prev, { scenarioId: scenario.id, selectedIndex: -1, timedOut: true }]);
        setSelected(-1);
      }
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [session.length, current, timeLeft, answered, finished, submitting, scenario]);

  const next = async () => {
    if (!scenario || !answered) return;
    if (current < session.length - 1) {
      setCurrent((value) => value + 1); setSelected(null); setTimeLeft(30); setSubmitError(null); return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await submitTrainingActivity({
        activityType: "Stress Test",
        activityTitle: "Stress Test Operacional",
        answers: results.map((item) => ({ scenario_id: item.scenarioId, selected_index: item.selectedIndex, timed_out: item.timedOut })),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["current-employee-training"] }),
        queryClient.invalidateQueries({ queryKey: ["training-activities-my"] }),
      ]);
      setFinished({ correct: Number(response.correct_count ?? 0), score: Number(response.score), xp: response.points_earned });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível registrar o Stress Test. Tente novamente.");
    } finally { setSubmitting(false); }
  };

  if (scenariosQuery.isLoading || employeeQuery.isLoading) return <div className="flex justify-center py-20"><div className="h-9 w-9 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#f59e0b" }} /></div>;

  if (scenariosQuery.isError || employeeQuery.isError) return <div className="mx-auto max-w-lg rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500"/><p className="font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o Stress Test</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Os cenários ou seu vínculo operacional não foram carregados.</p><Button variant="outline" className="mt-4" onClick={() => { scenariosQuery.refetch(); employeeQuery.refetch(); }}><RefreshCw className="mr-2 h-4 w-4"/> Tentar novamente</Button></div>;

  if (!employeeQuery.data) return <div className="mx-auto max-w-lg rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><ShieldCheck className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--accent)" }} /><p className="font-black" style={{ color: "var(--text-1)" }}>Colaborador não localizado</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Não foi possível vincular sua matrícula ao cadastro operacional.</p></div>;

  if (finished) return <div className="mx-auto max-w-2xl space-y-5 py-6 text-center"><div className="text-6xl">⚡</div><section className="rounded-3xl p-7" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: "var(--text-4)" }}>Stress Test concluído</p><h1 className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{finished.correct}/{session.length} decisões corretas</h1><p className="mt-3 text-5xl font-black" style={{ color: finished.score >= 7 ? "#10b981" : "#C8102E" }}>{finished.score.toFixed(1)}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Resultado oficial calculado pelo servidor</p><div className="mt-4 inline-flex rounded-full bg-amber-500 px-4 py-2 text-sm font-black text-white">{finished.xp > 0 ? `+${finished.xp} XP` : "XP diário já recebido"}</div></section><div className="grid grid-cols-2 gap-3"><Button variant="outline" onClick={start}>Refazer</Button><Button className="bg-[#C8102E] text-white" onClick={() => navigate({ to: "/painel" })}>Voltar ao painel</Button></div></div>;

  if (!session.length) return <div className="mx-auto max-w-2xl space-y-5 pb-10"><section className="rounded-[1.6rem] p-6 text-center" style={{ background: "linear-gradient(135deg,#2d1905,#4a2705 50%,#16110b)", border: "1px solid rgba(245,158,11,.3)" }}><div className="text-5xl">⚡</div><h1 className="mt-3 text-2xl font-black text-white">Stress Test</h1><p className="mt-1 text-sm text-white/55">5 rodadas · 30 segundos cada · decisão sob pressão.</p></section><section className="rounded-2xl p-5 space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><div className="flex gap-3 rounded-xl p-4" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)" }}><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500"/><p className="text-sm leading-6" style={{ color: "var(--text-2)" }}>Cada rodada encerra em 30 segundos. Resposta não enviada dentro do tempo é registrada como incorreta. Cenários compatíveis com o setor <strong>{employeeQuery.data.sector}</strong>. O histórico sempre é salvo; a primeira conclusão do dia rende até 25 XP.</p></div>{eligible.length < 1 && <p className="rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,.07)", color: "#ef4444", border: "1px solid rgba(239,68,68,.22)" }}>Não há cenários ativos compatíveis com seu setor.</p>}<Button onClick={start} disabled={eligible.length < 1} className="w-full bg-amber-500 text-white hover:bg-amber-600"><Play className="mr-2 h-4 w-4"/> Iniciar Stress Test</Button></section></div>;

  const timerColor = timeLeft > 15 ? "#10b981" : timeLeft > 5 ? "#f59e0b" : "#ef4444";
  const currentResult = results.find((r) => r.scenarioId === scenario?.id);
  return <div className="mx-auto max-w-2xl space-y-4 pb-10"><div className="flex items-center justify-between"><span className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white">Rodada {current + 1}/{session.length}</span><div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: `${timerColor}12`, border: `1px solid ${timerColor}` }}><Clock className="h-4 w-4" style={{ color: timerColor }}/><span className="font-mono text-lg font-black" style={{ color: timerColor }}>{timeLeft}s</span></div></div><div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}><div className="h-full transition-[width] duration-1000" style={{ width: `${(timeLeft/30)*100}%`, background: timerColor }}/></div><section className="rounded-2xl p-5" style={{ background: "rgba(245,158,11,.07)", border: "1.5px solid rgba(245,158,11,.3)" }}><div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-600"><Zap className="h-4 w-4"/> Situação sob pressão</div><p className="text-sm font-bold leading-6" style={{ color: "var(--text-1)" }}>{scenario?.question_text}</p></section><div className="space-y-2.5">{scenario?.options.map((option,index)=>{const active=answered&&index===selected;return <button key={index} onClick={()=>registerChoice(index)} disabled={answered} className="w-full rounded-xl p-4 text-left text-sm font-semibold transition-colors" style={{background:active?"rgba(245,158,11,.09)":"var(--bg-surface)",border:`1.5px solid ${active?"rgba(245,158,11,.55)":"var(--border)"}`,color:active?"#f59e0b":"var(--text-2)"}}><span className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black" style={{background:active?"#f59e0b":"var(--bg-surface-2)",color:active?"white":"var(--text-4)"}}>{String.fromCharCode(65+index)}</span><span className="flex-1">{option}</span>{active?<CheckCircle2 className="h-4 w-4"/>:null}</span></button>})}</div>{answered&&<section className="rounded-xl p-4" style={{background:currentResult?.timedOut?"rgba(239,68,68,.07)":"rgba(245,158,11,.08)",border:"1px solid var(--border)"}}><p className="text-sm font-black" style={{color:currentResult?.timedOut?"#ef4444":"#f59e0b"}}>{currentResult?.timedOut?"Tempo esgotado":"Resposta registrada"}</p><p className="mt-1 text-sm leading-6" style={{color:"var(--text-2)"}}>A correção é feita de forma segura pelo servidor ao finalizar o Stress Test.</p></section>}{submitError&&<section className="rounded-xl p-3 text-sm" style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",color:"#dc2626"}}>{submitError}</section>}{answered&&<Button onClick={next} disabled={submitting} className="w-full bg-[#C8102E] text-white">{current<session.length-1?"Próxima rodada":submitting?"Registrando...":submitError?"Tentar registrar novamente":"Finalizar Stress Test"}</Button>}</div>;
}
