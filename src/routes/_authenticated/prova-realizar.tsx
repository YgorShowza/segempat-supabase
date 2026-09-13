import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SignaturePad } from "@/components/exams/SignaturePad";
import { getExamForAttempt, saveAttempt, signAttempt, type ExamAttempt } from "@/lib/exams";
import { invalidateExamFlow } from "@/lib/operational-query-sync";
import { useCurrentUser } from "@/lib/useCurrentUser";

export const Route = createFileRoute("/_authenticated/prova-realizar")({
  validateSearch: (search: Record<string, unknown>) => ({ id: typeof search["id"] === "string" ? search["id"] : "" }),
  head: () => ({ meta: [{ title: "Realizar Prova · SEGEMPAT" }] }),
  component: TakeExamPage,
});

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
    >
      {children}
    </div>
  );
}

function TakeExamPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const examQuery = useQuery({
    queryKey: ["exam-attempt", id],
    queryFn: () => getExamForAttempt(id),
    enabled: !!id,
  });
  const exam = examQuery.data;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [finished, setFinished] = useState<{ score: number; percent: number; passed: boolean; attempt: ExamAttempt } | null>(null);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);

  const question = exam?.questions[index];
  const answered = exam
    ? exam.questions.filter((item) => answers[item.id] !== undefined && String(answers[item.id]).trim() !== "").length
    : 0;
  const completionPercent = exam?.questions.length ? Math.round((answered / exam.questions.length) * 100) : 0;

  if (!id) {
    return (
      <Card className="mx-auto max-w-2xl p-10 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhuma prova foi selecionada.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Volte à lista de provas e escolha a avaliação que deseja realizar.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate({ to: "/provas" })}>Voltar às provas</Button>
      </Card>
    );
  }

  if (examQuery.isLoading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Carregando prova">
        <div className="h-9 w-9 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} />
      </div>
    );
  }

  if (examQuery.isError || !exam || exam.status !== "Publicada") {
    return (
      <Card className="mx-auto max-w-2xl p-10 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Prova indisponível.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>A avaliação pode ter sido despublicada, não pertencer ao seu setor ou não ter sido carregada corretamente.</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => navigate({ to: "/provas" })}>Voltar às provas</Button>
          {examQuery.isError && (
            <Button className="bg-[#C8102E] text-white hover:bg-[#A00D24]" onClick={() => void examQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const submitAttempt = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const attempt = await saveAttempt({ exam_id: exam.id, answers });
      const score = Number(attempt.score || 0);
      const percent = Math.max(0, Math.min(100, Math.round(score * 10)));
      const passed = Boolean(attempt.passed);
      setFinished({ score, percent, passed, attempt });
      await invalidateExamFlow(queryClient);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a prova");
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    if (answered < exam.questions.length) {
      setConfirmFinishOpen(true);
      return;
    }
    void submitAttempt();
  };

  const confirmIncompleteFinish = () => {
    setConfirmFinishOpen(false);
    void submitAttempt();
  };

  const confirmSignature = async (blob: Blob) => {
    if (!finished || !finished.passed || signed) return;
    setSigning(true);
    try {
      if (!user?.id) throw new Error("Sessão inválida");
      const attempt = await signAttempt({
        attemptId: finished.attempt.id,
        userId: user.id,
        signerName: user.nome || user.matricula || "Operador",
        pngBlob: blob,
      });
      setFinished((current) => current ? { ...current, attempt } : current);
      setSigned(true);
      await Promise.all([
        invalidateExamFlow(queryClient),
        queryClient.invalidateQueries({ queryKey: ["employees-profile"] }),
      ]);
      toast.success("Assinatura registrada com sucesso");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a assinatura");
      throw error;
    } finally {
      setSigning(false);
    }
  };

  if (finished) {
    const codeLabel = signed && finished.passed && finished.attempt.certificate_code
      ? "Código verificável do certificado"
      : finished.passed && finished.attempt.certificate_code
        ? "Código da aprovação — assinatura pendente"
        : "Identificador da tentativa";

    return (
      <div className="mx-auto max-w-3xl space-y-5 pb-10">
        <div className="rounded-[1.5rem] p-7 text-center" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
          {finished.passed ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" /> : <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />}
          <h1 className="mt-4 text-2xl font-black text-white">{finished.passed ? "Aprovado" : "Não aprovado"}</h1>
          <p className="mx-auto mt-2 max-w-xl text-white/55">
            {finished.passed
              ? "Resultado calculado e registrado pelo servidor. A conclusão formal exige sua assinatura eletrônica."
              : "Resultado calculado e registrado. A tentativa reprovada permanece no histórico e uma nova avaliação pode ser realizada quando disponível."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Nota</p>
            <p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{finished.score}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Percentual</p>
            <p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{finished.percent}%</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Mínimo</p>
            <p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{exam.min_approval_pct}%</p>
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            {finished.passed ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.16em]" style={{ color: "var(--text-4)" }}>{codeLabel}</p>
              <p className="mt-1 break-all font-mono text-sm font-black" style={{ color: "var(--text-1)" }}>{finished.attempt.certificate_code || finished.attempt.id}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Mat. {user?.matricula || "—"} · {exam.title}</p>
            </div>
          </div>
        </Card>

        {finished.passed && (
          <SignaturePad
            signerName={user?.nome || user?.matricula || "Operador"}
            saving={signing}
            saved={signed}
            onConfirm={confirmSignature}
          />
        )}

        <div>
          <h2 className="mb-3 text-xs font-black uppercase tracking-[.16em]" style={{ color: "var(--text-4)" }}>Respostas enviadas</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--text-4)" }}>O SEGEMPAT exibe apenas suas respostas nesta etapa; o gabarito permanece restrito aos perfis autorizados.</p>
          <div className="space-y-2">
            {exam.questions.map((item, questionIndex) => {
              const selected = answers[item.id];
              const chosen = item.type === "Múltipla escolha" ? item.options[Number(selected)] : String(selected ?? "");
              return (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start gap-2">
                    <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold" style={{ color: "var(--text-1)" }}>{questionIndex + 1}. {item.statement}</p>
                      <p className="mt-1 break-words text-xs" style={{ color: "var(--text-3)" }}>Sua resposta: {chosen || "(não respondida)"}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {finished.passed ? (
          <Button disabled={!signed} className="w-full bg-[#C8102E] text-white hover:bg-[#A00D24] disabled:opacity-40" onClick={() => navigate({ to: "/progresso" })}>
            {signed ? "Ver meu progresso" : "Assine acima para concluir"}
          </Button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => navigate({ to: "/provas" })}>Voltar às provas</Button>
            <Button className="bg-[#C8102E] text-white hover:bg-[#A00D24]" onClick={() => navigate({ to: "/progresso" })}>Ver meu progresso</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/40">
          <ClipboardCheck className="h-4 w-4" /> Avaliação
        </div>
        <h1 className="mt-2 break-words text-xl font-black text-white md:text-2xl">{exam.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/55">
          <span>Questão {index + 1} de {exam.questions.length}</span>
          <span>{answered} respondida{answered === 1 ? "" : "s"}</span>
          <span>{exam.questions.length - answered} em branco</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" aria-label={`${completionPercent}% da prova respondida`}>
          <div className="h-full rounded-full bg-[#C8102E] transition-[width]" style={{ width: `${completionPercent}%` }} />
        </div>
        <p className="mt-2 text-right text-[10px] font-bold text-white/40">{completionPercent}% respondida</p>
      </div>

      {exam.questions.length > 1 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black" style={{ color: "var(--text-1)" }}>Navegação da prova</p>
              <p className="text-[11px]" style={{ color: "var(--text-4)" }}>Use os números para revisar qualquer questão antes de finalizar.</p>
            </div>
            <span className="shrink-0 text-[11px] font-bold" style={{ color: "var(--text-4)" }}>{answered}/{exam.questions.length}</span>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10" aria-label="Questões da prova">
            {exam.questions.map((item, questionIndex) => {
              const isCurrent = questionIndex === index;
              const isAnswered = answers[item.id] !== undefined && String(answers[item.id]).trim() !== "";
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={saving}
                  onClick={() => setIndex(questionIndex)}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Questão ${questionIndex + 1}${isAnswered ? ", respondida" : ", em branco"}`}
                  className="relative flex h-10 items-center justify-center rounded-lg text-xs font-black transition-colors disabled:opacity-50"
                  style={{
                    background: isCurrent ? "var(--accent-soft)" : isAnswered ? "rgba(16,185,129,.09)" : "var(--bg-surface-2)",
                    border: isCurrent ? "1px solid rgba(200,16,46,.35)" : isAnswered ? "1px solid rgba(16,185,129,.24)" : "1px solid var(--border)",
                    color: isCurrent ? "var(--accent)" : isAnswered ? "#10b981" : "var(--text-3)",
                  }}
                >
                  {questionIndex + 1}
                  {isAnswered && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[.16em]" style={{ color: "var(--accent)" }}>Questão {index + 1}</p>
          <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)", border: "1px solid var(--border)" }}>
            {question?.points || 1} ponto{(question?.points || 1) === 1 ? "" : "s"}
          </span>
        </div>
        <h2 className="mt-3 break-words text-base font-bold leading-relaxed md:text-lg" style={{ color: "var(--text-1)" }}>{question?.statement}</h2>
        {question?.type === "Múltipla escolha" ? (
          <div className="mt-5 space-y-2" role="group" aria-label={`Alternativas da questão ${index + 1}`}>
            {question.options.map((option, optionIndex) => {
              const selected = answers[question.id] === optionIndex;
              return (
                <button
                  key={optionIndex}
                  type="button"
                  disabled={saving}
                  aria-pressed={selected}
                  onClick={() => setAnswers({ ...answers, [question.id]: optionIndex })}
                  className="w-full rounded-xl p-4 text-left transition-all disabled:opacity-60"
                  style={selected
                    ? { background: "var(--accent-soft)", border: "1px solid rgba(200,16,46,.3)", color: "var(--text-1)" }
                    : { background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                >
                  <span className="mr-3 font-black">{String.fromCharCode(65 + optionIndex)}</span>{option}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            className="mt-5 min-h-36 w-full rounded-xl p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40"
            style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}
            value={question ? String(answers[question.id] ?? "") : ""}
            disabled={saving}
            onChange={(event) => question && setAnswers({ ...answers, [question.id]: event.target.value })}
            placeholder="Digite sua resposta..."
            aria-label={`Resposta da questão ${index + 1}`}
          />
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" disabled={index === 0 || saving} onClick={() => setIndex((value) => value - 1)}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Anterior
        </Button>
        {index < exam.questions.length - 1 ? (
          <Button className="bg-[#C8102E] text-white hover:bg-[#A00D24]" disabled={saving} onClick={() => setIndex((value) => value + 1)}>
            Próxima <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button className="bg-[#C8102E] text-white hover:bg-[#A00D24]" disabled={saving} onClick={finish}>
            {saving ? "Salvando..." : "Finalizar prova"}
          </Button>
        )}
      </div>

      <AlertDialog open={confirmFinishOpen} onOpenChange={setConfirmFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar com questões em branco?</AlertDialogTitle>
            <AlertDialogDescription>
              Você respondeu {answered} de {exam.questions.length} questões. As {exam.questions.length - answered} questão{exam.questions.length - answered === 1 ? "" : "ões"} sem resposta serão consideradas incorretas pelo servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar respondendo</AlertDialogCancel>
            <AlertDialogAction className="bg-[#C8102E] hover:bg-[#A00D24]" disabled={saving} onClick={confirmIncompleteFinish}>
              {saving ? "Finalizando..." : "Finalizar mesmo assim"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
