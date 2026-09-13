import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Crosshair,
  FileCheck2,
  FileClock,
  FileText,
  FilterX,
  Layers3,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Target,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  EXAM_STATUS,
  TARGET_SECTORS,
  deleteExam,
  fmtDate,
  listAttemptsByYear,
  listAvailableExams,
  listExams,
  updateExam,
  type Exam,
  type ExamAttempt,
} from "@/lib/exams";
import { hasPermission } from "@/lib/access-control";
import { invalidateExamFlow } from "@/lib/operational-query-sync";
import { operationalYear } from "@/lib/operational-time";
import { useCurrentUser } from "@/lib/useCurrentUser";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "@/operational-desktop.css";

export const Route = createFileRoute("/_authenticated/provas")({
  head: () => ({
    meta: [
      { title: "Provas · SEGEMPAT" },
      { name: "description", content: "Gestão e realização de provas formais do SEGEMPAT." },
    ],
  }),
  component: ProvasPage,
});

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex max-w-full items-center rounded-full px-2 py-1 text-[10px] font-semibold"
      style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border)", color: "var(--text-3)" }}
    >
      {children}
    </span>
  );
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
  icon: typeof FileText;
  accent: string;
  sub: string;
}) {
  return (
    <Card className="relative min-w-0 overflow-hidden p-4">
      <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p>
          <p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{value}</p>
          <p className="mt-1 truncate text-[11px] font-semibold" style={{ color: accent }} title={sub}>{sub}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
    </Card>
  );
}

function OperatorExamAction({ exam, attempts, onTake }: { exam: Exam; attempts: ExamAttempt[]; onTake: () => void }) {
  const examAttempts = attempts
    .filter((attempt) => attempt.exam_id === exam.id)
    .sort((a, b) => (b.finished_at || "").localeCompare(a.finished_at || ""));
  const approved = examAttempts.find((attempt) => attempt.passed);
  const latest = examAttempts[0];

  if (approved) {
    return (
      <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
        <span className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black" style={{ background: "rgba(16,185,129,.10)", border: "1px solid rgba(16,185,129,.26)", color: "#10b981" }}>
          <CheckCircle2 className="h-4 w-4" /> APROVADA · Nota {Number(approved.score || 0).toFixed(1)}
        </span>
        <span className="text-center text-[10px] font-semibold md:text-right" style={{ color: "var(--text-4)" }}>
          Resultado já registrado neste ano operacional.
        </span>
      </div>
    );
  }

  if (latest) {
    return (
      <div className="flex w-full flex-col gap-2 md:w-auto">
        <span className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black" style={{ background: "rgba(239,68,68,.09)", border: "1px solid rgba(239,68,68,.24)", color: "#ef4444" }}>
          <XCircle className="h-3.5 w-3.5" /> NÃO APROVADA · Nota {Number(latest.score || 0).toFixed(1)}
        </span>
        <button onClick={onTake} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-sm font-bold text-white md:w-auto">
          <RotateCcw className="h-4 w-4" /> Refazer prova
        </button>
      </div>
    );
  }

  return (
    <button onClick={onTake} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-4 text-sm font-bold text-white md:w-auto">
      <PlayCircle className="h-4 w-4" /> Realizar prova
    </button>
  );
}

function ProvasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const year = operationalYear();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const isAdmin = user?.isAdmin ?? false;
  const [toDelete, setToDelete] = useState<Exam | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ exam: Exam; nextStatus: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");

  const examsQuery = useQuery({
    queryKey: ["exams", isAdmin ? "admin" : "operator"],
    queryFn: isAdmin ? listExams : listAvailableExams,
    enabled: !!user,
  });
  const attemptsQuery = useQuery({
    queryKey: ["operator-exam-attempts", year],
    queryFn: () => listAttemptsByYear(year),
    enabled: !!user && !isAdmin,
  });

  const all = examsQuery.data ?? [];
  const attempts = attemptsQuery.data ?? [];
  const baseExams = isAdmin ? all : all.filter((exam) => exam.status === "Publicada");

  const filteredExams = useMemo(() => {
    const q = normalizeSearch(search);
    return baseExams.filter((exam) => {
      if (isAdmin && statusFilter !== "all" && exam.status !== statusFilter) return false;
      if (isAdmin && sectorFilter !== "all" && exam.target_sector !== sectorFilter) return false;
      if (!q) return true;
      return [exam.title, exam.description || "", exam.exam_type, exam.target_sector, exam.status].some((value) =>
        normalizeSearch(value).includes(q),
      );
    });
  }, [baseExams, isAdmin, search, sectorFilter, statusFilter]);

  const invalidate = () => invalidateExamFlow(qc);

  const remove = useMutation({
    mutationFn: deleteExam,
    onSuccess: () => {
      toast.success("Prova excluída");
      setToDelete(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateExam(id, { status }),
    onSuccess: (_data, variables) => {
      toast.success(variables.status === "Publicada" ? "Prova publicada" : "Prova despublicada");
      setStatusTarget(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (userLoading || examsQuery.isLoading || (!isAdmin && attemptsQuery.isLoading)) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Carregando provas">
        <div className="h-9 w-9 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} />
      </div>
    );
  }

  if (examsQuery.isError || (!isAdmin && attemptsQuery.isError)) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar as provas.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Nenhum dado foi alterado. Verifique a conexão e tente novamente.</p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => {
            void examsQuery.refetch();
            if (!isAdmin) void attemptsQuery.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
        </Button>
      </Card>
    );
  }

  const published = all.filter((exam) => exam.status === "Publicada").length;
  const drafts = all.filter((exam) => exam.status === "Rascunho").length;
  const sectors = new Set(all.map((exam) => exam.target_sector).filter(Boolean)).size;
  const filtersActive = Boolean(search.trim()) || (isAdmin && (statusFilter !== "all" || sectorFilter !== "all"));
  const canManageQuestionBank = hasPermission(user, "question_bank.manage");

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSectorFilter("all");
  };

  return (
    <div className="segempat-operational-provas mx-auto max-w-6xl space-y-5 pb-10">
      <section
        className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6"
        style={{ background: "linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)", border: "1px solid rgba(200,16,46,.28)", boxShadow: "0 12px 38px rgba(80,0,18,.16)" }}
      >
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)" }} />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em]" style={{ color: "rgba(255,255,255,.44)" }}>
              <FileText className="h-4 w-4" /> Avaliações formais
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Provas</h1>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: "rgba(255,255,255,.58)" }}>
              {isAdmin ? "Crie, publique e acompanhe avaliações por setor, preservando o histórico operacional." : `Realize e acompanhe as provas disponíveis para o seu setor · ${year}.`}
            </p>
          </div>
          {isAdmin && (
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
              <button onClick={() => navigate({ to: "/provas-criar" })} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#e0142f] px-4 text-sm font-bold text-white shadow-lg shadow-red-950/20 transition-colors hover:bg-[#C8102E] sm:w-auto">
                <PlusCircle className="h-4 w-4" /> Nova prova
              </button>
            </div>
          )}
        </div>
      </section>

      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Total" value={all.length} icon={Layers3} accent="#3b82f6" sub="provas cadastradas" />
          <Metric label="Publicadas" value={published} icon={FileCheck2} accent="#10b981" sub="disponíveis aos operadores" />
          <Metric label="Rascunhos" value={drafts} icon={FileClock} accent="#f59e0b" sub="aguardando publicação" />
          <Metric label="Setores" value={sectors} icon={Crosshair} accent="#e11d48" sub="alvos configurados" />
        </div>
      )}

      <Card className="p-4">
        <div className={`grid gap-3 ${isAdmin ? "md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_190px_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
              placeholder={isAdmin ? "Buscar por título, descrição, tipo ou setor..." : "Buscar prova por título ou tema..."}
              aria-label="Buscar provas"
            />
          </div>
          {isAdmin && (
            <>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 rounded-md px-3 text-sm outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                aria-label="Filtrar provas por situação"
              >
                <option value="all">Todas as situações</option>
                {EXAM_STATUS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select
                value={sectorFilter}
                onChange={(event) => setSectorFilter(event.target.value)}
                className="h-10 rounded-md px-3 text-sm outline-none"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                aria-label="Filtrar provas por setor"
              >
                <option value="all">Todos os setores</option>
                {TARGET_SECTORS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </>
          )}
          <Button variant="outline" disabled={!filtersActive} onClick={clearFilters}>
            <FilterX className="mr-2 h-4 w-4" /> Limpar
          </Button>
        </div>
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-4)" }} aria-live="polite">
          {filteredExams.length} prova{filteredExams.length === 1 ? "" : "s"} exibida{filteredExams.length === 1 ? "" : "s"}
        </p>
      </Card>

      {filteredExams.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 opacity-30" style={{ color: "var(--text-4)" }} />
          <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>
            {baseExams.length === 0
              ? isAdmin ? "Nenhuma prova cadastrada." : "Nenhuma prova publicada disponível para seu setor."
              : "Nenhuma prova corresponde aos filtros."}
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm" style={{ color: "var(--text-4)" }}>
            {baseExams.length === 0
              ? isAdmin ? "Crie a primeira avaliação para iniciar o ciclo formal de treinamento." : "Quando uma avaliação compatível for publicada, ela aparecerá aqui."
              : "Ajuste a busca ou limpe os filtros para visualizar outros registros."}
          </p>
          {baseExams.length > 0 && (
            <Button variant="outline" className="mt-5" onClick={clearFilters}>
              <FilterX className="mr-2 h-4 w-4" /> Limpar filtros
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredExams.map((exam: Exam) => {
            const accent = exam.status === "Publicada" ? "#10b981" : "#f59e0b";
            const questionCount = exam.question_count ?? exam.questions.length;
            return (
              <Card key={exam.id} className="relative min-w-0 overflow-hidden">
                <div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: accent }} />
                <div className="p-4 pl-5 md:p-5 md:pl-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-base font-black" style={{ color: "var(--text-1)" }}>{exam.title}</h3>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ color: accent, background: `${accent}12`, border: `1px solid ${accent}30` }}>
                          {exam.status}
                        </span>
                      </div>
                      {exam.description && <p className="mt-2 break-words text-sm leading-relaxed" style={{ color: "var(--text-3)" }}>{exam.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Chip>{exam.exam_type}</Chip>
                        <Chip>{questionCount} {questionCount === 1 ? "questão" : "questões"}</Chip>
                        <Chip>Mín. {exam.min_approval_pct}%</Chip>
                        <Chip><Target className="mr-1 h-3 w-3" />{exam.target_sector}</Chip>
                        <Chip><Calendar className="mr-1 h-3 w-3" />{fmtDate(exam.scheduled_date)}</Chip>
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 md:w-auto md:shrink-0">
                      {isAdmin ? (
                        <>
                          <Link
                            to="/provas-criar"
                            search={{ id: exam.id }}
                            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg px-3 text-xs font-bold md:flex-none"
                            style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--bg-surface-2)" }}
                          >
                            Editar
                          </Link>
                          <button
                            onClick={() => setStatusTarget({ exam, nextStatus: exam.status === "Publicada" ? "Rascunho" : "Publicada" })}
                            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold md:flex-none"
                            style={{ border: `1px solid ${accent}30`, color: accent, background: `${accent}0d` }}
                          >
                            {exam.status === "Publicada" ? <Undo2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                            {exam.status === "Publicada" ? "Despublicar" : "Publicar"}
                          </button>
                          <button
                            onClick={() => setToDelete(exam)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500"
                            style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}
                            title={`Excluir ${exam.title}`}
                            aria-label={`Excluir prova: ${exam.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <OperatorExamAction exam={exam} attempts={attempts} onTake={() => navigate({ to: "/prova-realizar", search: { id: exam.id } })} />
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={Boolean(statusTarget)} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusTarget?.nextStatus === "Publicada" ? "Publicar esta prova?" : "Despublicar esta prova?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.nextStatus === "Publicada"
                ? "Ao publicar, a avaliação ficará disponível aos operadores compatíveis com o setor definido. Revise título, questões, gabaritos, percentual mínimo e data antes de confirmar."
                : "Ao despublicar, novas realizações deixam de ficar disponíveis, mas tentativas, assinaturas, certificados e demais evidências já registradas permanecem preservadas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C8102E] hover:bg-[#A00D24]"
              disabled={toggle.isPending}
              onClick={() => statusTarget && toggle.mutate({ id: statusTarget.exam.id, status: statusTarget.nextStatus })}
            >
              {toggle.isPending ? "Atualizando..." : statusTarget?.nextStatus === "Publicada" ? "Publicar prova" : "Despublicar prova"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir prova?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão só é permitida para provas que nunca tiveram tentativa registrada. Se já houve aplicação, use “Despublicar” para manter todo o histórico operacional e evidenciário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C8102E] hover:bg-[#A00D24]"
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              {remove.isPending ? "Excluindo..." : "Excluir prova sem histórico"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
