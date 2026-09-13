import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Search, Filter, CheckCircle2,
  Clock3, ShieldCheck, Pencil, Trash2, Users, Target, X, Layers3, CalendarRange,
  Repeat2, PauseCircle, AlertTriangle, RefreshCw, ListChecks, UserMinus, PlayCircle,
  WandSparkles, Eye, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { listEmployees, type Employee } from "@/lib/employees";
import { listExams } from "@/lib/exams";
import {
  JUSTIFICATION_OPTIONS, TARGET_SECTORS,
  createCronogramaEntries, createRecurringModel, createSuspension,
  currentMonthStr, deleteCronogramaEntry, deleteRecurringModel, deleteSuspension,
  formatDate, formatMonth, listCronogramaEntries, listCronogramaEntriesByYear,
  listRecurringModels, listSuspensions, markCronogramaEntryComplete, shiftMonth,
  syncCronogramaWithExamAttempts, updateCronogramaEntry, updateRecurringModel,
  annualSummary, applyRecurringModels, cronogramaMetrics,
  type CronogramaEntry, type CronogramaEntryInput, type CronogramaStatus,
  type CronogramaSuspension, type RecurringModel,
} from "@/lib/cronograma";

type ViewMode = "mes" | "ano" | "pendencias" | "recorrencias" | "suspensoes";

const statusStyle: Record<CronogramaStatus, { color: string; bg: string; border: string }> = {
  Pendente: { color: "#f59e0b", bg: "rgba(245,158,11,.10)", border: "rgba(245,158,11,.28)" },
  Realizado: { color: "#10b981", bg: "rgba(16,185,129,.10)", border: "rgba(16,185,129,.28)" },
  Justificado: { color: "#60a5fa", bg: "rgba(96,165,250,.10)", border: "rgba(96,165,250,.28)" },
};

const emptyForm = (month: string): CronogramaEntryInput => ({
  month, employee_id: "", employee_name: "", employee_matricula: "", employee_sector: "",
  theme: "", type: "Planejado", status: "Pendente", justification: null,
  planned_date: null, completion_date: null, notes: null, exam_id: null, exam_title: null,
});

function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl ${className}`} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>{children}</section>;
}

function Metric({ label, value, icon: Icon, sub }: { label: string; value: string | number; icon: typeof Users; sub?: string }) {
  return <Surface className="p-4 relative overflow-hidden"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)", fontFamily: "var(--font-heading)" }}>{value}</p>{sub && <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{sub}</p>}</div><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-soft)" }}><Icon className="w-4 h-4" style={{ color: "var(--accent)" }} /></div></div></Surface>;
}

function StatusBadge({ status }: { status: CronogramaStatus }) {
  const s = statusStyle[status];
  return <span className="text-[10px] font-black px-2 py-1 rounded-full" style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>{status}</span>;
}

export function CronogramaWorkspace({
  autoOpenNew = false,
  onAutoOpenHandled,
}: {
  autoOpenNew?: boolean;
  onAutoOpenHandled?: () => void;
} = {}) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const isAdmin = user?.isAdmin ?? false;
  const [month, setMonth] = useState(currentMonthStr());
  const year = Number(month.slice(0, 4));
  const [view, setView] = useState<ViewMode>("mes");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [sectorFilter, setSectorFilter] = useState("Todos");
  const [entryOpen, setEntryOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [suspensionOpen, setSuspensionOpen] = useState(false);
  const [editing, setEditing] = useState<CronogramaEntry | null>(null);
  const [form, setForm] = useState<CronogramaEntryInput>(() => emptyForm(month));
  const [toDelete, setToDelete] = useState<CronogramaEntry | null>(null);
  const autoOpenHandledRef = useRef(false);

  const entriesQuery = useQuery({ queryKey: ["cronograma", month], queryFn: () => listCronogramaEntries(month) });
  const yearQuery = useQuery({ queryKey: ["cronograma-year", year], queryFn: () => listCronogramaEntriesByYear(year), enabled: view === "ano" });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const examsQuery = useQuery({ queryKey: ["exams"], queryFn: listExams });
  const recurringQuery = useQuery({ queryKey: ["cronograma-recurring"], queryFn: listRecurringModels });
  const suspensionsQuery = useQuery({ queryKey: ["cronograma-suspensions", month], queryFn: () => listSuspensions(month) });

  const entries = entriesQuery.data ?? [];
  const employees = (employeesQuery.data ?? []).filter((e) => e.status === "Ativo" && e.access_profile !== "Inspetor");
  const exams = (examsQuery.data ?? []).filter((e) => e.status === "Publicada");
  const recurring = recurringQuery.data ?? [];
  const suspensions = suspensionsQuery.data ?? [];
  const monthSuspension = suspensions.find((s) => s.type === "mes_suspenso");
  const metrics = cronogramaMetrics(entries);
  const sectors = useMemo(() => ["Todos", ...Array.from(new Set(employees.map((e) => e.sector))).sort()], [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== "Todos" && entry.status !== statusFilter) return false;
      if (sectorFilter !== "Todos" && entry.employee_sector !== sectorFilter) return false;
      return !q || [entry.employee_name, entry.employee_matricula, entry.employee_sector, entry.theme].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [entries, search, statusFilter, sectorFilter]);

  const pending = filtered.filter((e) => e.status === "Pendente");
  const yearly = annualSummary(yearQuery.data ?? [], year);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["cronograma", month] });
    qc.invalidateQueries({ queryKey: ["cronograma-year", year] });
    qc.invalidateQueries({ queryKey: ["cronograma-recurring"] });
    qc.invalidateQueries({ queryKey: ["cronograma-suspensions", month] });
  };

  const saveEntry = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error("Selecione o colaborador");
      if (!form.theme.trim()) throw new Error("Informe o tema");
      if (form.status === "Justificado" && !form.justification) throw new Error("Informe a justificativa");
      if (form.exam_id && form.status === "Realizado") throw new Error("Lançamento vinculado a prova é concluído automaticamente após a aprovação");
      if (!form.exam_id && form.status === "Realizado" && !form.completion_date) throw new Error("Informe a data de conclusão");
      if (editing) await updateCronogramaEntry(editing.id, form); else await createCronogramaEntries([form]);
    },
    onSuccess: () => { toast.success(editing ? "Lançamento atualizado" : "Lançamento criado"); setEntryOpen(false); setEditing(null); setForm(emptyForm(month)); refreshAll(); },
    onError: (e: Error) => toast.error(e.message.toLowerCase().includes("duplicate") ? "Já existe lançamento igual para este colaborador, tema e data." : e.message),
  });

  const removeEntry = useMutation({ mutationFn: deleteCronogramaEntry, onSuccess: () => { toast.success("Lançamento excluído"); setToDelete(null); refreshAll(); }, onError: (e: Error) => toast.error(e.message) });
  const completeEntry = useMutation({ mutationFn: (id: string) => markCronogramaEntryComplete(id), onSuccess: () => { toast.success("Lançamento marcado como realizado"); refreshAll(); }, onError: (e: Error) => toast.error(e.message) });
  const syncExams = useMutation({ mutationFn: () => syncCronogramaWithExamAttempts(month), onSuccess: (n) => { toast.success(n ? `${n} lançamento(s) atualizado(s) pelas provas.` : "Nenhum novo resultado de prova encontrado."); refreshAll(); }, onError: (e: Error) => toast.error(e.message) });

  const selectEmployee = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    setForm((f) => ({ ...f, employee_id: id, employee_name: emp?.full_name ?? "", employee_matricula: emp?.matricula ?? "", employee_sector: emp?.sector ?? "" }));
  };
  const selectExam = (id: string) => {
    if (id === "none") return setForm((f) => ({ ...f, exam_id: null, exam_title: null }));
    const exam = exams.find((e) => e.id === id);
    setForm((f) => ({ ...f, exam_id: id, exam_title: exam?.title ?? null, theme: exam?.title || f.theme, status: f.status === "Realizado" ? "Pendente" : f.status, type: "Planejado", completion_date: null }));
  };
  const openNew = () => { setEditing(null); setForm(emptyForm(month)); setEntryOpen(true); };

  useEffect(() => {
    if (!autoOpenNew) {
      autoOpenHandledRef.current = false;
      return;
    }
    if (!isAdmin || autoOpenHandledRef.current) return;
    autoOpenHandledRef.current = true;
    setEditing(null);
    setForm(emptyForm(month));
    setEntryOpen(true);
    onAutoOpenHandled?.();
  }, [autoOpenNew, isAdmin, month, onAutoOpenHandled]);
  const openEdit = (e: CronogramaEntry) => { setEditing(e); setForm({ month: e.month, employee_id: e.employee_id, employee_name: e.employee_name, employee_matricula: e.employee_matricula, employee_sector: e.employee_sector, theme: e.theme, exam_id: e.exam_id, exam_title: e.exam_title, type: e.type, status: e.status, justification: e.justification, planned_date: e.planned_date, completion_date: e.completion_date, notes: e.notes, question_bank_ids: e.question_bank_ids }); setEntryOpen(true); };

  const views: Array<{ id: ViewMode; label: string; icon: typeof CalendarDays }> = [
    { id: "mes", label: "Mês", icon: CalendarDays }, { id: "ano", label: "Ano", icon: CalendarRange },
    { id: "pendencias", label: "Pendências", icon: ListChecks }, { id: "recorrencias", label: "Recorrências", icon: Repeat2 },
    { id: "suspensoes", label: "Suspensões", icon: PauseCircle },
  ];

  return <div className="mx-auto w-full max-w-7xl space-y-5 pb-10">
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118 0%,#2b0b13 48%,#111216 100%)", border: "1px solid rgba(200,16,46,.26)", boxShadow: "0 10px 34px rgba(200,16,46,.12)" }}>
      <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle,rgba(200,16,46,.24),transparent 70%)" }} />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em]" style={{ color: "rgba(255,255,255,.42)" }}><Layers3 className="w-3.5 h-3.5" /> Centro de planejamento</div><h1 className="mt-2 text-2xl md:text-3xl font-black text-white" style={{ fontFamily: "var(--font-heading)" }}>Cronograma Operacional</h1><p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,.5)" }}>Planejamento, execução, pendências e recorrências com dados reais.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}><button className="h-10 w-10 flex items-center justify-center text-white/70" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft className="w-4 h-4" /></button><button className="h-10 px-3 text-sm font-bold text-white capitalize min-w-[150px]" onClick={() => setMonth(currentMonthStr())}>{formatMonth(month)}</button><button className="h-10 w-10 flex items-center justify-center text-white/70" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight className="w-4 h-4" /></button></div>
          {isAdmin && <><Button variant="outline" onClick={() => setBulkOpen(true)} className="h-10 border-white/15 bg-white/5 text-white hover:bg-white/10"><Users className="w-4 h-4 mr-2" /> Em massa</Button><Button onClick={openNew} className="h-10 bg-[#C8102E] hover:bg-[#A00D24] text-white font-bold"><Plus className="w-4 h-4 mr-2" /> Novo</Button></>}
        </div>
      </div>
    </motion.section>

    {monthSuspension && <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.28)" }}><PauseCircle className="w-5 h-5 mt-0.5 text-amber-500" /><div><p className="font-bold text-sm" style={{ color: "var(--text-1)" }}>Mês suspenso</p><p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>{monthSuspension.reason}{monthSuspension.notes ? ` · ${monthSuspension.notes}` : ""}</p></div></div>}

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Metric label="Planejados" value={metrics.total} icon={Target} /><Metric label="Realizados" value={metrics.realizado} icon={CheckCircle2} /><Metric label="Pendentes" value={metrics.pendente} icon={Clock3} /><Metric label="Justificados" value={metrics.justificado} icon={ShieldCheck} /><Metric label="Execução" value={`${metrics.executionRate}%`} icon={BarChart3} sub="realizado ÷ total" /></div>

    <Surface className="p-2"><div className="grid grid-cols-2 sm:grid-cols-5 gap-1">{views.map((v) => <button key={v.id} onClick={() => setView(v.id)} className="h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all" style={view === v.id ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid rgba(200,16,46,.2)" } : { color: "var(--text-4)", border: "1px solid transparent" }}><v.icon className="w-4 h-4" /> {v.label}</button>)}</div></Surface>

    {(view === "mes" || view === "pendencias") && <Surface className="p-4"><div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4" style={{ color: "var(--accent)" }} /><h2 className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Filtros operacionais</h2>{(search || statusFilter !== "Todos" || sectorFilter !== "Todos") && <button onClick={() => { setSearch(""); setStatusFilter("Todos"); setSectorFilter("Todos"); }} className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--text-4)" }}><X className="w-3 h-3" /> Limpar</button>}</div><div className="grid gap-3 md:grid-cols-[1fr_180px_180px]"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar colaborador, matrícula, setor ou tema..." className="pl-10" /></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Todos","Pendente","Realizado","Justificado"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select><Select value={sectorFilter} onValueChange={setSectorFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sectors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div></Surface>}

    {view === "mes" && <MonthView rows={filtered} loading={entriesQuery.isLoading} error={entriesQuery.isError} isAdmin={isAdmin} onEdit={openEdit} onDelete={setToDelete} onComplete={(id) => completeEntry.mutate(id)} onSync={() => syncExams.mutate()} syncing={syncExams.isPending} />}
    {view === "pendencias" && <PendingView rows={pending} />}
    {view === "ano" && <AnnualView rows={yearly} onMonth={(m) => { setMonth(m); setView("mes"); }} loading={yearQuery.isLoading} />}
    {view === "recorrencias" && <RecurringView rows={recurring} isAdmin={isAdmin} onNew={() => setRecurringOpen(true)} onToggle={async (m) => { await updateRecurringModel(m.id, { active: !m.active }); toast.success(m.active ? "Recorrência pausada" : "Recorrência ativada"); refreshAll(); }} onDelete={async (id) => { await deleteRecurringModel(id); toast.success("Recorrência excluída"); refreshAll(); }} onApply={async () => { const count = await applyRecurringModels({ month, models: recurring, employees, existingEntries: entries }); toast.success(count ? `${count} lançamento(s) gerado(s).` : "Nenhum lançamento novo foi necessário."); refreshAll(); }} />}
    {view === "suspensoes" && <SuspensionsView rows={suspensions} isAdmin={isAdmin} onNew={() => setSuspensionOpen(true)} onDelete={async (id) => { await deleteSuspension(id); toast.success("Registro removido"); refreshAll(); }} />}

    <EntryDialog open={entryOpen} setOpen={setEntryOpen} editing={editing} form={form} setForm={setForm} employees={employees} exams={exams} selectEmployee={selectEmployee} selectExam={selectExam} onSave={() => saveEntry.mutate()} saving={saveEntry.isPending} />
    <BulkDialog open={bulkOpen} setOpen={setBulkOpen} month={month} employees={employees} exams={exams} existing={entries} onDone={refreshAll} />
    <RecurringDialog open={recurringOpen} setOpen={setRecurringOpen} userName={user?.nome || null} onDone={refreshAll} />
    <SuspensionDialog open={suspensionOpen} setOpen={setSuspensionOpen} month={month} employees={employees} userName={user?.nome || null} onDone={refreshAll} />

    <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir lançamento?</AlertDialogTitle><AlertDialogDescription>{toDelete ? `${toDelete.employee_name} · ${toDelete.theme}. Esta ação não pode ser desfeita.` : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-[#C8102E] hover:bg-[#A00D24]" onClick={() => toDelete && removeEntry.mutate(toDelete.id)}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function MonthView({ rows, loading, error, isAdmin, onEdit, onDelete, onComplete, onSync, syncing }: { rows: CronogramaEntry[]; loading: boolean; error: boolean; isAdmin: boolean; onEdit: (e: CronogramaEntry) => void; onDelete: (e: CronogramaEntry) => void; onComplete: (id: string) => void; onSync: () => void; syncing: boolean }) {
  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
  if (error) return <Surface className="p-8 text-center"><AlertTriangle className="w-8 h-8 mx-auto text-amber-500" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar o cronograma.</p></Surface>;
  return <div className="space-y-3"><div className="flex justify-end">{isAdmin && <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}><RefreshCw className={`w-3.5 h-3.5 mr-2 ${syncing ? "animate-spin" : ""}`} /> Sincronizar provas</Button>}</div>{rows.length === 0 ? <Surface className="p-10 text-center"><CalendarDays className="mx-auto w-10 h-10 opacity-30" style={{ color: "var(--text-4)" }} /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhum lançamento encontrado.</p></Surface> : rows.map((entry, i) => <motion.article key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * .025 }}><Surface className="overflow-hidden"><div className="h-[3px]" style={{ background: statusStyle[entry.status].color }} /><div className="p-4 md:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-sm md:text-base" style={{ color: "var(--text-1)" }}>{entry.employee_name}</h3><StatusBadge status={entry.status} /></div><p className="text-xs mt-1" style={{ color: "var(--text-4)" }}>Mat. {entry.employee_matricula} · {entry.employee_sector}</p><p className="mt-3 text-sm font-semibold" style={{ color: "var(--text-2)" }}>{entry.theme}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-4)" }}><span>Prevista: <strong style={{ color: "var(--text-3)" }}>{formatDate(entry.planned_date)}</strong></span><span>Conclusão: <strong style={{ color: "var(--text-3)" }}>{formatDate(entry.completion_date)}</strong></span>{entry.exam_title && <span>Prova: <strong style={{ color: "var(--text-3)" }}>{entry.exam_title}</strong></span>}</div>{entry.justification && <p className="mt-2 text-xs text-blue-400">Justificativa: {entry.justification}</p>}{entry.notes && <p className="mt-2 text-xs" style={{ color: "var(--text-4)" }}>{entry.notes}</p>}</div>{isAdmin && <div className="flex flex-wrap items-center gap-2 shrink-0">{entry.status === "Pendente" && !entry.exam_id && <Button size="sm" variant="outline" onClick={() => onComplete(entry.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Concluir</Button>}{entry.status === "Pendente" && entry.exam_id && <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold" style={{ background: "rgba(245,158,11,.08)", color: "#d97706", border: "1px solid rgba(245,158,11,.22)" }}><Clock3 className="w-3.5 h-3.5" /> Aguardando aprovação da prova</span>}{entry.status === "Pendente" && <Button size="sm" variant="outline" onClick={() => onEdit(entry)}><Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar</Button>}{entry.status === "Pendente" && <Button size="sm" variant="outline" className="text-red-500" onClick={() => onDelete(entry)}><Trash2 className="w-3.5 h-3.5" /></Button>}</div>}</div></Surface></motion.article>)}</div>;
}

function PendingView({ rows }: { rows: CronogramaEntry[] }) {
  const grouped = useMemo(() => Object.entries(rows.reduce<Record<string, CronogramaEntry[]>>((acc, e) => { (acc[e.employee_sector] ||= []).push(e); return acc; }, {})), [rows]);
  return <div className="grid gap-4 lg:grid-cols-2">{rows.length === 0 ? <Surface className="p-10 text-center lg:col-span-2"><CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhuma pendência neste filtro.</p></Surface> : grouped.map(([sector, list]) => <Surface key={sector} className="overflow-hidden"><div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}><h3 className="font-bold text-sm" style={{ color: "var(--text-1)" }}>{sector}</h3><span className="text-xs font-black text-amber-500">{list.length}</span></div><div className="divide-y" style={{ borderColor: "var(--border)" }}>{list.map((e) => <div key={e.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>{e.employee_name}</p><p className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>Mat. {e.employee_matricula}</p></div><Clock3 className="w-4 h-4 text-amber-500" /></div><p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{e.theme}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Previsto: {formatDate(e.planned_date)}</p></div>)}</div></Surface>)}</div>;
}

function AnnualView({ rows, onMonth, loading }: { rows: ReturnType<typeof annualSummary>; onMonth: (month: string) => void; loading: boolean }) {
  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{rows.map((m) => <button key={m.month} onClick={() => onMonth(m.month)} className="text-left"><Surface className="p-4 hover:-translate-y-0.5 transition-transform"><div className="flex items-center justify-between gap-2"><p className="font-black capitalize" style={{ color: "var(--text-1)" }}>{formatMonth(m.month).replace(/ de \d{4}$/i, "")}</p><span className="text-xs font-black" style={{ color: m.executionRate >= 80 ? "#10b981" : m.executionRate >= 50 ? "#f59e0b" : "var(--accent)" }}>{m.executionRate}%</span></div><div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-3)" }}><div className="h-full rounded-full" style={{ width: `${m.executionRate}%`, background: m.executionRate >= 80 ? "#10b981" : m.executionRate >= 50 ? "#f59e0b" : "#C8102E" }} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="font-black text-sm" style={{ color: "var(--text-1)" }}>{m.total}</p><p className="text-[9px] uppercase" style={{ color: "var(--text-4)" }}>Total</p></div><div><p className="font-black text-sm text-emerald-500">{m.realizado}</p><p className="text-[9px] uppercase" style={{ color: "var(--text-4)" }}>Feitos</p></div><div><p className="font-black text-sm text-amber-500">{m.pendente}</p><p className="text-[9px] uppercase" style={{ color: "var(--text-4)" }}>Pend.</p></div></div></Surface></button>)}</div>;
}

function RecurringView({ rows, isAdmin, onNew, onToggle, onDelete, onApply }: { rows: RecurringModel[]; isAdmin: boolean; onNew: () => void; onToggle: (m: RecurringModel) => void; onDelete: (id: string) => void; onApply: () => void }) {
  return <div className="space-y-3"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-black" style={{ color: "var(--text-1)" }}>Modelos recorrentes</h2><p className="text-xs mt-1" style={{ color: "var(--text-4)" }}>Gere treinamentos mensais sem duplicar o que já existe.</p></div>{isAdmin && <div className="flex gap-2"><Button variant="outline" onClick={onApply}><WandSparkles className="w-4 h-4 mr-2" /> Aplicar ao mês</Button><Button onClick={onNew} className="bg-[#C8102E] hover:bg-[#A00D24] text-white"><Plus className="w-4 h-4 mr-2" /> Novo modelo</Button></div>}</div>{rows.length === 0 ? <Surface className="p-10 text-center"><Repeat2 className="w-10 h-10 mx-auto opacity-30" style={{ color: "var(--text-4)" }} /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhum modelo recorrente.</p></Surface> : <div className="grid gap-3 md:grid-cols-2">{rows.map((m) => <Surface key={m.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Repeat2 className="w-4 h-4" style={{ color: m.active ? "#10b981" : "var(--text-4)" }} /><p className="font-bold" style={{ color: "var(--text-1)" }}>{m.theme}</p></div><p className="text-xs mt-2" style={{ color: "var(--text-4)" }}>Setor: {m.target_sector} · Mensal</p><span className="inline-flex mt-3 text-[10px] font-black px-2 py-1 rounded-full" style={{ color: m.active ? "#10b981" : "var(--text-4)", background: m.active ? "rgba(16,185,129,.1)" : "var(--bg-surface-3)" }}>{m.active ? "ATIVO" : "PAUSADO"}</span></div>{isAdmin && <div className="flex gap-1"><Button size="icon" variant="ghost" title={m.active ? "Pausar" : "Ativar"} onClick={() => onToggle(m)}>{m.active ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}</Button><Button size="icon" variant="ghost" className="text-red-500" onClick={() => onDelete(m.id)}><Trash2 className="w-4 h-4" /></Button></div>}</div></Surface>)}</div>}</div>;
}

function SuspensionsView({ rows, isAdmin, onNew, onDelete }: { rows: CronogramaSuspension[]; isAdmin: boolean; onNew: () => void; onDelete: (id: string) => void }) {
  return <div className="space-y-3"><div className="flex justify-between gap-3"><div><h2 className="font-black" style={{ color: "var(--text-1)" }}>Suspensões e ausências</h2><p className="text-xs mt-1" style={{ color: "var(--text-4)" }}>Registre impedimentos que impactam o planejamento.</p></div>{isAdmin && <Button onClick={onNew} className="bg-[#C8102E] hover:bg-[#A00D24] text-white"><Plus className="w-4 h-4 mr-2" /> Registrar</Button>}</div>{rows.length === 0 ? <Surface className="p-10 text-center"><ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhuma suspensão ou ausência no mês.</p></Surface> : <div className="grid gap-3 md:grid-cols-2">{rows.map((s) => <Surface key={s.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: s.type === "mes_suspenso" ? "rgba(245,158,11,.1)" : "rgba(96,165,250,.1)" }}>{s.type === "mes_suspenso" ? <PauseCircle className="w-5 h-5 text-amber-500" /> : <UserMinus className="w-5 h-5 text-blue-400" />}</div><div><p className="font-bold text-sm" style={{ color: "var(--text-1)" }}>{s.type === "mes_suspenso" ? "Mês suspenso" : s.employee_name}</p><p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>{s.reason}</p>{s.type === "ausencia_operador" && <p className="text-xs mt-1" style={{ color: "var(--text-4)" }}>{formatDate(s.date_start)} → {formatDate(s.date_end)}</p>}{s.notes && <p className="text-xs mt-2" style={{ color: "var(--text-4)" }}>{s.notes}</p>}</div></div>{isAdmin && <Button size="icon" variant="ghost" className="text-red-500" onClick={() => onDelete(s.id)}><Trash2 className="w-4 h-4" /></Button>}</div></Surface>)}</div>}</div>;
}

function EntryDialog({ open, setOpen, editing, form, setForm, employees, exams, selectEmployee, selectExam, onSave, saving }: any) {
  const historical = editing?.status === "Realizado" || editing?.status === "Justificado";
  const examLinked = Boolean(form.exam_id);
  const setStatus = (value: CronogramaStatus) => setForm({ ...form, status: value, type: value === "Realizado" ? "Realizado" : "Planejado", justification: value === "Justificado" ? form.justification : null, completion_date: value === "Realizado" ? form.completion_date : null });
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader><div className="space-y-4">{historical && <div className="rounded-xl p-3 text-xs font-semibold" style={{ background: "rgba(59,130,246,.07)", border: "1px solid rgba(59,130,246,.22)", color: "var(--text-3)" }}>Este lançamento já faz parte do histórico operacional. Estado, colaborador, tema, prova e datas não podem ser reabertos pela interface.</div>}<div className="grid gap-3 md:grid-cols-2"><div className="space-y-1.5"><Label>Colaborador *</Label><Select value={form.employee_id} onValueChange={selectEmployee} disabled={historical}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{employees.map((e: Employee) => <SelectItem key={e.id} value={e.id}>{e.full_name} · {e.matricula} · {e.sector}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Prova vinculada</Label><Select value={form.exam_id || "none"} onValueChange={selectExam} disabled={historical}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhuma prova</SelectItem>{exams.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-1.5"><Label>Tema *</Label><Input value={form.theme} disabled={historical} onChange={(e) => setForm({ ...form, theme: e.target.value })} /></div><div className="grid gap-3 md:grid-cols-3"><div className="space-y-1.5"><Label>Tipo (automático)</Label><Select value={form.type || "Planejado"} disabled><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Planejado">Planejado</SelectItem><SelectItem value="Realizado">Realizado</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Situação</Label><Select value={form.status || "Pendente"} onValueChange={(v) => setStatus(v as CronogramaStatus)} disabled={historical}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Pendente">Pendente</SelectItem>{!examLinked && <SelectItem value="Realizado">Realizado</SelectItem>}<SelectItem value="Justificado">Justificado</SelectItem></SelectContent></Select></div>{form.status === "Justificado" && <div className="space-y-1.5"><Label>Justificativa *</Label><Select value={form.justification || ""} onValueChange={(v) => setForm({ ...form, justification: v })} disabled={editing?.status === "Realizado"}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{JUSTIFICATION_OPTIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>}</div>{examLinked && form.status !== "Justificado" && <div className="rounded-xl p-3 text-xs font-semibold" style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.22)", color: "#b45309" }}>A conclusão deste lançamento é automática: o SEGEMPAT marcará como Realizado quando o colaborador for aprovado na prova vinculada.</div>}<div className="grid gap-3 md:grid-cols-2"><div className="space-y-1.5"><Label>Data prevista</Label><Input type="date" value={form.planned_date || ""} disabled={historical} onChange={(e) => setForm({ ...form, planned_date: e.target.value || null })} /></div>{!examLinked && form.status === "Realizado" && <div className="space-y-1.5"><Label>Data de conclusão *</Label><Input type="date" value={form.completion_date || ""} disabled={historical} onChange={(e) => setForm({ ...form, completion_date: e.target.value || null })} /></div>}{examLinked && <div className="space-y-1.5"><Label>Data de conclusão</Label><Input type="text" value={form.completion_date ? formatDate(form.completion_date) : "Definida automaticamente pela aprovação"} disabled /></div>}</div><div className="space-y-1.5"><Label>Observações</Label><textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} className="min-h-24 w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={onSave} disabled={saving} className="bg-[#C8102E] hover:bg-[#A00D24] text-white">{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter></DialogContent></Dialog>;
}

function BulkDialog({ open, setOpen, month, employees, exams, existing, onDone }: { open: boolean; setOpen: (v: boolean) => void; month: string; employees: Employee[]; exams: any[]; existing: CronogramaEntry[]; onDone: () => void }) {
  const [selected, setSelected] = useState<string[]>([]); const [themes, setThemes] = useState<string[]>([]); const [theme, setTheme] = useState(""); const [examId, setExamId] = useState("none"); const [date, setDate] = useState(""); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false);
  const toggle = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const addTheme = () => { const t = theme.trim(); if (t && !themes.includes(t)) setThemes((p) => [...p, t]); setTheme(""); };
  const chooseExam = (id: string) => { setExamId(id); if (id !== "none") { const ex = exams.find((e) => e.id === id); if (ex?.title && !themes.includes(ex.title)) setThemes((p) => [...p, ex.title]); } };
  const save = async () => { if (!selected.length) return toast.error("Selecione ao menos um colaborador"); if (!themes.length) return toast.error("Adicione ao menos um tema"); const existingKeys = new Set(existing.map((e) => `${e.employee_id}|${e.theme.toLowerCase()}|${e.planned_date || ""}`)); const rows: CronogramaEntryInput[] = []; for (const id of selected) { const emp = employees.find((e) => e.id === id); if (!emp) continue; for (const t of themes) { const key = `${id}|${t.toLowerCase()}|${date}`; if (existingKeys.has(key)) continue; const exam = exams.find((e) => e.id === examId && e.title === t); rows.push({ month, employee_id: emp.id, employee_name: emp.full_name, employee_matricula: emp.matricula, employee_sector: emp.sector, theme: t, status: "Pendente", type: "Planejado", planned_date: date || null, notes: notes || null, exam_id: exam?.id || null, exam_title: exam?.title || null }); } } if (!rows.length) return toast.error("Todos os lançamentos selecionados já existem"); setSaving(true); try { await createCronogramaEntries(rows); toast.success(`${rows.length} lançamento(s) criado(s).`); setOpen(false); setSelected([]); setThemes([]); setTheme(""); setExamId("none"); setDate(""); setNotes(""); onDone(); } catch (e: any) { toast.error(e.message); } finally { setSaving(false); } };
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Lançamento em massa</DialogTitle></DialogHeader><div className="space-y-5"><div><div className="flex items-center justify-between mb-2"><Label>Colaboradores *</Label><button className="text-xs font-bold" style={{ color: "var(--accent)" }} onClick={() => setSelected(selected.length === employees.length ? [] : employees.map((e) => e.id))}>{selected.length === employees.length ? "Desmarcar todos" : "Selecionar todos"}</button></div><div className="grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">{employees.map((e) => <label key={e.id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer" style={{ border: "1px solid var(--border)", background: selected.includes(e.id) ? "var(--accent-soft)" : "var(--bg-surface-2)" }}><input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} /><span className="min-w-0"><span className="block text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{e.full_name}</span><span className="block text-xs" style={{ color: "var(--text-4)" }}>{e.matricula} · {e.sector}</span></span></label>)}</div></div><div className="space-y-2"><Label>Temas *</Label><div className="flex gap-2"><Input value={theme} onChange={(e) => setTheme(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTheme(); } }} placeholder="Digite um tema" /><Button variant="outline" onClick={addTheme}>Adicionar</Button></div><Select value={examId} onValueChange={chooseExam}><SelectTrigger><SelectValue placeholder="Adicionar prova publicada" /></SelectTrigger><SelectContent><SelectItem value="none">Selecionar prova...</SelectItem>{exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent></Select><div className="flex flex-wrap gap-2">{themes.map((t) => <span key={t} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{t}<button onClick={() => setThemes((p) => p.filter((x) => x !== t))}><X className="w-3 h-3" /></button></span>)}</div></div><div className="grid md:grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Data prevista</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><div className="space-y-1.5"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div></div><div className="rounded-xl p-3 text-sm" style={{ background: "var(--bg-surface-2)", color: "var(--text-3)" }}>{selected.length} colaborador(es) × {themes.length} tema(s) = <strong style={{ color: "var(--text-1)" }}>{selected.length * themes.length} lançamento(s)</strong></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving} className="bg-[#C8102E] hover:bg-[#A00D24] text-white">{saving ? "Criando..." : "Criar lançamentos"}</Button></DialogFooter></DialogContent></Dialog>;
}

function RecurringDialog({ open, setOpen, userName, onDone }: { open: boolean; setOpen: (v: boolean) => void; userName: string | null; onDone: () => void }) {
  const [theme, setTheme] = useState(""); const [sector, setSector] = useState("Todos"); const [saving, setSaving] = useState(false);
  const save = async () => { if (!theme.trim()) return toast.error("Informe o tema"); setSaving(true); try { await createRecurringModel({ theme, target_sector: sector, active: true, created_by_name: userName }); toast.success("Modelo recorrente criado"); setOpen(false); setTheme(""); setSector("Todos"); onDone(); } catch (e: any) { toast.error(e.message); } finally { setSaving(false); } };
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Novo modelo recorrente</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>Tema *</Label><Input value={theme} onChange={(e) => setTheme(e.target.value)} /></div><div className="space-y-1.5"><Label>Setor-alvo</Label><Select value={sector} onValueChange={setSector}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><p className="text-xs" style={{ color: "var(--text-4)" }}>O modelo poderá ser aplicado mensalmente sem criar duplicidades.</p></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving} className="bg-[#C8102E] hover:bg-[#A00D24] text-white">Salvar modelo</Button></DialogFooter></DialogContent></Dialog>;
}

function SuspensionDialog({ open, setOpen, month, employees, userName, onDone }: { open: boolean; setOpen: (v: boolean) => void; month: string; employees: Employee[]; userName: string | null; onDone: () => void }) {
  const [type, setType] = useState<"mes_suspenso" | "ausencia_operador">("ausencia_operador"); const [employeeId, setEmployeeId] = useState(""); const [reason, setReason] = useState(""); const [notes, setNotes] = useState(""); const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => { if (!reason.trim()) return toast.error("Informe o motivo"); if (type === "ausencia_operador" && !employeeId) return toast.error("Selecione o colaborador"); if (start && end && end < start) return toast.error("A data final não pode ser anterior à inicial"); const emp = employees.find((e) => e.id === employeeId); setSaving(true); try { await createSuspension({ type, month, reason: reason.trim(), notes: notes || null, employee_id: type === "ausencia_operador" ? employeeId : null, employee_name: type === "ausencia_operador" ? emp?.full_name : null, employee_matricula: type === "ausencia_operador" ? emp?.matricula : null, date_start: type === "ausencia_operador" ? start || null : null, date_end: type === "ausencia_operador" ? end || null : null, created_by_name: userName }); toast.success("Registro criado"); setOpen(false); setReason(""); setNotes(""); setEmployeeId(""); setStart(""); setEnd(""); onDone(); } catch (e: any) { toast.error(e.message); } finally { setSaving(false); } };
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Registrar suspensão ou ausência</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>Tipo</Label><Select value={type} onValueChange={(v) => setType(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ausencia_operador">Ausência de colaborador</SelectItem><SelectItem value="mes_suspenso">Suspender mês</SelectItem></SelectContent></Select></div>{type === "ausencia_operador" && <><div className="space-y-1.5"><Label>Colaborador *</Label><Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name} · {e.matricula}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Início</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div><div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div></div></>}<div className="space-y-1.5"><Label>Motivo *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div><div className="space-y-1.5"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving} className="bg-[#C8102E] hover:bg-[#A00D24] text-white">Salvar</Button></DialogFooter></DialogContent></Dialog>;
}
