import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gauge,
  Pencil,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PracticalRecurrencePanel } from "@/components/practical/PracticalRecurrencePanel";
import { PracticalTemplateManager } from "@/components/practical/PracticalTemplateManager";
import { hasPermission } from "@/lib/access-control";
import { listEmployees } from "@/lib/employees";
import { operationalDate } from "@/lib/operational-time";
import { invalidateCronogramaFlow } from "@/lib/operational-query-sync";
import { listPracticalEvalTemplates, type PracticalEvalTemplate } from "@/lib/practical-templates";
import {
  createPracticalEvaluation,
  deletePracticalEvaluation,
  listPracticalEvaluations,
  updatePracticalEvaluation,
  type PracticalEvaluation,
} from "@/lib/operations";
import { useCurrentUser } from "@/lib/useCurrentUser";

const STATUS_OPTIONS = ["Todos", "Planejada", "Em andamento", "Concluída"] as const;
const defaultChecklist = [
  "Apresentação e postura profissional",
  "Comunicação operacional",
  "Execução do procedimento",
  "Uso correto dos recursos",
  "Cumprimento das normas de segurança",
].map((label, index) => ({ id: String(index + 1), label, done: false }));

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

function Metric({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
  accent: string;
  sub: string;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>
            {label}
          </p>
          <p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>
            {value}
          </p>
          <p className="mt-1 text-[11px] font-semibold" style={{ color: accent }}>
            {sub}
          </p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
    </Card>
  );
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const source = value.length === 10 ? `${value}T12:00:00` : value;
  return new Date(source).toLocaleDateString("pt-BR", { timeZone: "America/Maceio" });
}

function dateTimeLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Maceio" });
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function templateChecklist(template: PracticalEvalTemplate) {
  return (template.tasks ?? [])
    .map((raw, index) => {
      let value: Record<string, unknown> = {};
      if (typeof raw === "string") {
        try {
          value = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          value = { title: raw };
        }
      } else if (raw && typeof raw === "object") {
        value = raw as Record<string, unknown>;
      }
      const label = String(value.title ?? value.label ?? "").trim();
      return label ? { id: String(value.id ?? `template_${index + 1}`), label, done: false } : null;
    })
    .filter((item): item is { id: string; label: string; done: boolean } => Boolean(item));
}

function normalizedPracticalScore(row: Pick<PracticalEvaluation, "score" | "max_score">) {
  const max = Number(row.max_score || 10);
  return max > 0 ? (Number(row.score || 0) / max) * 10 : 0;
}

function isPracticalApproved(row: Pick<PracticalEvaluation, "score" | "max_score" | "min_approval_score">) {
  return normalizedPracticalScore(row) >= Number(row.min_approval_score ?? 7);
}

function operationalRank(row: PracticalEvaluation, today: string) {
  const overdue = row.status !== "Concluída" && Boolean(row.evaluation_date && row.evaluation_date < today);
  if (row.status === "Em andamento") return overdue ? 0 : 1;
  if (row.status === "Planejada") return overdue ? 2 : 3;
  return 4;
}

export function PracticalWorkspace({ operatorTitle = false }: { operatorTitle?: boolean }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManagePractical = hasPermission(user, "practical.manage");
  const showManagementTools = canManagePractical && !operatorTitle;
  const today = operationalDate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("Todos");
  const [sector, setSector] = useState("Todos");
  const [open, setOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [editing, setEditing] = useState<PracticalEvaluation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PracticalEvaluation | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    title: "Avaliação Prática Operacional",
    evaluation_date: operationalDate(),
    status: "Planejada",
    score: 0,
    max_score: 10,
    min_approval_score: 7,
    notes: "",
    checklist: defaultChecklist,
  });

  const query = useQuery({
    queryKey: ["practical-evaluations", user?.isAdmin ? "admin" : user?.matricula ?? "self"],
    queryFn: listPracticalEvaluations,
    enabled: Boolean(user),
  });
  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: listEmployees,
    enabled: showManagementTools,
  });
  const templates = useQuery({
    queryKey: ["practical-eval-templates"],
    queryFn: listPracticalEvalTemplates,
    enabled: showManagementTools,
  });

  const rows = query.data ?? [];
  const sectors = useMemo(
    () => Array.from(new Set(rows.map((row) => row.employee_sector).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );
  const selectedEmployee = (employees.data ?? []).find((employee) => employee.id === form.employee_id);
  const availableTemplates = (templates.data ?? []).filter(
    (template) =>
      template.status === "Ativo" &&
      (!selectedEmployee || template.target_sector === "Todos" || template.target_sector === selectedEmployee.sector),
  );

  const filtered = useMemo(() => {
    const queryText = normalizeSearch(search);
    return rows
      .filter((row) => {
        if (status !== "Todos" && row.status !== status) return false;
        if (sector !== "Todos" && row.employee_sector !== sector) return false;
        if (!queryText) return true;
        return [row.employee_name, row.employee_matricula, row.employee_sector, row.title, row.evaluator_name].some((value) =>
          normalizeSearch(value).includes(queryText),
        );
      })
      .sort((left, right) => {
        const rankDiff = operationalRank(left, today) - operationalRank(right, today);
        if (rankDiff !== 0) return rankDiff;
        if (left.status === "Concluída" && right.status === "Concluída") {
          return String(right.completed_at ?? right.updated_at ?? "").localeCompare(String(left.completed_at ?? left.updated_at ?? ""));
        }
        return String(left.evaluation_date ?? "9999-12-31").localeCompare(String(right.evaluation_date ?? "9999-12-31"));
      });
  }, [rows, search, sector, status, today]);

  const filtersActive = Boolean(search.trim() || status !== "Todos" || sector !== "Todos");
  const clearFilters = () => {
    setSearch("");
    setStatus("Todos");
    setSector("Todos");
  };

  const invalidate = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["practical-evaluations"] }), invalidateCronogramaFlow(qc)]);
  };

  const reset = () => {
    setSelectedTemplate("");
    setForm({
      employee_id: "",
      title: "Avaliação Prática Operacional",
      evaluation_date: operationalDate(),
      status: "Planejada",
      score: 0,
      max_score: 10,
      min_approval_score: 7,
      notes: "",
      checklist: defaultChecklist,
    });
  };

  const openPlanning = () => {
    setEditing(null);
    reset();
    setOpen(true);
  };

  const closeEvaluationDialog = () => {
    setOpen(false);
    setEditing(null);
    reset();
  };

  const applyTemplate = (templateId: string) => {
    if (templateId === "manual") {
      setSelectedTemplate("");
      setForm((current) => ({
        ...current,
        title: "Avaliação Prática Operacional",
        min_approval_score: 7,
        checklist: defaultChecklist,
      }));
      return;
    }
    const template = (templates.data ?? []).find((item) => item.id === templateId);
    if (!template) return;
    const checklist = templateChecklist(template);
    setSelectedTemplate(template.id);
    setForm((current) => ({
      ...current,
      title: template.title,
      min_approval_score: Number(template.min_approval_score ?? 7),
      checklist: checklist.length ? checklist : defaultChecklist,
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!canManagePractical) throw new Error("Seu nível de acesso não permite gerenciar avaliações práticas");
      if (!form.title.trim()) throw new Error("Informe o título");
      if (!form.evaluation_date) throw new Error("Informe a data da avaliação para sincronizar com o Cronograma");
      const score = Number(form.score);
      const maxScore = Number(form.max_score);
      const minApproval = Number(form.min_approval_score);
      if (!Number.isFinite(maxScore) || maxScore <= 0) throw new Error("Informe uma nota máxima válida");
      if (!Number.isFinite(score) || score < 0 || score > maxScore) throw new Error("A nota deve ficar entre 0 e a nota máxima");
      if (!Number.isFinite(minApproval) || minApproval < 0 || minApproval > 10) throw new Error("A nota mínima deve ficar entre 0 e 10");
      if (editing?.status === "Concluída") throw new Error("Avaliação concluída pertence ao histórico e não pode ser alterada");
      if (form.status === "Concluída" && form.checklist.some((item) => !item.done)) {
        throw new Error("Conclua todos os itens do checklist antes de finalizar a avaliação prática");
      }

      if (editing) {
        await updatePracticalEvaluation(editing.id, {
          title: form.title,
          status: form.status as PracticalEvaluation["status"],
          score,
          max_score: maxScore,
          min_approval_score: minApproval,
          notes: form.notes || null,
          evaluation_date: form.evaluation_date,
          checklist: form.checklist,
        });
        return;
      }

      const employee = (employees.data ?? []).find((item) => item.id === form.employee_id);
      if (!employee) throw new Error("Selecione o colaborador");
      await createPracticalEvaluation({
        employee_id: employee.id,
        employee_name: employee.full_name,
        employee_matricula: employee.matricula,
        employee_sector: employee.sector,
        title: form.title,
        evaluator_name: user?.nome || null,
        evaluation_date: form.evaluation_date,
        min_approval_score: minApproval,
        checklist: form.checklist,
        notes: form.notes || null,
      });
    },
    onSuccess: async () => {
      toast.success(editing ? "Avaliação atualizada" : "Avaliação planejada e sincronizada com o Cronograma");
      closeEvaluationDialog();
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: deletePracticalEvaluation,
    onSuccess: async () => {
      setDeleteTarget(null);
      toast.success("Avaliação planejada excluída");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEdit = (row: PracticalEvaluation) => {
    if (!canManagePractical) return;
    if (row.status === "Concluída") {
      toast.info("Avaliação concluída pertence ao histórico operacional e não pode ser alterada.");
      return;
    }
    setSelectedTemplate("");
    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      title: row.title,
      evaluation_date: row.evaluation_date || "",
      status: row.status,
      score: row.score,
      max_score: row.max_score,
      min_approval_score: Number(row.min_approval_score ?? 7),
      notes: row.notes || "",
      checklist: row.checklist.length ? row.checklist : defaultChecklist,
    });
    setOpen(true);
  };

  const counts = {
    planned: rows.filter((row) => row.status === "Planejada").length,
    running: rows.filter((row) => row.status === "Em andamento").length,
    done: rows.filter((row) => row.status === "Concluída").length,
    overdue: rows.filter(
      (row) => row.status !== "Concluída" && Boolean(row.evaluation_date && row.evaluation_date < today),
    ).length,
  };
  const approved = rows.filter((row) => row.status === "Concluída" && isPracticalApproved(row)).length;

  if (!user || query.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20" role="status" aria-live="polite">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4"
          style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }}
        />
        <p className="text-sm font-semibold" style={{ color: "var(--text-4)" }}>
          Carregando avaliações práticas...
        </p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        className="mx-auto max-w-2xl rounded-2xl p-8 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        role="alert"
      >
        <AlertTriangle className="mx-auto h-9 w-9 text-red-500" />
        <p className="mt-3 font-bold text-red-500">Não foi possível carregar as avaliações práticas.</p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>
          {query.error instanceof Error ? query.error.message : "A consulta não retornou os dados esperados."}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RotateCcw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          {query.isFetching ? "Tentando novamente..." : "Tentar novamente"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
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
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em]"
              style={{ color: "rgba(255,255,255,.44)" }}
            >
              <ClipboardCheck className="h-4 w-4" /> Competência operacional
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">
              {operatorTitle ? "Minha Avaliação Prática" : "Avaliação Prática"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: "rgba(255,255,255,.58)" }}>
              {operatorTitle
                ? "Acompanhe suas avaliações, checklists e resultados registrados pela Inspetoria."
                : "Planeje, execute e conclua avaliações com checklist, nota e sincronização com o Cronograma."}
            </p>
            {!operatorTitle && counts.overdue > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" /> {counts.overdue} avaliação(ões) com data vencida
              </div>
            )}
          </div>
          {showManagementTools && (
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Button
                variant="outline"
                onClick={() => setModelsOpen(true)}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Settings2 className="mr-2 h-4 w-4" /> Modelos
              </Button>
              <Button
                onClick={openPlanning}
                className="bg-[#e0142f] font-bold text-white shadow-lg shadow-red-950/20 hover:bg-[#C8102E]"
              >
                <Plus className="mr-2 h-4 w-4" /> Planejar avaliação
              </Button>
            </div>
          )}
        </div>
      </section>

      {showManagementTools && <PracticalRecurrencePanel />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Planejadas"
          value={counts.planned}
          icon={Clock3}
          accent="#f59e0b"
          sub={counts.overdue > 0 ? `${counts.overdue} com data vencida` : "aguardando execução"}
        />
        <Metric label="Em andamento" value={counts.running} icon={PlayCircle} accent="#3b82f6" sub="avaliações abertas" />
        <Metric label="Concluídas" value={counts.done} icon={CheckCircle2} accent="#10b981" sub="registros finalizados" />
        <Metric label="Aprovadas" value={approved} icon={Award} accent="#e11d48" sub="conforme nota mínima" />
      </div>

      <Card className="p-4">
        <div className={`grid gap-3 ${showManagementTools ? "lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]" : "md:grid-cols-[minmax(0,1fr)_190px_auto]"}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, matrícula, setor ou avaliação..."
              className="pl-10"
              aria-label="Buscar avaliações práticas"
            />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number])}>
            <SelectTrigger aria-label="Filtrar avaliações por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "Todos" ? "Todas as situações" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showManagementTools && (
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger aria-label="Filtrar avaliações por setor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos os setores</SelectItem>
                {sectors.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={clearFilters} disabled={!filtersActive}>
            <RotateCcw className="mr-2 h-4 w-4" /> Limpar filtros
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold" style={{ color: "var(--text-4)" }}>
          <span>{filtered.length} de {rows.length} avaliação(ões) exibida(s)</span>
          {filtersActive && <span>Filtros ativos</span>}
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.map((row) => {
          const maxScore = Number(row.max_score || 10);
          const pct = maxScore > 0 ? Math.round((Number(row.score) / maxScore) * 100) : 0;
          const passed = isPracticalApproved(row);
          const overdue = row.status !== "Concluída" && Boolean(row.evaluation_date && row.evaluation_date < today);
          const accent = row.status === "Concluída" ? "#10b981" : overdue ? "#ef4444" : row.status === "Em andamento" ? "#3b82f6" : "#f59e0b";
          const doneCount = row.checklist.filter((item) => item.done).length;
          const checklistPct = row.checklist.length ? Math.round((doneCount / row.checklist.length) * 100) : 0;

          return (
            <Card key={row.id} className="relative overflow-hidden">
              <div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: accent }} />
              <div className="p-4 pl-5 md:p-5 md:pl-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-base font-black" style={{ color: "var(--text-1)" }}>
                        {row.employee_name}
                      </p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-black"
                        style={{ color: accent, background: `${accent}12`, border: `1px solid ${accent}30` }}
                      >
                        {row.status}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-black text-red-500">
                          <AlertTriangle className="h-3 w-3" /> DATA VENCIDA
                        </span>
                      )}
                      {row.status === "Concluída" && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black text-emerald-500"
                          style={{ background: "rgba(16,185,129,.08)" }}
                        >
                          <ShieldCheck className="h-3 w-3" /> HISTÓRICO PROTEGIDO
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 break-words text-xs" style={{ color: "var(--text-4)" }}>
                      Mat. {row.employee_matricula} · {row.employee_sector}
                    </p>
                    <p className="mt-3 break-words text-sm font-semibold" style={{ color: "var(--text-2)" }}>
                      {row.title}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>
                      Data prevista/avaliada: {dateLabel(row.evaluation_date)} · Nota mínima: {Number(row.min_approval_score ?? 7).toLocaleString("pt-BR")}/10
                    </p>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>
                          Checklist
                        </span>
                        <span className="text-[10px] font-black" style={{ color: accent }}>
                          {doneCount}/{row.checklist.length} · {checklistPct}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}>
                        <div className="h-full rounded-full" style={{ width: `${checklistPct}%`, background: accent }} />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.checklist.map((item) => (
                        <span
                          key={item.id}
                          className="max-w-full break-words rounded-full px-2 py-1 text-[10px]"
                          style={{
                            color: item.done ? "#10b981" : "var(--text-4)",
                            background: item.done ? "rgba(16,185,129,.1)" : "var(--bg-surface-3)",
                            border: item.done ? "1px solid rgba(16,185,129,.18)" : "1px solid transparent",
                          }}
                        >
                          {item.done ? "✓ " : "○ "}
                          {item.label}
                        </span>
                      ))}
                    </div>

                    {row.status === "Concluída" && (
                      <>
                        <div
                          className="mt-4 flex items-center gap-3 rounded-xl p-3"
                          style={{
                            background: passed ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)",
                            border: `1px solid ${passed ? "rgba(16,185,129,.18)" : "rgba(239,68,68,.18)"}`,
                          }}
                        >
                          <Gauge className="h-4 w-4 shrink-0" style={{ color: passed ? "#10b981" : "#ef4444" }} />
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>
                              Resultado final
                            </p>
                            <span className="break-words font-black" style={{ color: passed ? "#10b981" : "#ef4444" }}>
                              {row.score}/{row.max_score} · {pct}% · {passed ? "APROVADO" : "NÃO APROVADO"}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-[10px]" style={{ color: "var(--text-4)" }}>
                          Concluída em {dateTimeLabel(row.completed_at)}
                          {row.evaluator_name ? ` · Avaliador: ${row.evaluator_name}` : ""}
                        </p>
                      </>
                    )}

                    {row.notes && (
                      <p className="mt-3 break-words text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
                        {row.notes}
                      </p>
                    )}
                  </div>

                  {showManagementTools && (
                    <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
                      {row.status !== "Concluída" && (
                        <Button size="sm" variant="outline" className="flex-1 md:flex-none" onClick={() => openEdit(row)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          {row.status === "Em andamento" ? "Continuar avaliação" : "Registrar avaliação"}
                        </Button>
                      )}
                      {row.status === "Planejada" && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="text-red-500"
                          onClick={() => setDeleteTarget(row)}
                          disabled={remove.isPending}
                          aria-label={`Excluir avaliação planejada de ${row.employee_name}`}
                          title={`Excluir avaliação planejada de ${row.employee_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {row.status !== "Planejada" && row.status !== "Concluída" && (
                        <span className="inline-flex items-center gap-1 px-2 text-[10px] font-bold" style={{ color: "var(--text-4)" }}>
                          <ShieldCheck className="h-3.5 w-3.5" /> execução preservada
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <Card className="p-8 text-center md:p-10">
            <Target className="mx-auto h-10 w-10 opacity-30" style={{ color: "var(--text-4)" }} />
            <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>
              {rows.length === 0
                ? operatorTitle
                  ? "Nenhuma avaliação prática vinculada a você."
                  : "Nenhuma avaliação prática planejada."
                : "Nenhuma avaliação corresponde aos filtros atuais."}
            </p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
              {rows.length === 0
                ? operatorTitle
                  ? "Quando uma avaliação for planejada pela Inspetoria, ela aparecerá aqui com data, checklist e resultado."
                  : "Planeje uma avaliação individual ou use a geração recorrente a partir dos modelos ativos."
                : "Ajuste a busca ou limpe os filtros para voltar a visualizar os registros disponíveis."}
            </p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              {filtersActive && (
                <Button variant="outline" onClick={clearFilters}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Limpar filtros
                </Button>
              )}
              {rows.length === 0 && showManagementTools && (
                <Button onClick={openPlanning} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">
                  <Plus className="mr-2 h-4 w-4" /> Planejar avaliação
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else closeEvaluationDialog();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Registrar avaliação do colaborador" : "Planejar avaliação prática"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="practical-employee">Colaborador *</Label>
                  <Select
                    value={form.employee_id}
                    onValueChange={(value) => {
                      setSelectedTemplate("");
                      setForm((current) => ({ ...current, employee_id: value }));
                    }}
                  >
                    <SelectTrigger id="practical-employee">
                      <SelectValue placeholder={employees.isLoading ? "Carregando colaboradores..." : "Selecione..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {(employees.data ?? [])
                        .filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor")
                        .map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.full_name} · {employee.matricula} · {employee.sector}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {employees.isError && <p className="text-[10px] font-semibold text-red-500">Não foi possível carregar os colaboradores.</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="practical-template">Modelo operacional (opcional)</Label>
                  <Select
                    value={selectedTemplate || "manual"}
                    onValueChange={applyTemplate}
                    disabled={!form.employee_id || templates.isLoading || templates.isError}
                  >
                    <SelectTrigger id="practical-template">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Avaliação manual</SelectItem>
                      {availableTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.title} · mín. {Number(template.min_approval_score).toLocaleString("pt-BR")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templates.isError ? (
                    <p className="text-[10px] font-semibold text-amber-500">
                      Os modelos não puderam ser carregados. A avaliação manual continua disponível.
                    </p>
                  ) : (
                    form.employee_id &&
                    availableTemplates.length === 0 &&
                    !templates.isLoading && (
                      <p className="text-[10px]" style={{ color: "var(--text-4)" }}>
                        Nenhum modelo ativo compatível com o setor selecionado. A avaliação manual continua disponível.
                      </p>
                    )
                  )}
                </div>
              </>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="practical-title">Título *</Label>
                <Input
                  id="practical-title"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="practical-date">Data *</Label>
                <Input
                  id="practical-date"
                  type="date"
                  value={form.evaluation_date}
                  onChange={(event) => setForm((current) => ({ ...current, evaluation_date: event.target.value }))}
                />
              </div>
            </div>

            {editing && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="practical-status">Situação</Label>
                    <Select
                      value={form.status}
                      onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}
                    >
                      <SelectTrigger id="practical-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Planejada", "Em andamento", "Concluída"].map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="practical-score">Nota</Label>
                    <Input
                      id="practical-score"
                      type="number"
                      min={0}
                      max={form.max_score}
                      step="0.1"
                      value={form.score}
                      onChange={(event) => setForm((current) => ({ ...current, score: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="practical-max-score">Nota máxima</Label>
                    <Input
                      id="practical-max-score"
                      type="number"
                      min={0.01}
                      max={100}
                      step="0.1"
                      value={form.max_score}
                      onChange={(event) => setForm((current) => ({ ...current, max_score: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="practical-min-score">Nota mínima /10</Label>
                    <Input
                      id="practical-min-score"
                      type="number"
                      min={0}
                      max={10}
                      step="0.1"
                      value={form.min_approval_score}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, min_approval_score: Number(event.target.value) }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Checklist</Label>
                  {form.checklist.map((item, index) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl p-3"
                      style={{
                        background: item.done ? "rgba(16,185,129,.08)" : "var(--bg-surface-2)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            checklist: current.checklist.map((value, itemIndex) =>
                              itemIndex === index ? { ...value, done: !value.done } : value,
                            ),
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span className="text-sm" style={{ color: "var(--text-2)" }}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>

                {form.status === "Concluída" && form.checklist.some((item) => !item.done) && (
                  <p className="text-xs font-bold text-amber-500">
                    Para concluir, todos os itens do checklist precisam estar marcados.
                  </p>
                )}
              </>
            )}

            {!editing && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="practical-plan-min-score">Nota mínima /10</Label>
                  <Input
                    id="practical-plan-min-score"
                    type="number"
                    min={0}
                    max={10}
                    step="0.1"
                    value={form.min_approval_score}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, min_approval_score: Number(event.target.value) }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <p className="pb-2 text-[10px] leading-relaxed" style={{ color: "var(--text-4)" }}>
                    A nota mínima fica registrada na avaliação e será usada para definir aprovação na escala normalizada de 0 a 10.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="practical-notes">Observações</Label>
              <textarea
                id="practical-notes"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="min-h-24 w-full rounded-xl p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={closeEvaluationDialog} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || (!editing && employees.isError)}
              className="bg-[#C8102E] text-white hover:bg-[#A00D24]"
            >
              {save.isPending ? "Salvando..." : editing ? "Salvar avaliação" : "Planejar avaliação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir avaliação planejada?</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
            <p className="font-bold" style={{ color: "var(--text-1)" }}>
              {deleteTarget?.employee_name}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
              A avaliação ainda está em estado planejado. Ao excluir, o lançamento pendente vinculado no Cronograma também será removido. Avaliações em andamento ou concluídas permanecem protegidas pelo servidor.
            </p>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
              disabled={!deleteTarget || remove.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" /> {remove.isPending ? "Excluindo..." : "Excluir avaliação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showManagementTools && <PracticalTemplateManager open={modelsOpen} onOpenChange={setModelsOpen} />}
    </div>
  );
}
