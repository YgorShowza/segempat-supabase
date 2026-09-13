import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Clock3, Pencil, Plus, RefreshCw, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasPermission } from "@/lib/access-control";
import { listEmployees } from "@/lib/employees";
import { operationalDate } from "@/lib/operational-time";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  calculateTrainingWindow,
  createTrainingSchedule,
  deleteTrainingSchedule,
  deriveTrainingStatus,
  listTrainingSchedules,
  updateTrainingSchedule,
  type TrainingSchedule,
  type TrainingCycleStatus,
} from "@/lib/training-schedules";

const FILTERS = ["Todos", "Em dia", "Próximo ao vencimento", "Vencido"] as const;
const statusStyle = {
  "Em dia": { color: "#10b981", bg: "rgba(16,185,129,.10)", icon: CheckCircle2, priority: 3 },
  "Próximo ao vencimento": { color: "#f59e0b", bg: "rgba(245,158,11,.10)", icon: Clock3, priority: 2 },
  Vencido: { color: "#ef4444", bg: "rgba(239,68,68,.10)", icon: AlertTriangle, priority: 1 },
} as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function TrainingCyclesAdmin() {
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canManage = hasPermission(user, "training.manage");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingSchedule | null>(null);
  const [toDelete, setToDelete] = useState<TrainingSchedule | null>(null);
  const [form, setForm] = useState({ employee_id: "", cycle_days: 90, last_training_date: "", observations: "" });

  const schedules = useQuery({ queryKey: ["training-schedules"], queryFn: listTrainingSchedules, enabled: canManage });
  const employees = useQuery({ queryKey: ["employees"], queryFn: listEmployees, enabled: canManage });
  const rows = schedules.data ?? [];

  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const statusDiff = statusStyle[a.status].priority - statusStyle[b.status].priority;
    if (statusDiff) return statusDiff;
    const endDiff = (a.window_end || "9999-12-31").localeCompare(b.window_end || "9999-12-31");
    if (endDiff) return endDiff;
    return a.employee_name.localeCompare(b.employee_name, "pt-BR");
  }), [rows]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return sortedRows.filter((row) => {
      if (filter !== "Todos" && row.status !== filter) return false;
      return !q || [row.employee_name, row.employee_matricula, row.observations || ""].some((value) => normalizeText(value || "").includes(q));
    });
  }, [filter, search, sortedRows]);

  const counts = useMemo(() => ({
    ok: rows.filter((row) => row.status === "Em dia").length,
    near: rows.filter((row) => row.status === "Próximo ao vencimento").length,
    expired: rows.filter((row) => row.status === "Vencido").length,
  }), [rows]);

  const eligibleEmployees = useMemo(() => {
    const scheduledEmployeeIds = new Set(rows.map((row) => row.employee_id));
    return (employees.data ?? [])
      .filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor")
      .filter((employee) => editing ? employee.id === editing.employee_id : !scheduledEmployeeIds.has(employee.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
  }, [editing, employees.data, rows]);

  const filtersActive = Boolean(search.trim() || filter !== "Todos");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["training-schedules"] });

  const clearFilters = () => {
    setSearch("");
    setFilter("Todos");
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ employee_id: "", cycle_days: 90, last_training_date: "", observations: "" });
  };

  const closeEditor = () => {
    setOpen(false);
    resetForm();
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error("Você não possui permissão para gerenciar ciclos de treinamento");
      const employee = (employees.data ?? []).find((item) => item.id === form.employee_id);
      if (!employee) throw new Error("Selecione o colaborador");
      if (!form.last_training_date) throw new Error("Informe a data do último treinamento");
      const cycleDays = Number(form.cycle_days);
      if (!Number.isInteger(cycleDays) || cycleDays < 1 || cycleDays > 3650) throw new Error("O ciclo deve ser um número inteiro entre 1 e 3650 dias");
      const window = calculateTrainingWindow(form.last_training_date, cycleDays);
      const status = deriveTrainingStatus({ last_training_date: form.last_training_date, cycle_days: cycleDays, ...window });
      const payload = {
        employee_id: employee.id,
        employee_name: employee.full_name,
        employee_matricula: employee.matricula,
        cycle_days: cycleDays,
        last_training_date: form.last_training_date,
        window_start: window.window_start,
        window_end: window.window_end,
        observations: form.observations.trim() || null,
        status,
      };
      if (editing) await updateTrainingSchedule(editing.id, payload);
      else await createTrainingSchedule(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Ciclo atualizado" : "Ciclo criado");
      closeEditor();
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: deleteTrainingSchedule,
    onSuccess: () => {
      toast.success("Ciclo excluído");
      setToDelete(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ employee_id: "", cycle_days: 90, last_training_date: operationalDate(), observations: "" });
    setOpen(true);
  };

  const openEdit = (row: TrainingSchedule) => {
    setEditing(row);
    setForm({ employee_id: row.employee_id, cycle_days: row.cycle_days, last_training_date: row.last_training_date || "", observations: row.observations || "" });
    setOpen(true);
  };

  if (userLoading) return <Loading label="Validando acesso aos ciclos de treinamento..." />;
  if (!canManage) {
    return <section className="mx-auto max-w-3xl rounded-2xl p-10 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><CalendarClock className="mx-auto h-9 w-9 opacity-30" /><p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>Acesso restrito à gestão de treinamentos.</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Sua conta não possui a permissão necessária para administrar ciclos e vencimentos.</p></section>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <section className="rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/40"><CalendarClock className="h-4 w-4" /> Controle de validade</div>
            <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Ciclos e Vencimentos</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/50">Priorize vencidos, acompanhe a janela de atenção e mantenha o histórico de capacitação por colaborador.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Link to="/treinamentos" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white/80" style={{ border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.06)" }}><ArrowLeft className="h-4 w-4" /> Academia</Link><Button onClick={openNew} className="bg-[#C8102E] text-white hover:bg-[#A00D24]"><Plus className="mr-2 h-4 w-4" /> Novo ciclo</Button></div>
        </div>
      </section>

      {schedules.isLoading ? <Loading label="Carregando ciclos e vencimentos..." /> : schedules.isError ? (
        <section className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar os ciclos.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Tente novamente antes de cadastrar, atualizar ou excluir ciclos.</p>
          <Button variant="outline" className="mt-4" onClick={() => schedules.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
        </section>
      ) : <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumo dos ciclos">
          <Metric label="Em dia" value={counts.ok} color="#10b981" icon={CheckCircle2} active={filter === "Em dia"} onClick={() => setFilter((current) => current === "Em dia" ? "Todos" : "Em dia")} />
          <Metric label="Próximos" value={counts.near} color="#f59e0b" icon={Clock3} active={filter === "Próximo ao vencimento"} onClick={() => setFilter((current) => current === "Próximo ao vencimento" ? "Todos" : "Próximo ao vencimento")} />
          <Metric label="Vencidos" value={counts.expired} color="#ef4444" icon={AlertTriangle} active={filter === "Vencido"} onClick={() => setFilter((current) => current === "Vencido" ? "Todos" : "Vencido")} />
        </div>

        <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por colaborador, matrícula ou observação..." className="pl-10" aria-label="Buscar ciclos" /></div>
            <Select value={filter} onValueChange={(value) => setFilter(value as (typeof FILTERS)[number])}><SelectTrigger aria-label="Filtrar ciclos por situação"><SelectValue /></SelectTrigger><SelectContent>{FILTERS.map((value) => <SelectItem key={value} value={value}>{value === "Todos" ? "Todas as situações" : value}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between"><p style={{ color: "var(--text-4)" }}>{filtersActive ? `Exibindo ${filtered.length} de ${rows.length} ciclo(s)` : `${rows.length} ciclo(s) cadastrado(s) · vencidos e próximos aparecem primeiro`}</p>{filtersActive && <Button size="sm" variant="ghost" className="justify-start sm:justify-center" onClick={clearFilters}><X className="mr-2 h-3.5 w-3.5" /> Limpar filtros</Button>}</div>
        </section>

        <div className="space-y-3">
          {filtered.map((row) => {
            const conf = statusStyle[row.status];
            const Icon = conf.icon;
            return (
              <article key={row.id} className="relative overflow-hidden rounded-2xl p-4 pl-5 md:p-5 md:pl-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
                <div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: conf.color }} />
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: conf.bg, color: conf.color }}><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-black" style={{ color: "var(--text-1)" }}>{row.employee_name}</h2><span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: conf.bg, color: conf.color }}>{row.status}</span></div>
                      <p className="mt-0.5 break-words text-xs" style={{ color: "var(--text-4)" }}>Mat. {row.employee_matricula} · ciclo de {row.cycle_days} dias</p>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3" style={{ color: "var(--text-3)" }}><span>Último: <strong>{formatDate(row.last_training_date)}</strong></span><span>Atenção: <strong>{formatDate(row.window_start)}</strong></span><span>Vence: <strong style={{ color: conf.color }}>{formatDate(row.window_end)}</strong></span></div>
                      {row.observations && <p className="mt-2 break-words text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>{row.observations}</p>}
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 gap-2 sm:w-auto"><Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => openEdit(row)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Atualizar</Button><Button size="icon" variant="outline" className="shrink-0 text-red-500" onClick={() => setToDelete(row)} title="Excluir ciclo" aria-label={`Excluir ciclo de ${row.employee_name}`}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              </article>
            );
          })}
        </div>

        {filtered.length === 0 && <section className="rounded-2xl p-10 text-center md:p-12" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><CalendarClock className="mx-auto h-10 w-10 opacity-25" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>{rows.length === 0 ? "Nenhum ciclo cadastrado." : "Nenhum ciclo corresponde aos filtros."}</p><p className="mx-auto mt-1 max-w-lg text-sm" style={{ color: "var(--text-4)" }}>{rows.length === 0 ? "Cadastre ciclos para acompanhar prazos de capacitação da equipe." : "Limpe ou ajuste os filtros para voltar a visualizar os ciclos cadastrados."}</p>{rows.length === 0 ? <Button className="mt-4 bg-[#C8102E] text-white hover:bg-[#A00D24]" onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Criar primeiro ciclo</Button> : <Button variant="outline" className="mt-4" onClick={clearFilters}><X className="mr-2 h-4 w-4" /> Limpar filtros</Button>}</section>}
      </>}

      <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : closeEditor()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Atualizar ciclo" : "Novo ciclo"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Colaborador *</Label>{employees.isLoading ? <div role="status" className="rounded-xl p-3 text-sm" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)" }}>Carregando colaboradores...</div> : employees.isError ? <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}><p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar os colaboradores.</p><Button size="sm" variant="outline" className="mt-2" onClick={() => employees.refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar novamente</Button></div> : editing ? <div className="rounded-xl p-3 text-sm" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}><strong>{editing.employee_name}</strong><span className="ml-2 text-xs" style={{ color: "var(--text-4)" }}>Mat. {editing.employee_matricula}</span><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>O colaborador não pode ser trocado em um ciclo existente.</p></div> : eligibleEmployees.length > 0 ? <Select value={form.employee_id} onValueChange={(value) => setForm({ ...form, employee_id: value })}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{eligibleEmployees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.full_name} · {employee.matricula}</SelectItem>)}</SelectContent></Select> : <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}><div className="flex gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--text-4)" }} /><div><p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Todos os colaboradores elegíveis já possuem ciclo.</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Cada colaborador pode ter apenas um ciclo ativo no cadastro. Atualize o ciclo existente na lista.</p></div></div></div>}</div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="training-last-date">Último treinamento *</Label><Input id="training-last-date" type="date" value={form.last_training_date} onChange={(event) => setForm({ ...form, last_training_date: event.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="training-cycle-days">Ciclo em dias</Label><Input id="training-cycle-days" type="number" min={1} max={3650} step={1} value={form.cycle_days} onChange={(event) => setForm({ ...form, cycle_days: Number(event.target.value) })} /></div></div>
            <div className="space-y-1.5"><Label htmlFor="training-cycle-notes">Observações</Label><textarea id="training-cycle-notes" value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} className="min-h-24 w-full rounded-xl p-3 text-sm" placeholder="Registre somente observações necessárias ao acompanhamento do ciclo." style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }} /></div>
            {form.last_training_date && Number.isInteger(Number(form.cycle_days)) && Number(form.cycle_days) > 0 && (() => { const window = calculateTrainingWindow(form.last_training_date, Number(form.cycle_days)); const previewStatus: TrainingCycleStatus = deriveTrainingStatus({ last_training_date: form.last_training_date, cycle_days: Number(form.cycle_days), ...window }); const preview = statusStyle[previewStatus]; return <div className="rounded-xl p-3 text-xs" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-3)" }}><div className="flex flex-wrap items-center gap-2"><strong>Prévia:</strong><span className="rounded-full px-2 py-0.5 font-black" style={{ color: preview.color, background: preview.bg }}>{previewStatus}</span></div><p className="mt-2">Janela de atenção: <strong>{formatDate(window.window_start)}</strong> · vencimento: <strong>{formatDate(window.window_end)}</strong></p><p className="mt-1" style={{ color: "var(--text-4)" }}>As datas derivadas e a situação final são recalculadas e validadas pelo servidor ao salvar.</p></div>; })()}
          </div>
          <DialogFooter><Button variant="outline" onClick={closeEditor}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending || employees.isLoading || employees.isError || (!editing && eligibleEmployees.length === 0)} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">{save.isPending ? "Salvando..." : editing ? "Salvar atualização" : "Criar ciclo"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(nextOpen) => !nextOpen && setToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir ciclo de treinamento?</AlertDialogTitle><AlertDialogDescription>Esta ação remove o acompanhamento de validade de {toDelete?.employee_name}. Use a exclusão apenas quando o ciclo não deve mais existir; para registrar um novo treinamento, prefira “Atualizar”.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-[#C8102E] hover:bg-[#A00D24]" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)}>{remove.isPending ? "Excluindo..." : "Excluir ciclo"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function Metric({ label, value, color, icon: Icon, active, onClick }: { label: string; value: number; color: string; icon: typeof CheckCircle2; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className="rounded-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ background: active ? `${color}0d` : "var(--bg-surface)", border: `1px solid ${active ? `${color}50` : "var(--border)"}`, boxShadow: "var(--shadow-card, var(--shadow-md))" }}><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-1 text-[10px] font-bold" style={{ color }}>{active ? "Filtro ativo" : "Clique para filtrar"}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}><Icon className="h-4 w-4" /></div></div></button>;
}

function Loading({ label }: { label: string }) {
  return <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-16"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /><p className="text-xs" style={{ color: "var(--text-4)" }}>{label}</p></div>;
}
