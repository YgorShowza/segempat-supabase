import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Loader2, LockKeyhole, RefreshCw, Sparkles, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listActiveQuestionBank, type OperationalQuestionBankItem } from "@/lib/question-bank";
import { getCurrentEmployeeByAuth } from "@/lib/insights";
import { listMyTrainingActivities, submitTrainingActivity } from "@/lib/training-activities";

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function localDay() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Maceio", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function DailyChallengeWorkspace() {
  const queryClient = useQueryClient();
  const employee = useQuery({ queryKey: ["current-employee-training"], queryFn: getCurrentEmployeeByAuth, staleTime: 60_000 });
  const bank = useQuery({ queryKey: ["question-bank-operational"], queryFn: listActiveQuestionBank, staleTime: 60_000 });
  const activities = useQuery({ queryKey: ["training-activities-my"], queryFn: listMyTrainingActivities, staleTime: 30_000 });

  const [questions, setQuestions] = useState<OperationalQuestionBankItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; correct: number; points: number; passed: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const today = localDay();
  const completedToday = useMemo(() => (activities.data ?? []).find((item) => item.activity_type === "Desafio Diário" && item.activity_day === today), [activities.data, today]);

  const eligible = useMemo(() => {
    const sector = employee.data?.sector;
    return (bank.data ?? []).filter((item) => {
      const optionsOk = Array.isArray(item.options) && item.options.length >= 2;
      const sectorOk = !sector || item.target_sector === "Todos" || item.target_sector === sector;
      return item.active && item.bank_type === "treinamento_dinamico" && optionsOk && sectorOk;
    });
  }, [bank.data, employee.data?.sector]);

  const start = () => {
    setQuestions(shuffled(eligible).slice(0, 3));
    setCurrent(0);
    setAnswers({});
    setResult(null);
    setSubmitError(null);
  };

  const finish = async () => {
    if (!questions.length) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await submitTrainingActivity({
        activityType: "Desafio Diário",
        activityTitle: `Desafio Diário · ${today}`,
        answers: questions.map((question) => ({ question_id: question.id, selected_index: answers[question.id] ?? -1 })),
      });
      setResult({ score: Number(response.score), correct: Number(response.correct_count ?? 0), points: response.points_earned, passed: response.passed });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["current-employee-training"] }),
        queryClient.invalidateQueries({ queryKey: ["training-activities-my"] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível registrar o desafio.";
      setSubmitError(message.includes("já realizado hoje") ? "O Desafio Diário de hoje já foi concluído." : message);
    } finally { setSubmitting(false); }
  };

  if (employee.isLoading || bank.isLoading || activities.isLoading) return <Loading />;

  if (employee.isError || bank.isError || activities.isError) {
    return <div className="mx-auto max-w-lg rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><LockKeyhole className="mx-auto mb-3 h-10 w-10 text-amber-500" /><p className="font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o Desafio Diário</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Tente novamente. Se o problema persistir, informe a Inspetoria.</p><Button variant="outline" className="mt-4" onClick={() => { employee.refetch(); bank.refetch(); activities.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></div>;
  }

  if (!employee.data) return <div className="mx-auto max-w-lg rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><LockKeyhole className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--accent)" }} /><p className="font-black" style={{ color: "var(--text-1)" }}>Colaborador não localizado</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Não foi possível vincular sua matrícula ao cadastro operacional.</p></div>;

  if (completedToday && !result) return <div className="mx-auto max-w-lg space-y-5 py-8 text-center"><div className="text-6xl">🏆</div><section className="rounded-2xl p-7" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(139,92,246,.12)", color: "#8b5cf6" }}><CheckCircle2 className="h-6 w-6" /></div><h1 className="mt-4 text-2xl font-black" style={{ color: "var(--text-1)" }}>Desafio de hoje concluído</h1><p className="mt-2 text-sm" style={{ color: "var(--text-4)" }}>Volte amanhã para um novo desafio e uma nova recompensa.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Nota</p><p className="mt-1 text-2xl font-black" style={{ color: Number(completedToday.score) >= 7 ? "#10b981" : "#f59e0b" }}>{Number(completedToday.score).toFixed(1)}</p></div><div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>XP recebido</p><p className="mt-1 text-2xl font-black" style={{ color: "#8b5cf6" }}>+{completedToday.points_earned}</p></div></div></section></div>;

  if (result) return <div className="mx-auto max-w-lg space-y-5 py-8 text-center"><div className="text-7xl">{result.passed ? "🏆" : "🎯"}</div><section className="rounded-2xl p-8" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><h1 className="text-2xl font-black" style={{ color: "var(--text-1)" }}>Desafio concluído</h1><p className="mt-4 text-5xl font-black" style={{ color: result.passed ? "#10b981" : "#8b5cf6" }}>{result.score.toFixed(1)}</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>{result.correct}/{questions.length} respostas corretas · resultado oficial do servidor</p><div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black" style={{ background: "rgba(139,92,246,.12)", color: "#8b5cf6" }}><Star className="h-4 w-4" /> +{result.points} XP</div><p className="mt-4 text-xs" style={{ color: "var(--text-4)" }}>A próxima recompensa diária estará disponível amanhã.</p></section></div>;

  if (!questions.length) return <div className="mx-auto max-w-lg space-y-5 py-7 text-center"><div className="text-6xl">⭐</div><div><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: "#8b5cf6" }}>Treinamento contínuo</p><h1 className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>Desafio Diário</h1><p className="mt-2 text-sm" style={{ color: "var(--text-4)" }}>3 questões variadas · uma recompensa por dia · +15 XP</p></div><section className="rounded-2xl p-5 text-left" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(139,92,246,.11)", color: "#8b5cf6" }}><Sparkles className="h-5 w-5" /></div><div><p className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Questões disponíveis</p><p className="text-xl font-black" style={{ color: eligible.length >= 3 ? "#10b981" : "#f59e0b" }}>{eligible.length}</p></div></div><p className="mt-3 text-xs leading-5" style={{ color: "var(--text-4)" }}>As questões são escolhidas entre conteúdos ativos compatíveis com o setor {employee.data.sector}.</p></section><Button onClick={start} disabled={eligible.length < 3} className="w-full gap-2 bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"><Star className="h-4 w-4" /> Começar desafio</Button></div>;

  const question = questions[current];
  const selected = answers[question.id];
  const isLast = current === questions.length - 1;
  return <div className="mx-auto max-w-xl space-y-5 pb-10"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "#8b5cf6" }}>⭐ Desafio Diário</p><h1 className="mt-1 text-xl font-black" style={{ color: "var(--text-1)" }}>Questão {current + 1} de {questions.length}</h1></div><span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-3)" }}>{Math.round(((current + 1) / questions.length) * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}><div className="h-full rounded-full transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%`, background: "#8b5cf6" }} /></div><section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><div className="mb-4 flex flex-wrap gap-2"><span className="rounded-full px-2 py-1 text-[9px] font-black" style={{ background: "rgba(139,92,246,.10)", color: "#8b5cf6" }}>{question.theme || "Treinamento"}</span><span className="rounded-full px-2 py-1 text-[9px] font-black" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)" }}>{question.difficulty}</span></div><p className="font-bold leading-6" style={{ color: "var(--text-1)" }}>{question.question_text}</p><div className="mt-5 space-y-2">{question.options.map((option, optionIndex) => { const active = selected === optionIndex; return <button key={`${question.id}-${optionIndex}`} onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))} className="w-full rounded-xl p-3 text-left text-sm font-medium transition-all" style={{ background: active ? "rgba(139,92,246,.09)" : "var(--bg-surface-2)", border: `1px solid ${active ? "rgba(139,92,246,.55)" : "var(--border)"}`, color: active ? "#8b5cf6" : "var(--text-2)" }}><span className="mr-2 font-black">{String.fromCharCode(65 + optionIndex)})</span>{option}</button>; })}</div></section>{submitError && <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", color: "#dc2626" }}>{submitError}</div>}<Button onClick={isLast ? finish : () => setCurrent((value) => value + 1)} disabled={selected === undefined || submitting} className="w-full gap-2 bg-[#8b5cf6] text-white hover:bg-[#7c3aed]">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</> : isLast ? <><Trophy className="h-4 w-4" /> Finalizar desafio</> : <>Próxima <ChevronRight className="h-4 w-4" /></>}</Button></div>;
}

function Loading() { return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#8b5cf6" }} /></div>; }
