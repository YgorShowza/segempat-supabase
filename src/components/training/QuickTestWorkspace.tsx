import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Flame, Loader2, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listActiveQuestionBank, type OperationalQuestionBankItem } from "@/lib/question-bank";
import { getCurrentEmployeeByAuth } from "@/lib/insights";
import { submitTrainingActivity } from "@/lib/training-activities";

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function QuickTestWorkspace() {
  const queryClient = useQueryClient();
  const employee = useQuery({ queryKey: ["current-employee-training"], queryFn: getCurrentEmployeeByAuth, staleTime: 60_000 });
  const bank = useQuery({ queryKey: ["question-bank-operational"], queryFn: listActiveQuestionBank, staleTime: 60_000 });
  const [questions, setQuestions] = useState<OperationalQuestionBankItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; correct: number; points: number; passed: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const eligible = useMemo(() => {
    const sector = employee.data?.sector;
    return (bank.data ?? []).filter((item) => {
      const optionsOk = Array.isArray(item.options) && item.options.length >= 2;
      const sectorOk = !sector || item.target_sector === "Todos" || item.target_sector === sector;
      return item.active && optionsOk && sectorOk;
    });
  }, [bank.data, employee.data?.sector]);

  const start = () => {
    setQuestions(shuffled(eligible).slice(0, 5));
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
        activityType: "Teste Rápido",
        activityTitle: "Teste Rápido",
        answers: questions.map((question) => ({
          question_id: question.id,
          selected_index: answers[question.id] ?? -1,
        })),
      });
      setResult({
        score: Number(response.score),
        correct: Number(response.correct_count ?? 0),
        points: response.points_earned,
        passed: response.passed,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["current-employee-training"] }),
        queryClient.invalidateQueries({ queryKey: ["training-activities-my"] }),
      ]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível registrar o Teste Rápido. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (employee.isLoading || bank.isLoading) return <Loading />;

  if (employee.isError || bank.isError) {
    return <div className="mx-auto max-w-lg rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><ShieldCheck className="mx-auto mb-3 h-10 w-10 text-amber-500" /><p className="font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o Teste Rápido</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Tente novamente. Se o problema persistir, informe a Inspetoria.</p><Button variant="outline" className="mt-4" onClick={() => { void employee.refetch(); void bank.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></div>;
  }

  if (!employee.data) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <ShieldCheck className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--accent)" }} />
        <p className="font-black" style={{ color: "var(--text-1)" }}>Colaborador não localizado</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Não foi possível vincular sua matrícula ao cadastro operacional.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-6 text-center">
        <div className="text-6xl">{result.passed ? "🔥" : "🎯"}</div>
        <section className="rounded-2xl p-7" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
          <h1 className="text-2xl font-black" style={{ color: "var(--text-1)" }}>Teste Rápido concluído</h1>
          <p className="mt-4 text-5xl font-black" style={{ color: result.passed ? "#10b981" : "#f59e0b" }}>{result.score.toFixed(1)}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>{result.correct}/{questions.length} respostas corretas · resultado oficial do servidor</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black" style={{ background: "rgba(245,158,11,.12)", color: "#f59e0b" }}>
            <Flame className="h-4 w-4" /> {result.points > 0 ? `+${result.points} XP` : "XP diário já recebido"}
          </div>
        </section>
        <Button onClick={start} className="w-full gap-2 bg-[#f59e0b] text-white hover:bg-[#d68a08]"><RefreshCw className="h-4 w-4" /> Novo teste</Button>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-6 text-center">
        <div className="text-6xl">🔥</div>
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text-1)" }}>Teste Rápido</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-4)" }}>5 questões aleatórias do Banco de Questões · setor {employee.data.sector}</p>
          <p className="mt-1 text-xs font-bold" style={{ color: "#f59e0b" }}>Até +10 XP na primeira conclusão do dia</p>
        </div>
        <section className="rounded-2xl p-4 text-left" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Questões disponíveis para você</p>
          <p className="mt-2 text-2xl font-black" style={{ color: eligible.length >= 5 ? "#10b981" : "#f59e0b" }}>{eligible.length}</p>
          {eligible.length < 5 && <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>É necessário ter pelo menos 5 questões ativas compatíveis com seu setor.</p>}
        </section>
        <Button onClick={start} disabled={eligible.length < 5} className="w-full gap-2 bg-[#f59e0b] text-white hover:bg-[#d68a08]"><Zap className="h-4 w-4" /> Iniciar Teste</Button>
      </div>
    );
  }

  const question = questions[current];
  const selected = answers[question.id];
  const isLast = current === questions.length - 1;

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "#f59e0b" }}>🔥 Teste Rápido</p><h1 className="mt-1 text-xl font-black" style={{ color: "var(--text-1)" }}>Questão {current + 1} de {questions.length}</h1></div>
        <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-3)" }}>{Math.round(((current + 1) / questions.length) * 100)}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}><div className="h-full rounded-full transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%`, background: "#f59e0b" }} /></div>

      <section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
        <div className="mb-4 flex flex-wrap gap-2"><span className="rounded-full px-2 py-1 text-[9px] font-black" style={{ background: "rgba(245,158,11,.10)", color: "#f59e0b" }}>{question.theme || question.bank_type}</span><span className="rounded-full px-2 py-1 text-[9px] font-black" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)" }}>{question.difficulty}</span></div>
        <p className="font-bold leading-6" style={{ color: "var(--text-1)" }}>{question.question_text}</p>
        <div className="mt-5 space-y-2">
          {question.options.map((option, optionIndex) => {
            const active = selected === optionIndex;
            return (
              <button key={`${question.id}-${optionIndex}`} onClick={() => { setSubmitError(null); setAnswers((prev) => ({ ...prev, [question.id]: optionIndex })); }} className="w-full rounded-xl p-3 text-left text-sm font-medium transition-colors" style={{ background: active ? "rgba(245,158,11,.09)" : "var(--bg-surface-2)", border: `1px solid ${active ? "rgba(245,158,11,.55)" : "var(--border)"}`, color: active ? "#f59e0b" : "var(--text-2)" }}>
                <span className="mr-2 font-black">{String.fromCharCode(65 + optionIndex)})</span>{option}
              </button>
            );
          })}
        </div>
      </section>

      {submitError && <section className="rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", color: "#dc2626" }}>{submitError}</section>}
      <Button onClick={isLast ? finish : () => { setSubmitError(null); setCurrent((value) => value + 1); }} disabled={selected === undefined || submitting} className="w-full gap-2 bg-[#C8102E] text-white hover:bg-[#A00D24]">
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</> : isLast ? <><CheckCircle2 className="h-4 w-4" /> {submitError ? "Tentar registrar novamente" : "Finalizar"}</> : <>Próxima <ChevronRight className="h-4 w-4" /></>}
      </Button>
    </div>
  );
}

function Loading() { return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#f59e0b" }} /></div>; }
