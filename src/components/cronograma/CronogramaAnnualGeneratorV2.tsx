import { useMemo, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Search, Sparkles, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuestionBankPicker } from "@/components/cronograma/QuestionBankPicker";
import { listEmployees, type Employee } from "@/lib/employees";
import { listCronogramaEntriesByYear, type CronogramaEntryInput } from "@/lib/cronograma";
import { createCronogramaEntriesAtomic } from "@/lib/cronograma-atomic";
import { questionThemeLabel, type QuestionBankItem } from "@/lib/question-bank";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type ThemeItem = { label: string; questionIds: string[] };
type Draft = CronogramaEntryInput & { _key: string };

export function CronogramaAnnualGeneratorV2({ open, onOpenChange, onGenerated }: { open: boolean; onOpenChange: (open: boolean) => void; onGenerated?: (year: number) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [months, setMonths] = useState<number[]>(Array.from({ length: 12 }, (_, index) => index));
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [themeInput, setThemeInput] = useState("");
  const [questionPickerOpen, setQuestionPickerOpen] = useState(false);
  const [defaultDay, setDefaultDay] = useState(15);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  const employeeQuery = useQuery({ queryKey: ["employees"], queryFn: listEmployees, enabled: open });
  const existingQuery = useQuery({ queryKey: ["cronograma-year", year], queryFn: () => listCronogramaEntriesByYear(year), enabled: open });

  const activeEmployees = useMemo(() => (employeeQuery.data ?? []).filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor"), [employeeQuery.data]);
  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return activeEmployees.filter((employee) => !query || employee.full_name.toLowerCase().includes(query) || employee.matricula.toLowerCase().includes(query) || employee.sector.toLowerCase().includes(query));
  }, [activeEmployees, employeeSearch]);
  const groupedEmployees = useMemo(() => {
    const map = new Map<string, Employee[]>();
    filteredEmployees.forEach((employee) => map.set(employee.sector || "Outros", [...(map.get(employee.sector || "Outros") ?? []), employee]));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredEmployees]);

  const reset = () => {
    setStep(1);
    setYear(new Date().getFullYear());
    setMonths(Array.from({ length: 12 }, (_, index) => index));
    setSelectedEmployees([]);
    setEmployeeSearch("");
    setThemes([]);
    setThemeInput("");
    setQuestionPickerOpen(false);
    setDefaultDay(15);
    setDrafts([]);
    setSaving(false);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 120);
  };

  const toggleMonth = (index: number) => setMonths((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b));
  const toggleEmployee = (id: string) => setSelectedEmployees((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleSector = (rows: Employee[]) => {
    const ids = rows.map((employee) => employee.id);
    const allSelected = ids.every((id) => selectedEmployees.includes(id));
    setSelectedEmployees((current) => allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
  };

  const addTheme = (label: string, questionIds: string[] = []) => {
    const clean = label.trim();
    if (!clean) return;
    setThemes((current) => {
      const existing = current.find((theme) => theme.label.toLowerCase() === clean.toLowerCase());
      if (!existing) return [...current, { label: clean, questionIds }];
      return current.map((theme) => theme === existing ? { ...theme, questionIds: Array.from(new Set([...theme.questionIds, ...questionIds])) } : theme);
    });
  };

  const addManualTheme = () => {
    addTheme(themeInput);
    setThemeInput("");
  };

  const useQuestions = (items: QuestionBankItem[]) => {
    const grouped = new Map<string, string[]>();
    items.forEach((item) => {
      const label = questionThemeLabel(item);
      grouped.set(label, [...(grouped.get(label) ?? []), item.id]);
    });
    grouped.forEach((ids, label) => addTheme(label, ids));
  };

  const generateDrafts = () => {
    if (!months.length || !selectedEmployees.length || !themes.length) return;
    const existing = new Set((existingQuery.data ?? []).map((entry) => `${entry.employee_id}|${entry.theme.trim().toLowerCase()}|${entry.month}`));
    const next: Draft[] = [];
    for (const employeeId of selectedEmployees) {
      const employee = activeEmployees.find((item) => item.id === employeeId);
      if (!employee) continue;
      for (const monthIndex of months) {
        const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        const maxDay = new Date(year, monthIndex + 1, 0).getDate();
        const day = Math.min(Math.max(defaultDay, 1), maxDay);
        for (const theme of themes) {
          const key = `${employee.id}|${theme.label.trim().toLowerCase()}|${month}`;
          if (existing.has(key)) continue;
          next.push({
            _key: `${key}|${next.length}`,
            month,
            employee_id: employee.id,
            employee_name: employee.full_name,
            employee_matricula: employee.matricula,
            employee_sector: employee.sector,
            theme: theme.label,
            type: "Planejado",
            status: "Pendente",
            planned_date: `${month}-${String(day).padStart(2, "0")}`,
            completion_date: null,
            notes: null,
            question_bank_ids: theme.questionIds,
          });
        }
      }
    }
    setDrafts(next);
    setStep(4);
    if (!next.length) toast.info("Todos os lançamentos selecionados já existem.");
  };

  const save = async () => {
    if (!drafts.length) return;
    setSaving(true);
    try {
      await createCronogramaEntriesAtomic(drafts.map(({ _key, ...row }) => row));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cronograma-year", year] }),
        qc.invalidateQueries({ queryKey: ["cronograma-parity-year", year] }),
      ]);
      toast.success(`${drafts.length} lançamento(s) do cronograma anual criado(s).`);
      onGenerated?.(year);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o cronograma anual. Nenhum lançamento foi criado.");
    } finally {
      setSaving(false);
    }
  };

  const canNext = step === 1 ? months.length > 0 : step === 2 ? selectedEmployees.length > 0 : step === 3 ? themes.length > 0 : drafts.length > 0;
  const totalProjected = months.length * selectedEmployees.length * themes.length;

  return <>
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> Gerador de Cronograma Anual</DialogTitle></DialogHeader>

        <div className="grid grid-cols-4 gap-2">{["Mês & Ano", "Colaboradores", "Temas", "Revisar"].map((label, index) => { const number = index + 1; const active = step === number; const done = step > number; return <div key={label} className="text-center"><div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: done ? "#10b981" : active ? "linear-gradient(135deg,#f0c400,#ffd700)" : "var(--bg-surface-2)", color: done ? "white" : active ? "#111" : "var(--text-4)", border: "1px solid var(--border)" }}>{done ? <Check className="h-4 w-4" /> : number}</div><p className="mt-1 text-[10px] font-black uppercase tracking-wide" style={{ color: active ? "#c59b00" : "var(--text-4)" }}>{label}</p></div>; })}</div>

        {step === 1 && <div className="space-y-5 py-2">
          <div><Label>Ano</Label><div className="mt-2 flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setYear((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><Input className="w-32 text-center font-black" type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || new Date().getFullYear())} /><Button variant="outline" size="icon" onClick={() => setYear((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
          <div><div className="flex items-center justify-between"><Label>Meses ({months.length})</Label><div className="flex gap-2"><button className="text-xs font-bold" style={{ color: "var(--accent)" }} onClick={() => setMonths(Array.from({ length: 12 }, (_, index) => index))}>Todos</button><button className="text-xs font-bold" style={{ color: "var(--text-4)" }} onClick={() => setMonths([])}>Nenhum</button></div></div><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">{MONTHS.map((label, index) => <button type="button" key={label} onClick={() => toggleMonth(index)} className="h-11 rounded-xl text-sm font-bold" style={months.includes(index) ? { background: "linear-gradient(135deg,#f0c400,#ffd700)", color: "#111", border: "1px solid #d2a800" } : { background: "var(--bg-surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>{label}</button>)}</div></div>
          <div><Label>Dia padrão</Label><Input className="mt-2 w-28" type="number" min={1} max={31} value={defaultDay} onChange={(event) => setDefaultDay(Number(event.target.value) || 1)} /><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Se o mês não possuir esse dia, será usado o último dia válido.</p></div>
        </div>}

        {step === 2 && <div className="space-y-3 py-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input className="pl-10" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Buscar por nome, matrícula ou setor..." /></div><div className="flex justify-between text-xs"><span style={{ color: "var(--text-4)" }}>{selectedEmployees.length} selecionado(s)</span><button className="font-bold" style={{ color: "var(--accent)" }} onClick={() => setSelectedEmployees(selectedEmployees.length === activeEmployees.length ? [] : activeEmployees.map((employee) => employee.id))}>{selectedEmployees.length === activeEmployees.length ? "Desmarcar todos" : "Selecionar todos"}</button></div><div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">{groupedEmployees.map(([sector, rows]) => <div key={sector} className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}><button type="button" className="flex w-full justify-between px-3 py-2 text-xs font-black" style={{ background: "var(--bg-surface-2)", color: "var(--text-2)" }} onClick={() => toggleSector(rows)}><span>{sector}</span><span>{rows.filter((employee) => selectedEmployees.includes(employee.id)).length}/{rows.length}</span></button><div className="grid sm:grid-cols-2">{rows.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-3 p-3" style={{ borderTop: "1px solid var(--border-subtle)", background: selectedEmployees.includes(employee.id) ? "var(--accent-soft)" : "transparent" }}><input type="checkbox" checked={selectedEmployees.includes(employee.id)} onChange={() => toggleEmployee(employee.id)} /><span><span className="block text-sm font-semibold" style={{ color: "var(--text-1)" }}>{employee.full_name}</span><span className="block text-[11px]" style={{ color: "var(--text-4)" }}>Mat. {employee.matricula}</span></span></label>)}</div></div>)}</div></div>}

        {step === 3 && <div className="space-y-4 py-2">
          <div><Label>Temas de treinamento</Label><div className="mt-2 flex flex-wrap gap-2"><Input className="min-w-[220px] flex-1" value={themeInput} onChange={(event) => setThemeInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualTheme(); } }} placeholder="Ex.: Controle de acesso" /><Button variant="outline" onClick={addManualTheme}>Adicionar</Button><Button type="button" variant="outline" onClick={() => setQuestionPickerOpen(true)}><BookOpen className="mr-2 h-4 w-4" /> Banco de Questões</Button></div></div>
          <div className="flex flex-wrap gap-2">{themes.map((theme) => <span key={theme.label} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid rgba(200,16,46,.18)" }}>{theme.label}{theme.questionIds.length > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: "rgba(200,160,0,.15)", color: "#a47d00" }}>{theme.questionIds.length} q.</span>}<button type="button" onClick={() => setThemes((current) => current.filter((item) => item.label !== theme.label))}><Trash2 className="h-3.5 w-3.5" /></button></span>)}</div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}><p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Projeção</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{months.length} mês(es) × {selectedEmployees.length} colaborador(es) × {themes.length} tema(s)</p><p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{totalProjected} registros</p></div>
        </div>}

        {step === 4 && <div className="space-y-3 py-2"><div className="flex items-center justify-between"><div><p className="font-black" style={{ color: "var(--text-1)" }}>Revisão antes de gravar</p><p className="text-xs" style={{ color: "var(--text-4)" }}>Registros já existentes para o mesmo colaborador, tema e mês foram removidos automaticamente.</p></div><span className="text-sm font-black" style={{ color: "var(--accent)" }}>{drafts.length} novos</span></div><div className="max-h-[48vh] overflow-y-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>{drafts.length === 0 ? <div className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>Nenhum registro novo para gerar.</div> : drafts.map((draft) => <div key={draft._key} className="grid gap-2 px-3 py-3 md:grid-cols-[1fr_1fr_150px_40px] md:items-center" style={{ borderBottom: "1px solid var(--border-subtle)" }}><div><p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{draft.employee_name}</p><p className="text-[11px]" style={{ color: "var(--text-4)" }}>{draft.employee_matricula} · {draft.employee_sector}</p></div><div><p className="text-sm" style={{ color: "var(--text-2)" }}>{draft.theme}</p>{(draft.question_bank_ids?.length ?? 0) > 0 && <p className="text-[10px] text-amber-600">{draft.question_bank_ids?.length} questão(ões) vinculada(s)</p>}</div><Input type="date" value={draft.planned_date || ""} onChange={(event) => setDrafts((current) => current.map((item) => item._key === draft._key ? { ...item, planned_date: event.target.value } : item))} /><Button size="icon" variant="ghost" className="text-red-500" onClick={() => setDrafts((current) => current.filter((item) => item._key !== draft._key))}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div>}

        <DialogFooter className="gap-2"><Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button>{step > 1 && <Button variant="outline" onClick={() => setStep((value) => value - 1)} disabled={saving}>Voltar</Button>}{step < 3 && <Button onClick={() => setStep((value) => value + 1)} disabled={!canNext}>Avançar</Button>}{step === 3 && <Button onClick={generateDrafts} disabled={!canNext}>Revisar geração</Button>}{step === 4 && <Button onClick={save} disabled={!drafts.length || saving} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">{saving ? "Gerando..." : `Gerar ${drafts.length} registros`}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>

    <QuestionBankPicker open={questionPickerOpen} onOpenChange={setQuestionPickerOpen} onConfirm={useQuestions} />
  </>;
}