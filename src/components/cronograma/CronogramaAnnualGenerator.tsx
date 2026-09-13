import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Search, Sparkles, Users, BookOpen, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listEmployees, type Employee } from "@/lib/employees";
import { createCronogramaEntries, listCronogramaEntriesByYear, type CronogramaEntryInput } from "@/lib/cronograma";
import { isSegempatApiConfigured } from "@/lib/backend/api-client";
import { operationalYear } from "@/lib/operational-time";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MYSQL_ATOMIC_LIMIT = 1000;

type Draft = CronogramaEntryInput & { _key: string };

export function CronogramaAnnualGenerator({ open, onOpenChange, onGenerated }: { open: boolean; onOpenChange: (open: boolean) => void; onGenerated?: (year: number) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [year, setYear] = useState(operationalYear());
  const [months, setMonths] = useState<number[]>(Array.from({ length: 12 }, (_, i) => i));
  const [employees, setEmployees] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [themes, setThemes] = useState<string[]>([]);
  const [themeInput, setThemeInput] = useState("");
  const [defaultDay, setDefaultDay] = useState(15);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  const employeeQuery = useQuery({ queryKey: ["employees"], queryFn: listEmployees, enabled: open });
  const existingQuery = useQuery({ queryKey: ["cronograma-year", year], queryFn: () => listCronogramaEntriesByYear(year), enabled: open });

  const activeEmployees = useMemo(
    () => (employeeQuery.data ?? []).filter((e) => e.status === "Ativo" && e.access_profile !== "Inspetor"),
    [employeeQuery.data],
  );

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return activeEmployees.filter((e) => !q || e.full_name.toLowerCase().includes(q) || e.matricula.includes(q) || e.sector.toLowerCase().includes(q));
  }, [activeEmployees, employeeSearch]);

  const groupedEmployees = useMemo(() => {
    const groups = new Map<string, Employee[]>();
    filteredEmployees.forEach((e) => {
      const key = e.sector || "Outros";
      groups.set(key, [...(groups.get(key) ?? []), e]);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredEmployees]);

  const reset = () => {
    setStep(1);
    setYear(operationalYear());
    setMonths(Array.from({ length: 12 }, (_, i) => i));
    setEmployees([]);
    setEmployeeSearch("");
    setThemes([]);
    setThemeInput("");
    setDefaultDay(15);
    setDrafts([]);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 150);
  };

  const toggleMonth = (idx: number) => setMonths((prev) => prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a, b) => a - b));
  const toggleEmployee = (id: string) => setEmployees((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleSector = (rows: Employee[]) => {
    const ids = rows.map((e) => e.id);
    const allSelected = ids.every((id) => employees.includes(id));
    setEmployees((prev) => allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])));
  };
  const addTheme = () => {
    const value = themeInput.trim();
    if (!value) return;
    if (!themes.some((t) => t.toLowerCase() === value.toLowerCase())) setThemes((prev) => [...prev, value]);
    setThemeInput("");
  };

  const generateDrafts = () => {
    if (!months.length || !employees.length || !themes.length) return;
    const existing = new Set((existingQuery.data ?? []).map((e) => `${e.employee_id}|${e.theme.trim().toLowerCase()}|${e.month}`));
    const next: Draft[] = [];
    for (const employeeId of employees) {
      const emp = activeEmployees.find((e) => e.id === employeeId);
      if (!emp) continue;
      for (const monthIndex of months) {
        const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        const maxDay = new Date(year, monthIndex + 1, 0).getDate();
        const plannedDay = Math.min(Math.max(defaultDay, 1), maxDay);
        for (const theme of themes) {
          const key = `${employeeId}|${theme.trim().toLowerCase()}|${month}`;
          if (existing.has(key)) continue;
          next.push({
            _key: `${key}|${next.length}`,
            month,
            employee_id: emp.id,
            employee_name: emp.full_name,
            employee_matricula: emp.matricula,
            employee_sector: emp.sector,
            theme,
            type: "Planejado",
            status: "Pendente",
            planned_date: `${month}-${String(plannedDay).padStart(2, "0")}`,
            completion_date: null,
            notes: null,
          });
        }
      }
    }
    setDrafts(next);
    setStep(4);
    if (!next.length) toast.info("Todos os lançamentos selecionados já existem.");
  };

  const apiMode = isSegempatApiConfigured();
  const exceedsAtomicLimit = apiMode && drafts.length > MYSQL_ATOMIC_LIMIT;

  const save = async () => {
    if (!drafts.length || exceedsAtomicLimit) {
      if (exceedsAtomicLimit) toast.error(`A geração possui ${drafts.length} registros. No MySQL, reduza para no máximo ${MYSQL_ATOMIC_LIMIT} para manter a operação atômica.`);
      return;
    }
    setSaving(true);
    try {
      const payload = drafts.map(({ _key, ...row }) => row);
      if (apiMode) {
        await createCronogramaEntries(payload);
      } else {
        for (let i = 0; i < payload.length; i += 100) {
          await createCronogramaEntries(payload.slice(i, i + 100));
        }
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cronograma-year", year] }),
        qc.invalidateQueries({ queryKey: ["cronograma-parity-year", year] }),
      ]);
      toast.success(`${drafts.length} lançamento(s) do cronograma anual criado(s).`);
      onGenerated?.(year);
      close();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o cronograma anual.");
    } finally {
      setSaving(false);
    }
  };

  const canNext = step === 1 ? months.length > 0 : step === 2 ? employees.length > 0 : step === 3 ? themes.length > 0 : drafts.length > 0;
  const totalProjected = months.length * employees.length * themes.length;

  return <Dialog open={open} onOpenChange={(v) => v ? onOpenChange(true) : close()}>
    <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /> Gerador de Cronograma Anual</DialogTitle></DialogHeader>

      <div className="grid grid-cols-4 gap-2">
        {["Mês & Ano", "Colaboradores", "Temas", "Revisar"].map((label, index) => {
          const n = index + 1; const active = step === n; const done = step > n;
          return <div key={label} className="text-center"><div className="mx-auto w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm" style={{ background: done ? "#10b981" : active ? "linear-gradient(135deg,#f0c400,#ffd700)" : "var(--bg-surface-2)", color: done ? "white" : active ? "#111" : "var(--text-4)", border: "1px solid var(--border)" }}>{done ? <Check className="w-4 h-4" /> : n}</div><p className="mt-1 text-[10px] font-black uppercase tracking-wide" style={{ color: active ? "#c59b00" : "var(--text-4)" }}>{label}</p></div>;
        })}
      </div>

      {step === 1 && <div className="space-y-5 py-2">
        <div><Label>Ano</Label><div className="mt-2 flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="w-4 h-4" /></Button><Input className="w-32 text-center font-black" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || operationalYear())} /><Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}><ChevronRight className="w-4 h-4" /></Button></div></div>
        <div><div className="flex items-center justify-between"><Label>Meses ({months.length})</Label><div className="flex gap-2"><button className="text-xs font-bold" style={{color:"var(--accent)"}} onClick={() => setMonths(Array.from({length:12},(_,i)=>i))}>Todos</button><button className="text-xs font-bold" style={{color:"var(--text-4)"}} onClick={() => setMonths([])}>Nenhum</button></div></div><div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">{MONTHS.map((m,i) => <button key={m} onClick={() => toggleMonth(i)} className="h-11 rounded-xl font-bold text-sm" style={months.includes(i) ? {background:"linear-gradient(135deg,#f0c400,#ffd700)",color:"#111",border:"1px solid #d2a800"}:{background:"var(--bg-surface-2)",color:"var(--text-3)",border:"1px solid var(--border)"}}>{m}</button>)}</div></div>
        <div><Label>Dia padrão</Label><Input className="mt-2 w-28" type="number" min={1} max={31} value={defaultDay} onChange={(e) => setDefaultDay(Number(e.target.value) || 1)} /><p className="mt-1 text-xs" style={{color:"var(--text-4)"}}>Se o mês não possuir esse dia, será usado o último dia válido.</p></div>
      </div>}

      {step === 2 && <div className="space-y-3 py-2"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{color:"var(--text-4)"}} /><Input className="pl-10" value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} placeholder="Buscar por nome, matrícula ou setor..." /></div><div className="flex justify-between text-xs"><span style={{color:"var(--text-4)"}}>{employees.length} selecionado(s)</span><button className="font-bold" style={{color:"var(--accent)"}} onClick={() => setEmployees(employees.length === activeEmployees.length ? [] : activeEmployees.map((e) => e.id))}>{employees.length === activeEmployees.length ? "Desmarcar todos" : "Selecionar todos"}</button></div><div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">{groupedEmployees.map(([sector, rows]) => <div key={sector} className="rounded-xl overflow-hidden" style={{border:"1px solid var(--border)"}}><button className="w-full px-3 py-2 flex justify-between text-xs font-black" style={{background:"var(--bg-surface-2)",color:"var(--text-2)"}} onClick={() => toggleSector(rows)}><span>{sector}</span><span>{rows.filter((e)=>employees.includes(e.id)).length}/{rows.length}</span></button><div className="grid sm:grid-cols-2">{rows.map((e) => <label key={e.id} className="flex items-center gap-3 p-3 cursor-pointer" style={{borderTop:"1px solid var(--border-subtle)",background:employees.includes(e.id)?"var(--accent-soft)":"transparent"}}><input type="checkbox" checked={employees.includes(e.id)} onChange={() => toggleEmployee(e.id)} /><span><span className="block text-sm font-semibold" style={{color:"var(--text-1)"}}>{e.full_name}</span><span className="block text-[11px]" style={{color:"var(--text-4)"}}>Mat. {e.matricula}</span></span></label>)}</div></div>)}</div></div>}

      {step === 3 && <div className="space-y-4 py-2"><div><Label>Temas de treinamento</Label><div className="mt-2 flex gap-2"><Input value={themeInput} onChange={(e) => setThemeInput(e.target.value)} onKeyDown={(e) => {if(e.key==="Enter"){e.preventDefault();addTheme();}}} placeholder="Ex.: Controle de acesso" /><Button variant="outline" onClick={addTheme}><BookOpen className="w-4 h-4 mr-2" /> Adicionar</Button></div></div><div className="flex flex-wrap gap-2">{themes.map((t) => <span key={t} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold" style={{background:"var(--accent-soft)",color:"var(--accent)",border:"1px solid rgba(200,16,46,.18)"}}>{t}<button onClick={() => setThemes((p)=>p.filter((x)=>x!==t))}><Trash2 className="w-3.5 h-3.5" /></button></span>)}</div><div className="rounded-xl p-4" style={{background:"var(--bg-surface-2)",border:"1px solid var(--border)"}}><p className="text-sm font-bold" style={{color:"var(--text-1)"}}>Projeção</p><p className="mt-1 text-xs" style={{color:"var(--text-4)"}}>{months.length} mês(es) × {employees.length} colaborador(es) × {themes.length} tema(s)</p><p className="mt-2 text-2xl font-black" style={{color:"var(--text-1)"}}>{totalProjected} registros</p></div></div>}

      {step === 4 && <div className="space-y-3 py-2"><div className="flex items-center justify-between"><div><p className="font-black" style={{color:"var(--text-1)"}}>Revisão antes de gravar</p><p className="text-xs" style={{color:"var(--text-4)"}}>Registros já existentes para o mesmo colaborador, tema e mês foram removidos automaticamente.</p></div><span className="text-sm font-black" style={{color:"var(--accent)"}}>{drafts.length} novos</span></div>{exceedsAtomicLimit&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Há {drafts.length} registros. Em modo MySQL, reduza o escopo para no máximo {MYSQL_ATOMIC_LIMIT} por geração para impedir gravação parcial.</div>}<div className="max-h-[48vh] overflow-y-auto rounded-xl" style={{border:"1px solid var(--border)"}}>{drafts.length===0?<div className="p-8 text-center text-sm" style={{color:"var(--text-4)"}}>Nenhum registro novo para gerar.</div>:drafts.map((d) => <div key={d._key} className="px-3 py-3 grid gap-2 md:grid-cols-[1fr_1fr_130px_40px] md:items-center" style={{borderBottom:"1px solid var(--border-subtle)"}}><div><p className="text-sm font-bold" style={{color:"var(--text-1)"}}>{d.employee_name}</p><p className="text-[11px]" style={{color:"var(--text-4)"}}>{d.employee_matricula} · {d.employee_sector}</p></div><div><p className="text-sm" style={{color:"var(--text-2)"}}>{d.theme}</p><p className="text-[11px]" style={{color:"var(--text-4)"}}>{d.month}</p></div><Input type="date" value={d.planned_date || ""} onChange={(e) => setDrafts((prev)=>prev.map((x)=>x._key===d._key?{...x,planned_date:e.target.value||null}:x))} /><Button size="icon" variant="ghost" className="text-red-500" onClick={() => setDrafts((p)=>p.filter((x)=>x._key!==d._key))}><Trash2 className="w-4 h-4" /></Button></div>)}</div></div>}

      <DialogFooter className="flex sm:justify-between gap-2"><div className="flex gap-2">{step > 1 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Voltar</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={close}>Cancelar</Button>{step < 3 && <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continuar <ChevronRight className="w-4 h-4 ml-1" /></Button>}{step === 3 && <Button disabled={!canNext || existingQuery.isLoading} onClick={generateDrafts}><Eye className="w-4 h-4 mr-2" /> Revisar</Button>}{step === 4 && <Button disabled={!drafts.length || saving || exceedsAtomicLimit} onClick={save} className="bg-[#C8102E] hover:bg-[#A00D24] text-white">{saving ? "Gerando..." : `Gerar ${drafts.length} registro(s)`}</Button>}</div></DialogFooter>
    </DialogContent>
  </Dialog>;
}