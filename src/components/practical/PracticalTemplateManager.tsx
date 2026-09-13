import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Edit2, Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createPracticalEvalTemplate,
  deletePracticalEvalTemplate,
  listPracticalEvalTemplates,
  updatePracticalEvalTemplate,
  type PracticalEvalTemplate,
  type PracticalEvalTemplateInput,
  type PracticalRecurrence,
  type PracticalTargetSector,
} from "@/lib/practical-templates";

export type PracticalTask = { id: string; category: string; title: string; description: string };

const PRACTICAL_SECTORS: PracticalTargetSector[] = [
  "Todos",
  "CFTV",
  "Vigilância",
  "Portaria",
  "Ronda",
  "Operações",
  "Administrativo",
];

const EMPTY_FORM: PracticalEvalTemplateInput = {
  title: "",
  platform: null,
  description: null,
  target_sector: "CFTV",
  min_approval_score: 7,
  recurrence: "monthly",
  applications_per_month: 1,
  tasks: [],
  status: "Ativo",
};

const RECURRENCE_LABEL: Record<string, string> = {
  once: "Única vez",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
};

function normalizeTasks(raw: unknown[]): PracticalTask[] {
  return raw
    .map((task, index) => {
      if (typeof task === "string") {
        try {
          const parsed = JSON.parse(task);
          return {
            id: parsed.id || `task_${index}`,
            category: parsed.category || "",
            title: parsed.title || String(task),
            description: parsed.description || "",
          };
        } catch {
          return { id: `task_${index}`, category: "", title: task, description: "" };
        }
      }
      const value = (task ?? {}) as Record<string, unknown>;
      return {
        id: String(value.id || `task_${index}`),
        category: String(value.category || ""),
        title: String(value.title || ""),
        description: String(value.description || ""),
      };
    })
    .filter((task) => task.title.trim());
}

export function PracticalTemplateManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PracticalEvalTemplate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<PracticalEvalTemplate | null>(null);

  const query = useQuery({
    queryKey: ["practical-eval-templates"],
    queryFn: listPracticalEvalTemplates,
    enabled: open,
  });
  const rows = query.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["practical-eval-templates"] });

  const toggleStatus = useMutation({
    mutationFn: (template: PracticalEvalTemplate) =>
      updatePracticalEvalTemplate(template.id, { status: template.status === "Ativo" ? "Inativo" : "Ativo" }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Situação do modelo atualizada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: deletePracticalEvalTemplate,
    onSuccess: async () => {
      setDeleteTarget(null);
      toast.success("Modelo excluído.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (template: PracticalEvalTemplate) => {
    setEditing(template);
    setFormOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Modelos de Avaliação Prática</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>
                {query.isLoading || query.isError
                  ? "Biblioteca de modelos operacionais"
                  : `${rows.length} modelo(s) · ${rows.filter((row) => row.status === "Ativo").length} ativo(s)`}
              </p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
                Os modelos padronizam procedimentos, setor, recorrência e nota mínima. Desative um modelo quando quiser retirá-lo do uso sem apagar o cadastro.
              </p>
            </div>
            <Button onClick={openNew} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">
              <Plus className="mr-2 h-4 w-4" /> Novo modelo
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            {query.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10" role="status" aria-live="polite">
                <Loader2 className="h-6 w-6 animate-spin text-[#C8102E]" />
                <span className="text-xs font-semibold" style={{ color: "var(--text-4)" }}>
                  Carregando modelos...
                </span>
              </div>
            ) : query.isError ? (
              <div
                className="rounded-2xl p-6 text-center"
                style={{ background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.18)" }}
                role="alert"
              >
                <p className="font-bold text-red-500">Não foi possível carregar os modelos.</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>
                  {query.error instanceof Error ? query.error.message : "A consulta não retornou os dados esperados."}
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()} disabled={query.isFetching}>
                  <RotateCcw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Tentar novamente
                </Button>
              </div>
            ) : rows.length === 0 ? (
              <div
                className="rounded-2xl p-8 text-center"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
              >
                <p className="font-bold" style={{ color: "var(--text-1)" }}>
                  Nenhum modelo cadastrado.
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>
                  Crie o primeiro modelo para padronizar procedimentos e reutilizá-los no planejamento das avaliações.
                </p>
                <Button onClick={openNew} size="sm" className="mt-4 bg-[#C8102E] text-white hover:bg-[#A00D24]">
                  <Plus className="mr-2 h-4 w-4" /> Criar primeiro modelo
                </Button>
              </div>
            ) : (
              rows.map((template) => {
                const tasks = normalizeTasks(template.tasks);
                const isExpanded = Boolean(expanded[template.id]);
                const togglingThis = toggleStatus.isPending && toggleStatus.variables?.id === template.id;
                return (
                  <div
                    key={template.id}
                    className="overflow-hidden rounded-2xl"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-black" style={{ color: "var(--text-1)" }}>
                            {template.title}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleStatus.mutate(template)}
                            disabled={toggleStatus.isPending}
                            className="rounded-full px-2 py-1 text-[9px] font-black uppercase disabled:opacity-60"
                            style={{
                              background: template.status === "Ativo" ? "rgba(16,185,129,.1)" : "var(--bg-surface-3)",
                              color: template.status === "Ativo" ? "#10b981" : "var(--text-4)",
                            }}
                            aria-pressed={template.status === "Ativo"}
                            aria-label={`${template.status === "Ativo" ? "Desativar" : "Ativar"} modelo ${template.title}`}
                            title={`${template.status === "Ativo" ? "Desativar" : "Ativar"} modelo`}
                          >
                            {togglingThis ? "Salvando..." : template.status}
                          </button>
                        </div>
                        <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>
                          {template.platform || "Sem plataforma"} · {template.target_sector} · {RECURRENCE_LABEL[template.recurrence] ?? template.recurrence} · {template.applications_per_month} aplicação(ões)/mês · Nota mín. {template.min_approval_score}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpanded((current) => ({ ...current, [template.id]: !isExpanded }))}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                          {tasks.length} tarefa(s)
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(template)}
                          aria-label={`Editar modelo ${template.title}`}
                          title={`Editar modelo ${template.title}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => setDeleteTarget(template)}
                          aria-label={`Excluir modelo ${template.title}`}
                          title={`Excluir modelo ${template.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4">
                        <div
                          className="rounded-xl p-3"
                          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                        >
                          {template.description && (
                            <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
                              {template.description}
                            </p>
                          )}
                          {tasks.length ? (
                            <div className="space-y-1">
                              {tasks.map((task, index) => (
                                <div key={task.id} className="flex items-start gap-2 py-1.5 text-xs">
                                  <span className="font-black text-[#C8102E]">{index + 1}.</span>
                                  {task.category && (
                                    <span
                                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black"
                                      style={{ background: "rgba(200,16,46,.08)", color: "#C8102E" }}
                                    >
                                      {task.category}
                                    </span>
                                  )}
                                  <span className="min-w-0 break-words" style={{ color: "var(--text-2)" }}>
                                    {task.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs" style={{ color: "var(--text-4)" }}>
                              Sem tarefas cadastradas.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={async () => {
          setFormOpen(false);
          setEditing(null);
          await invalidate();
        }}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir modelo de avaliação?</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
            <p className="font-bold" style={{ color: "var(--text-1)" }}>
              {deleteTarget?.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
              Se a intenção for apenas impedir novas utilizações, prefira desativar o modelo. A exclusão remove o cadastro e pode ser rejeitada pelo banco se houver vínculo histórico protegido.
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
              <Trash2 className="mr-2 h-4 w-4" /> {remove.isPending ? "Excluindo..." : "Excluir modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PracticalEvalTemplate | null;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<PracticalEvalTemplateInput>(EMPTY_FORM);
  const [taskCategory, setTaskCategory] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const tasks = normalizeTasks(form.tasks);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        title: editing.title,
        platform: editing.platform,
        description: editing.description,
        target_sector: editing.target_sector,
        min_approval_score: editing.min_approval_score,
        recurrence: editing.recurrence,
        applications_per_month: editing.applications_per_month,
        tasks: normalizeTasks(editing.tasks),
        status: editing.status,
      });
    } else {
      setForm({ ...EMPTY_FORM, tasks: [] });
    }
    setTaskCategory("");
    setTaskTitle("");
  }, [open, editing]);

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const next: PracticalTask = {
      id: `task_${Date.now()}`,
      category: taskCategory.trim(),
      title: taskTitle.trim(),
      description: "",
    };
    setForm((current) => ({ ...current, tasks: [...normalizeTasks(current.tasks), next] }));
    setTaskTitle("");
    setTaskCategory("");
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Informe o título.");
    if (!normalizeTasks(form.tasks).length) return toast.error("Adicione ao menos uma tarefa.");
    if (!Number.isFinite(Number(form.min_approval_score)) || Number(form.min_approval_score) < 0 || Number(form.min_approval_score) > 10) {
      return toast.error("A nota mínima deve ficar entre 0 e 10.");
    }
    const applications = Number(form.applications_per_month);
    if (!Number.isInteger(applications) || applications < 1 || applications > 31) {
      return toast.error("As aplicações por mês devem ficar entre 1 e 31.");
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        platform: form.platform?.trim() || null,
        description: form.description?.trim() || null,
        applications_per_month: form.recurrence === "once" ? 1 : applications,
        tasks: normalizeTasks(form.tasks),
      };
      if (editing) await updatePracticalEvalTemplate(editing.id, payload);
      else await createPracticalEvalTemplate(payload);
      toast.success(editing ? "Modelo atualizado." : "Modelo criado.");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar o modelo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar modelo" : "Novo modelo de Avaliação Prática"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="practical-model-title">Título *</Label>
              <Input
                id="practical-model-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ex.: Avaliação Prática Hikvision"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practical-model-platform">Plataforma / Sistema</Label>
              <Input
                id="practical-model-platform"
                value={form.platform || ""}
                onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}
                placeholder="Ex.: Hikvision, Intelbras, Ronda"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practical-model-sector">Setor</Label>
              <Select
                value={form.target_sector}
                onValueChange={(value) => setForm((current) => ({ ...current, target_sector: value as PracticalTargetSector }))}
              >
                <SelectTrigger id="practical-model-sector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRACTICAL_SECTORS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practical-model-min-score">Nota mínima (0–10)</Label>
              <Input
                id="practical-model-min-score"
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={form.min_approval_score}
                onChange={(event) =>
                  setForm((current) => ({ ...current, min_approval_score: Number(event.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practical-model-recurrence">Recorrência</Label>
              <Select
                value={form.recurrence}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    recurrence: value as PracticalRecurrence,
                    applications_per_month: value === "once" ? 1 : current.applications_per_month,
                  }))
                }
              >
                <SelectTrigger id="practical-model-recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Única vez</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="bimonthly">Bimestral</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practical-model-applications">Aplicações por mês</Label>
              <Input
                id="practical-model-applications"
                type="number"
                min={1}
                max={31}
                step={1}
                value={form.recurrence === "once" ? 1 : form.applications_per_month}
                disabled={form.recurrence === "once"}
                onChange={(event) =>
                  setForm((current) => ({ ...current, applications_per_month: Number(event.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practical-model-status">Situação</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, status: value as PracticalEvalTemplateInput["status"] }))
                }
              >
                <SelectTrigger id="practical-model-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="practical-model-description">Descrição / Instruções</Label>
            <textarea
              id="practical-model-description"
              className="min-h-20 w-full rounded-xl p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}
              value={form.description || ""}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Procedimentos ({tasks.length})</Label>
              {tasks.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-bold text-red-500"
                  onClick={() => setForm((current) => ({ ...current, tasks: [] }))}
                >
                  Limpar lista
                </button>
              )}
            </div>

            {tasks.map((task, index) => (
              <div
                key={task.id}
                className="flex items-start gap-2 rounded-xl p-2.5"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
              >
                <span className="text-xs font-black text-[#C8102E]">{index + 1}.</span>
                {task.category && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black"
                    style={{ background: "rgba(200,16,46,.08)", color: "#C8102E" }}
                  >
                    {task.category}
                  </span>
                )}
                <span className="min-w-0 flex-1 break-words text-sm" style={{ color: "var(--text-2)" }}>
                  {task.title}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-red-500"
                  onClick={() => setForm((current) => ({ ...current, tasks: tasks.filter((_, taskIndex) => taskIndex !== index) }))}
                  aria-label={`Remover procedimento ${task.title}`}
                  title={`Remover procedimento ${task.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
              <Input value={taskCategory} onChange={(event) => setTaskCategory(event.target.value)} placeholder="Grupo (opcional)" aria-label="Grupo do procedimento" />
              <Input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTask();
                  }
                }}
                placeholder="Procedimento a executar"
                aria-label="Procedimento a executar"
              />
              <Button type="button" variant="outline" onClick={addTask} disabled={!taskTitle.trim()}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          <Button onClick={save} disabled={saving} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
