import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Layers3, PlusCircle, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  EXAM_STATUS,
  EXAM_TYPES,
  TARGET_SECTORS,
  createExam,
  emptyExamForm,
  emptyQuestion,
  getExam,
  updateExam,
  type ExamForm,
  type ExamQuestion,
  type QuestionType,
} from "@/lib/exams";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/provas-criar")({
  head: () => ({
    meta: [
      { title: "Criar prova · SEGEMPAT" },
      { name: "description", content: "Monte provas com questões objetivas e discursivas para as equipes." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { id?: string } => {
    const id = typeof search["id"] === "string" ? search["id"] : undefined;
    return id ? { id } : {};
  },
  component: CriarProva,
});

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg-surface-2)",
  color: "var(--text-1)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
      {children}
    </p>
  );
}

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

function normalizeFormForSave(form: ExamForm): ExamForm {
  const title = form.title.trim();
  if (!title) throw new Error("Informe o título da prova.");
  if (!form.questions.length) throw new Error("Adicione pelo menos uma questão.");

  const minApproval = Number(form.min_approval_pct);
  if (!Number.isFinite(minApproval) || minApproval < 0 || minApproval > 100) {
    throw new Error("O percentual mínimo deve estar entre 0 e 100.");
  }

  const questions = form.questions.map((question, index) => {
    const statement = question.statement.trim();
    if (!statement) throw new Error(`Informe o enunciado da questão ${index + 1}.`);

    const points = Number(question.points);
    if (!Number.isFinite(points) || points < 1) throw new Error(`Informe uma pontuação válida na questão ${index + 1}.`);

    if (question.type === "Múltipla escolha") {
      const prepared = question.options
        .map((value, originalIndex) => ({ value: value.trim(), originalIndex }))
        .filter((option) => option.value.length > 0);
      if (prepared.length < 2) throw new Error(`A questão ${index + 1} precisa de pelo menos duas alternativas.`);

      const correctIndex = prepared.findIndex((option) => option.originalIndex === question.correct_index);
      if (correctIndex < 0) throw new Error(`Selecione uma alternativa correta preenchida na questão ${index + 1}.`);

      return {
        ...question,
        statement,
        points,
        options: prepared.map((option) => option.value),
        correct_index: correctIndex,
        model_answer: undefined,
      };
    }

    const modelAnswer = question.model_answer?.trim();
    if (!modelAnswer) throw new Error(`Informe a resposta-modelo da questão ${index + 1}.`);

    return {
      ...question,
      statement,
      points,
      options: [],
      correct_index: 0,
      model_answer: modelAnswer,
    };
  });

  return {
    ...form,
    title,
    description: form.description.trim(),
    min_approval_pct: minApproval,
    questions,
  };
}

function CriarProva() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const [form, setForm] = useState<ExamForm>(() => emptyExamForm());
  const examQuery = useQuery({
    queryKey: ["exam-admin", id],
    queryFn: () => getExam(id!),
    enabled: !!id && !!user?.isAdmin,
  });

  useEffect(() => {
    if (!examQuery.data) return;
    const exam = examQuery.data;
    setForm({
      title: exam.title,
      description: exam.description ?? "",
      exam_type: exam.exam_type,
      target_sector: exam.target_sector,
      min_approval_pct: exam.min_approval_pct,
      scheduled_date: exam.scheduled_date ?? "",
      status: exam.status,
      questions: exam.questions,
    });
  }, [examQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const normalized = normalizeFormForSave(form);
      if (id) await updateExam(id, normalized);
      else await createExam(normalized);
    },
    onSuccess: () => {
      toast.success(id ? "Prova atualizada" : "Prova criada");
      navigate({ to: "/provas" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setQuestion = (index: number, patch: Partial<ExamQuestion>) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question,
      ),
    }));
  };

  const addQuestion = () => {
    setForm((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }));
  };

  const removeQuestion = (index: number) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.filter((_, questionIndex) => questionIndex !== index),
    }));
  };

  const totalPoints = useMemo(
    () => form.questions.reduce((sum, question) => sum + Math.max(1, Number(question.points) || 1), 0),
    [form.questions],
  );
  const multipleChoiceCount = form.questions.filter((question) => question.type === "Múltipla escolha").length;
  const discursiveCount = form.questions.length - multipleChoiceCount;
  const canManageQuestionBank = hasPermission(user, "question_bank.manage");

  if (!user?.isAdmin) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <p className="font-bold" style={{ color: "var(--text-1)" }}>Você não tem permissão para criar ou editar provas.</p>
      </Card>
    );
  }

  if (id && examQuery.isLoading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Carregando prova">
        <div className="h-9 w-9 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} />
      </div>
    );
  }

  if (id && examQuery.isError) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-500" />
        <h1 className="mt-3 text-lg font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar esta prova.</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>O editor não será liberado com dados incompletos. Tente novamente ou volte para a lista de provas.</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => navigate({ to: "/provas" })}>Voltar para provas</Button>
          <Button className="bg-[#C8102E] text-white hover:bg-[#A00D24]" onClick={() => void examQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <section
        className="relative overflow-hidden rounded-[1.7rem] p-5 md:p-6"
        style={{ background: "linear-gradient(135deg,#171118,#310912 55%,#160f14)", border: "1px solid rgba(200,16,46,.28)" }}
      >
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-white/40">
              <BookOpenCheck className="h-4 w-4" /> Avaliação formal
            </div>
            <h1 className="mt-2 text-2xl font-black text-white">{id ? "Editar prova" : "Criar nova prova"}</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/55">Defina público, critérios e questões. O gabarito permanece restrito e a correção oficial acontece no servidor.</p>
          </div>
          <div className="grid w-full gap-2 sm:flex md:w-auto">
            {canManageQuestionBank && (
              <Link
                to="/banco-questoes"
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-white"
                style={{ border: "1px solid rgba(255,255,255,.20)", background: "rgba(255,255,255,.07)" }}
              >
                Banco de Questões
              </Link>
            )}
            <Link
              to="/provas"
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-white"
              style={{ border: "1px solid rgba(255,255,255,.20)", background: "rgba(255,255,255,.07)" }}
            >
              Voltar para provas
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Questões</p>
          <p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{form.questions.length}</p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-4)" }}>total da avaliação</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Pontos</p>
          <p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{totalPoints}</p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-4)" }}>peso total</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Objetivas</p>
          <p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{multipleChoiceCount}</p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-4)" }}>múltipla escolha</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Discursivas</p>
          <p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{discursiveCount}</p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-4)" }}>resposta-modelo</p>
        </Card>
      </div>

      <Card className="p-5 md:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Layers3 className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <div>
            <h2 className="text-sm font-black" style={{ color: "var(--text-1)" }}>Configuração da prova</h2>
            <p className="text-xs" style={{ color: "var(--text-4)" }}>Dados que definem identificação, público e critério de aprovação.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Título *</Label>
            <input style={fieldStyle} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Avaliação mensal — Controle de acesso" />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <textarea style={{ ...fieldStyle, minHeight: 88 }} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explique objetivo, escopo ou orientação necessária para a avaliação." />
          </div>
          <div>
            <Label>Tipo</Label>
            <select style={fieldStyle} value={form.exam_type} onChange={(event) => setForm({ ...form, exam_type: event.target.value })}>
              {EXAM_TYPES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <Label>Setor-alvo</Label>
            <select style={fieldStyle} value={form.target_sector} onChange={(event) => setForm({ ...form, target_sector: event.target.value })}>
              {TARGET_SECTORS.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <Label>Percentual mínimo</Label>
            <input type="number" min={0} max={100} style={fieldStyle} value={form.min_approval_pct} onChange={(event) => setForm({ ...form, min_approval_pct: Number(event.target.value) })} />
          </div>
          <div>
            <Label>Data prevista</Label>
            <input type="date" style={fieldStyle} value={form.scheduled_date} onChange={(event) => setForm({ ...form, scheduled_date: event.target.value })} />
          </div>
          <div>
            <Label>Situação</Label>
            <select style={fieldStyle} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {EXAM_STATUS.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
        </div>
        {form.status === "Publicada" && (
          <div className="mt-5 flex items-start gap-3 rounded-xl p-3" style={{ background: "rgba(16,185,129,.07)", border: "1px solid rgba(16,185,129,.22)" }}>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
              Esta prova está marcada como <strong>Publicada</strong>. Ao salvar, ela poderá ficar disponível aos operadores compatíveis com o setor definido. Revise o gabarito antes de concluir.
            </p>
          </div>
        )}
      </Card>

      <section className="space-y-4" aria-label="Questões da prova">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black" style={{ color: "var(--text-1)" }}>Questões</h2>
            <p className="text-xs" style={{ color: "var(--text-4)" }}>Alternativas em branco serão descartadas ao salvar, preservando a alternativa correta selecionada.</p>
          </div>
          <Button variant="outline" onClick={addQuestion}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar questão
          </Button>
        </div>

        {form.questions.map((question, index) => (
          <Card key={question.id} className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--accent)" }}>Questão {index + 1}</p>
                <p className="text-xs" style={{ color: "var(--text-4)" }}>{question.type} · {Math.max(1, Number(question.points) || 1)} ponto(s)</p>
              </div>
              <button
                type="button"
                onClick={() => removeQuestion(index)}
                disabled={form.questions.length === 1}
                className="rounded-lg p-2 text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                title={form.questions.length === 1 ? "A prova precisa manter pelo menos uma questão" : `Remover questão ${index + 1}`}
                aria-label={`Remover questão ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <div>
                <Label>Tipo da questão</Label>
                <select style={fieldStyle} value={question.type} onChange={(event) => setQuestion(index, { type: event.target.value as QuestionType })}>
                  <option>Múltipla escolha</option>
                  <option>Discursiva</option>
                </select>
              </div>
              <div>
                <Label>Enunciado *</Label>
                <textarea style={{ ...fieldStyle, minHeight: 70 }} value={question.statement} onChange={(event) => setQuestion(index, { statement: event.target.value })} placeholder="Escreva a pergunta de forma objetiva e sem ambiguidade." />
              </div>
            </div>

            {question.type === "Múltipla escolha" ? (
              <fieldset className="mt-4">
                <legend className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Alternativas</legend>
                <p className="mb-2 text-xs" style={{ color: "var(--text-4)" }}>Marque o botão ao lado da resposta correta.</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className="flex min-w-0 items-center gap-2 rounded-xl p-2" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
                      <input
                        type="radio"
                        name={`correct-${question.id}`}
                        checked={question.correct_index === optionIndex}
                        onChange={() => setQuestion(index, { correct_index: optionIndex })}
                        aria-label={`Marcar alternativa ${String.fromCharCode(65 + optionIndex)} da questão ${index + 1} como correta`}
                      />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        style={{ color: "var(--text-1)" }}
                        value={option}
                        onChange={(event) => setQuestion(index, { options: question.options.map((value, idx) => idx === optionIndex ? event.target.value : value) })}
                        placeholder={`Alternativa ${String.fromCharCode(65 + optionIndex)}`}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div className="mt-4">
                <Label>Resposta-modelo *</Label>
                <textarea style={{ ...fieldStyle, minHeight: 88 }} value={question.model_answer ?? ""} onChange={(event) => setQuestion(index, { model_answer: event.target.value })} placeholder="Informe os elementos esperados na resposta para a correção oficial." />
              </div>
            )}

            <div className="mt-4 max-w-[180px]">
              <Label>Pontos</Label>
              <input type="number" min={1} style={fieldStyle} value={question.points} onChange={(event) => setQuestion(index, { points: Math.max(1, Number(event.target.value) || 1) })} />
            </div>
          </Card>
        ))}
      </section>

      <Card className="sticky bottom-3 z-10 p-3 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs" style={{ color: "var(--text-4)" }}>
            {form.questions.length} questão{form.questions.length === 1 ? "" : "ões"} · {totalPoints} ponto{totalPoints === 1 ? "" : "s"} · mínimo {form.min_approval_pct}%
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => navigate({ to: "/provas" })}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1 bg-[#C8102E] text-white hover:bg-[#A00D24] sm:flex-none">
              {save.isPending ? <CheckCircle2 className="mr-2 h-4 w-4 animate-pulse" /> : <Save className="mr-2 h-4 w-4" />}
              {save.isPending ? "Salvando..." : id ? "Salvar alterações" : "Criar prova"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
