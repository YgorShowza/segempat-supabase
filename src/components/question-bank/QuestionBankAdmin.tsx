import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Crosshair,
  FilterX,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  createQuestionBankItem,
  deleteQuestionBankItem,
  listQuestionBank,
  updateQuestionBankItem,
  type QuestionBankInput,
  type QuestionBankItem,
} from "@/lib/question-bank";

const PAGE_SIZE = 20;
const TARGET_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"] as const;
const DIFFICULTIES = ["Fácil", "Médio", "Difícil"] as const;

const EMPTY: QuestionBankInput = {
  bank_type: "Múltipla escolha",
  question_text: "",
  options: ["", "", "", ""],
  correct_index: 0,
  correct_answer: null,
  explanation: null,
  target_sector: "Todos",
  difficulty: "Médio",
  theme: "",
  active: true,
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function normalizeMultipleChoice(form: QuestionBankInput) {
  const prepared = form.options
    .map((value, originalIndex) => ({ value: value.trim(), originalIndex }))
    .filter((option) => option.value.length > 0);

  if (prepared.length < 2) throw new Error("Informe ao menos duas alternativas");

  const correctIndex = prepared.findIndex((option) => option.originalIndex === form.correct_index);
  if (correctIndex < 0) throw new Error("Selecione uma alternativa correta preenchida");

  return {
    ...form,
    question_text: form.question_text.trim(),
    theme: form.theme.trim(),
    options: prepared.map((option) => option.value),
    correct_index: correctIndex,
    correct_answer: null,
    explanation: form.explanation?.trim() || null,
  };
}

function Metric({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: number;
  icon: typeof Layers3;
  accent: string;
  sub: string;
}) {
  return (
    <div
      className="relative min-w-0 overflow-hidden rounded-2xl p-4"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
    >
      <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>
            {label}
          </p>
          <p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>
            {value}
          </p>
          <p className="mt-1 truncate text-[11px] font-semibold" style={{ color: accent }} title={sub}>
            {sub}
          </p>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
    </div>
  );
}

export function QuestionBankAdmin() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionBankItem | null>(null);
  const [toDelete, setToDelete] = useState<QuestionBankItem | null>(null);
  const [form, setForm] = useState<QuestionBankInput>(EMPTY);

  const query = useQuery({ queryKey: ["question-bank-admin"], queryFn: listQuestionBank });
  const rows = query.data ?? [];

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return rows.filter((row) => {
      if (sector !== "all" && row.target_sector !== sector) return false;
      if (difficulty !== "all" && row.difficulty !== difficulty) return false;
      if (status === "active" && !row.active) return false;
      if (status === "inactive" && row.active) return false;
      if (!q) return true;
      return [row.theme, row.question_text, row.bank_type, row.target_sector, row.difficulty].some((value) =>
        normalizeSearch(value || "").includes(q),
      );
    });
  }, [difficulty, rows, search, sector, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, filtered],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.question_text.trim()) throw new Error("Informe o enunciado da questão");
      if (!form.theme.trim()) throw new Error("Informe o tema");

      if (form.bank_type === "Múltipla escolha") {
        const payload = normalizeMultipleChoice(form);
        if (editing) await updateQuestionBankItem(editing.id, payload);
        else await createQuestionBankItem(payload);
        return;
      }

      if (!form.correct_answer?.trim()) throw new Error("Informe a resposta esperada");
      const payload = {
        ...form,
        question_text: form.question_text.trim(),
        theme: form.theme.trim(),
        options: [],
        correct_index: null,
        correct_answer: form.correct_answer.trim(),
        explanation: form.explanation?.trim() || null,
      };
      if (editing) await updateQuestionBankItem(editing.id, payload);
      else await createQuestionBankItem(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Questão atualizada" : "Questão criada");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      void qc.invalidateQueries({ queryKey: ["question-bank-admin"] });
      void qc.invalidateQueries({ queryKey: ["question-bank-active"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: deleteQuestionBankItem,
    onSuccess: () => {
      toast.success("Questão excluída");
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ["question-bank-admin"] });
      void qc.invalidateQueries({ queryKey: ["question-bank-active"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateQuestionBankItem(id, { active }),
    onSuccess: (_data, variables) => {
      toast.success(variables.active ? "Questão ativada" : "Questão desativada");
      void qc.invalidateQueries({ queryKey: ["question-bank-admin"] });
      void qc.invalidateQueries({ queryKey: ["question-bank-active"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user?.isAdmin) {
    return (
      <div
        className="mx-auto max-w-3xl rounded-2xl p-10 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <p className="font-bold" style={{ color: "var(--text-1)" }}>
          Você não tem permissão para gerenciar o Banco de Questões.
        </p>
      </div>
    );
  }

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, options: [...EMPTY.options] });
    setOpen(true);
  };

  const openEdit = (item: QuestionBankItem) => {
    const paddedOptions = item.options.length
      ? [...item.options, ...Array(Math.max(0, 4 - item.options.length)).fill("")]
      : [...EMPTY.options];
    setEditing(item);
    setForm({
      bank_type: item.bank_type,
      question_text: item.question_text,
      options: paddedOptions,
      correct_index: item.correct_index,
      correct_answer: item.correct_answer,
      explanation: item.explanation,
      target_sector: item.target_sector,
      difficulty: item.difficulty,
      theme: item.theme,
      active: item.active,
    });
    setOpen(true);
  };

  const clearFilters = () => {
    setSearch("");
    setSector("all");
    setDifficulty("all");
    setStatus("all");
    setPage(1);
  };

  const filtersActive = Boolean(search.trim()) || sector !== "all" || difficulty !== "all" || status !== "all";
  const activeCount = rows.filter((row) => row.active).length;
  const inactiveCount = rows.length - activeCount;
  const sectorCount = new Set(rows.map((row) => row.target_sector).filter(Boolean)).size;
  const canManageExams = hasPermission(user, "exams.manage");

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Carregando Banco de Questões">
        <div
          className="h-9 w-9 animate-spin rounded-full border-4"
          style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }}
        />
      </div>
    );
  }

  if (query.isError) {
    return (
      <section
        className="mx-auto max-w-2xl rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-500" />
        <h1 className="mt-3 text-lg font-black" style={{ color: "var(--text-1)" }}>
          Não foi possível carregar o Banco de Questões
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--text-4)" }}>
          Nenhum dado foi alterado. Verifique a conexão e tente novamente.
        </p>
        <Button className="mt-5" variant="outline" onClick={() => void query.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
        </Button>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <section
        className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6"
        style={{
          background: "linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)",
          border: "1px solid rgba(200,16,46,.28)",
          boxShadow: "0 12px 38px rgba(80,0,18,.16)",
        }}
      >
        <div
          className="absolute -right-20 -top-24 h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)" }}
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em]" style={{ color: "rgba(255,255,255,.44)" }}>
              <BookOpenCheck className="h-4 w-4" /> Conteúdo avaliativo
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Banco de Questões</h1>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: "rgba(255,255,255,.58)" }}>
              Cadastre, revise e mantenha questões reutilizáveis com gabarito protegido para a gestão avaliativa.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:flex md:w-auto">
            {canManageExams && (
              <Link
                to="/provas"
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-white"
                style={{ border: "1px solid rgba(255,255,255,.20)", background: "rgba(255,255,255,.07)" }}
              >
                Ir para provas
              </Link>
            )}
            <Button onClick={openNew} className="w-full bg-[#e0142f] font-bold text-white shadow-lg shadow-red-950/20 hover:bg-[#C8102E] sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nova questão
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total" value={rows.length} icon={Layers3} accent="#3b82f6" sub="questões cadastradas" />
        <Metric label="Ativas" value={activeCount} icon={ShieldCheck} accent="#10b981" sub="disponíveis para uso" />
        <Metric label="Inativas" value={inactiveCount} icon={CircleOff} accent="#64748b" sub="fora das novas seleções" />
        <Metric label="Setores" value={sectorCount} icon={Crosshair} accent="#e11d48" sub="segmentações configuradas" />
      </div>

      <section
        className="rounded-2xl p-4"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card, var(--shadow-md))",
        }}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_190px_160px_150px_auto]">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar por tema, enunciado, tipo ou setor..."
              className="pl-10"
              aria-label="Buscar questões"
            />
          </div>
          <Select value={sector} onValueChange={(value) => { setSector(value); setPage(1); }}>
            <SelectTrigger aria-label="Filtrar por setor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {TARGET_SECTORS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={(value) => { setDifficulty(value); setPage(1); }}>
            <SelectTrigger aria-label="Filtrar por dificuldade"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as dificuldades</SelectItem>
              {DIFFICULTIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
            <SelectTrigger aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="inactive">Inativas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!filtersActive} onClick={clearFilters}>
            <FilterX className="mr-2 h-4 w-4" /> Limpar
          </Button>
        </div>
        {filtered.length > 0 && (
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-4)" }} aria-live="polite">
            {filtered.length} questão{filtered.length === 1 ? "" : "ões"} encontrada{filtered.length === 1 ? "" : "s"} · exibindo {Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}
          </p>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {paged.map((item) => {
          const difficultyColor = item.difficulty === "Difícil" ? "#e11d48" : item.difficulty === "Fácil" ? "#10b981" : "#f59e0b";
          return (
            <article
              key={item.id}
              className="relative min-w-0 overflow-hidden rounded-2xl p-4 pl-5"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-card, var(--shadow-md))",
                opacity: item.active ? 1 : 0.82,
              }}
            >
              <div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: item.active ? difficultyColor : "#64748b" }} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} title={item.theme || "Sem tema"}>
                      {item.theme || "Sem tema"}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: `${difficultyColor}12`, color: difficultyColor, border: `1px solid ${difficultyColor}30` }}>
                      {item.difficulty}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: item.active ? "rgba(16,185,129,.09)" : "rgba(100,116,139,.12)", color: item.active ? "#10b981" : "#64748b" }}>
                      {item.active ? "Ativa" : "Inativa"}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: "var(--text-4)" }}>
                      {item.target_sector} · {item.bank_type}
                    </span>
                  </div>
                  <p className="mt-3 break-words text-sm font-black leading-relaxed" style={{ color: "var(--text-1)" }}>
                    {item.question_text}
                  </p>
                  {item.bank_type === "Múltipla escolha" && item.options.length > 0 && (
                    <div className="mt-3 space-y-1.5" aria-label="Alternativas e gabarito da questão">
                      {item.options.map((option, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="break-words rounded-lg px-2.5 py-1.5 text-xs"
                          style={{
                            background: index === item.correct_index ? "rgba(16,185,129,.08)" : "var(--bg-surface-2)",
                            color: index === item.correct_index ? "#10b981" : "var(--text-3)",
                            border: index === item.correct_index ? "1px solid rgba(16,185,129,.18)" : "1px solid transparent",
                          }}
                        >
                          {String.fromCharCode(65 + index)}. {option}{index === item.correct_index ? " · correta" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.bank_type !== "Múltipla escolha" && item.correct_answer && (
                    <p className="mt-3 break-words text-xs" style={{ color: "var(--text-3)" }}>
                      <strong>Resposta esperada:</strong> {item.correct_answer}
                    </p>
                  )}
                  {item.explanation && (
                    <p className="mt-2 break-words text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
                      <strong>Referência:</strong> {item.explanation}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 justify-end gap-1 self-end sm:self-start">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: item.id, active: !item.active })}
                    title={item.active ? "Desativar questão" : "Ativar questão"}
                    aria-label={item.active ? `Desativar questão: ${item.question_text}` : `Ativar questão: ${item.question_text}`}
                  >
                    {item.active ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CircleOff className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} title="Editar questão" aria-label={`Editar questão: ${item.question_text}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-500"
                    onClick={() => setToDelete(item)}
                    title="Excluir questão"
                    aria-label={`Excluir questão: ${item.question_text}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <section className="rounded-2xl p-10 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <BookOpenCheck className="mx-auto h-10 w-10 opacity-25" />
          <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>
            {rows.length === 0 ? "Nenhuma questão cadastrada." : "Nenhuma questão corresponde aos filtros."}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--text-4)" }}>
            {rows.length === 0
              ? "Cadastre a primeira questão para iniciar a base avaliativa."
              : "Ajuste a busca ou limpe os filtros para visualizar outros registros."}
          </p>
          {rows.length === 0 ? (
            <Button className="mt-5 bg-[#C8102E] text-white hover:bg-[#A00D24]" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Cadastrar primeira questão
            </Button>
          ) : (
            <Button className="mt-5" variant="outline" onClick={clearFilters}>
              <FilterX className="mr-2 h-4 w-4" /> Limpar filtros
            </Button>
          )}
        </section>
      )}

      {filtered.length > PAGE_SIZE && (
        <nav
          className="flex flex-col items-center justify-between gap-3 rounded-2xl p-3 sm:flex-row"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          aria-label="Paginação do Banco de Questões"
        >
          <p className="text-xs font-bold" style={{ color: "var(--text-4)" }}>Página {currentPage} de {totalPages}</p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </Button>
            <Button variant="outline" className="flex-1 sm:flex-none" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              Próxima <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar questão" : "Nova questão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.bank_type} onValueChange={(value) => setForm({ ...form, bank_type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Múltipla escolha">Múltipla escolha</SelectItem>
                    <SelectItem value="Discursiva">Discursiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Setor</Label>
                <Select value={form.target_sector} onValueChange={(value) => setForm({ ...form, target_sector: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TARGET_SECTORS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dificuldade</Label>
                <Select value={form.difficulty} onValueChange={(value) => setForm({ ...form, difficulty: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIFFICULTIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="question-theme">Tema *</Label>
              <Input id="question-theme" value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value })} placeholder="Ex.: Controle de acesso" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="question-statement">Enunciado *</Label>
              <textarea
                id="question-statement"
                value={form.question_text}
                onChange={(event) => setForm({ ...form, question_text: event.target.value })}
                className="min-h-24 w-full rounded-xl p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                placeholder="Escreva a pergunta de forma objetiva e sem ambiguidade."
              />
            </div>
            {form.bank_type === "Múltipla escolha" ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>Alternativas</legend>
                <p className="text-xs" style={{ color: "var(--text-4)" }}>Marque o botão ao lado da alternativa correta. Alternativas em branco não serão salvas.</p>
                {form.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="question-bank-correct-answer"
                      checked={form.correct_index === index}
                      onChange={() => setForm({ ...form, correct_index: index })}
                      aria-label={`Marcar alternativa ${String.fromCharCode(65 + index)} como correta`}
                    />
                    <Input
                      value={option}
                      onChange={(event) => {
                        const options = [...form.options];
                        options[index] = event.target.value;
                        setForm({ ...form, options });
                      }}
                      placeholder={`Alternativa ${String.fromCharCode(65 + index)}`}
                    />
                  </div>
                ))}
              </fieldset>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="question-model-answer">Resposta esperada *</Label>
                <textarea
                  id="question-model-answer"
                  value={form.correct_answer || ""}
                  onChange={(event) => setForm({ ...form, correct_answer: event.target.value })}
                  className="min-h-20 w-full rounded-xl p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="question-reference">Explicação / referência</Label>
              <textarea
                id="question-reference"
                value={form.explanation || ""}
                onChange={(event) => setForm({ ...form, explanation: event.target.value || null })}
                className="min-h-20 w-full rounded-xl p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                placeholder="Base normativa, procedimento ou orientação usada para validar o gabarito."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">
              {save.isPending ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar questão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(openDelete) => !openDelete && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir questão do banco?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão remove esta questão do Banco de Questões. Se a intenção for apenas impedir novas utilizações, prefira desativá-la para preservar o registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C8102E] hover:bg-[#A00D24]"
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              {remove.isPending ? "Excluindo..." : "Excluir questão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
