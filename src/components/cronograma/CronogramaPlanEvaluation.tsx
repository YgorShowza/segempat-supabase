import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, CheckCircle2, Loader2, Search, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuestionBankPicker } from "@/components/cronograma/QuestionBankPicker";
import { listEmployees } from "@/lib/employees";
import { listExams } from "@/lib/exams";
import { createCronogramaEntries, formatMonth } from "@/lib/cronograma";
import { questionThemeLabel, type QuestionBankItem } from "@/lib/question-bank";

const SECTORS = ["Vigilância", "CFTV", "Portaria", "Ronda", "Administrativo", "Todos"];

export function CronogramaPlanEvaluation({ open, onOpenChange, onComplete }: { open: boolean; onOpenChange: (open: boolean) => void; onComplete?: () => void }) {
  const [theme, setTheme] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [sector, setSector] = useState("Vigilância");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<QuestionBankItem[]>([]);
  const [questionPickerOpen, setQuestionPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: listEmployees, enabled: open });
  const examsQuery = useQuery({ queryKey: ["exams"], queryFn: listExams, enabled: open });

  const employees = useMemo(() => (employeesQuery.data ?? []).filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor"), [employeesQuery.data]);
  const themeOptions = useMemo(() => Array.from(new Set((examsQuery.data ?? []).map((exam) => exam.title).filter(Boolean))).sort(), [examsQuery.data]);

  const sectorEmployees = useMemo(() => employees.filter((employee) => sector === "Todos" || employee.sector === sector), [employees, sector]);
  const visibleEmployees = useMemo(() => sectorEmployees.filter((employee) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return employee.full_name.toLowerCase().includes(query) || employee.matricula.toLowerCase().includes(query);
  }).sort((a, b) => a.full_name.localeCompare(b.full_name)), [sectorEmployees, search]);

  const allSectorSelected = sectorEmployees.length > 0 && sectorEmployees.every((employee) => selectedIds.includes(employee.id));
  const month = plannedDate ? plannedDate.slice(0, 7) : "";
  const valid = theme.trim() && plannedDate && selectedIds.length > 0;

  const reset = () => {
    setTheme("");
    setPlannedDate("");
    setSector("Vigilância");
    setSearch("");
    setSelectedIds([]);
    setSelectedQuestions([]);
    setQuestionPickerOpen(false);
    setSaving(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleSector = () => {
    const ids = sectorEmployees.map((employee) => employee.id);
    setSelectedIds((current) => allSectorSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
  };

  const useQuestions = (items: QuestionBankItem[]) => {
    const labels = Array.from(new Set(items.map(questionThemeLabel)));
    if (labels.length > 1) {
      toast.error("Selecione questões do mesmo tema para um único planejamento.");
      return;
    }
    setSelectedQuestions(items);
    if (labels[0]) setTheme(labels[0]);
  };

  const save = async () => {
    if (!valid) return toast.error("Preencha tema, data e selecione ao menos um colaborador.");
    setSaving(true);
    try {
      const selectedEmployees = employees.filter((employee) => selectedIds.includes(employee.id));
      await createCronogramaEntries(selectedEmployees.map((employee) => ({
        month,
        employee_id: employee.id,
        employee_name: employee.full_name,
        employee_matricula: employee.matricula,
        employee_sector: employee.sector,
        theme: theme.trim(),
        type: "Planejado",
        status: "Pendente",
        planned_date: plannedDate,
        question_bank_ids: selectedQuestions.map((question) => question.id),
      })));
      toast.success(`${selectedEmployees.length} avaliação(ões) planejadas para ${formatMonth(month)}.`);
      onComplete?.();
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao planejar avaliações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-500" /> Planejar Avaliação em Lote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 rounded-2xl p-3 text-xs" style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.24)", color: "var(--text-2)" }}><Sparkles className="h-4 w-4 shrink-0 text-blue-500" /><span>Agende o mesmo tema para vários colaboradores. Os registros entram como <strong>Pendente</strong> no Calendário.</span></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tema da avaliação *</Label>
                <div className="flex gap-2"><Input list="cronograma-evaluation-themes" value={theme} onChange={(event) => { setTheme(event.target.value); if (selectedQuestions.length) setSelectedQuestions([]); }} placeholder="Ex.: Procedimento de acesso" /><Button type="button" variant="outline" onClick={() => setQuestionPickerOpen(true)} title="Selecionar do Banco de Questões"><BookOpen className="h-4 w-4" /></Button></div>
                <datalist id="cronograma-evaluation-themes">{themeOptions.map((option) => <option key={option} value={option} />)}</datalist>
                {selectedQuestions.length > 0 && <p className="text-[11px] font-semibold text-amber-600">{selectedQuestions.length} questão(ões) vinculada(s) ao tema.</p>}
              </div>
              <div className="space-y-1.5"><Label>Data prevista *</Label><Input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Setor</Label><Select value={sector} onValueChange={(value) => { setSector(value); setSelectedIds([]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SECTORS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2">
              <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar colaborador..." /></div><Button variant="outline" onClick={toggleSector}><CheckCircle2 className="mr-2 h-3.5 w-3.5" style={{ color: allSectorSelected ? "#10b981" : "var(--text-4)" }} />{allSectorSelected ? "Desmarcar setor" : "Selecionar setor"}</Button></div>
              <div className="max-h-64 overflow-y-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>{employeesQuery.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : visibleEmployees.length === 0 ? <p className="py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>Nenhum colaborador ativo neste filtro.</p> : visibleEmployees.map((employee) => { const selected = selectedIds.includes(employee.id); return <button type="button" key={employee.id} onClick={() => toggle(employee.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" style={{ borderBottom: "1px solid var(--border-subtle)", background: selected ? "rgba(59,130,246,.06)" : "transparent" }}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: selected ? "#3b82f6" : "transparent", border: `1.5px solid ${selected ? "#3b82f6" : "var(--border)"}` }}>{selected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold" style={{ color: "var(--text-1)" }}>{employee.full_name}</span><span className="block text-[11px]" style={{ color: "var(--text-4)" }}>Mat. {employee.matricula} · {employee.sector}</span></span></button>; })}</div>
              <p className="text-[11px]" style={{ color: "var(--text-4)" }}>{selectedIds.length} colaborador(es) selecionado(s){month ? ` · ${formatMonth(month)}` : ""}</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={!valid || saving} className="bg-blue-600 text-white hover:bg-blue-700">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}Planejar {selectedIds.length || ""}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <QuestionBankPicker
        open={questionPickerOpen}
        onOpenChange={setQuestionPickerOpen}
        initialSelected={selectedQuestions.map((question) => question.id)}
        onConfirm={useQuestions}
      />
    </>
  );
}
