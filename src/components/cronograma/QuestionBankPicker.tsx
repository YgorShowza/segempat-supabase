import { useMemo, useState } from "react";
import { BookOpen, Check, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listQuestionBank, questionThemeLabel, type QuestionBankItem } from "@/lib/question-bank";

export function QuestionBankPicker({ open, onOpenChange, onConfirm, initialSelected = [] }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (items: QuestionBankItem[]) => void; initialSelected?: string[] }) {
  const { data: all = [], isLoading } = useQuery({ queryKey: ["question-bank-admin"], queryFn: listQuestionBank, enabled: open });
  const data = useMemo(() => all.filter((item) => item.active), [all]);
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("Todos");
  const [difficulty, setDifficulty] = useState("Todos");
  const [selected, setSelected] = useState<string[]>(initialSelected);

  const sectors = useMemo(() => ["Todos", ...Array.from(new Set(data.map((item) => item.target_sector).filter(Boolean))).sort()], [data]);
  const difficulties = useMemo(() => ["Todos", ...Array.from(new Set(data.map((item) => item.difficulty).filter(Boolean))).sort()], [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((item) => {
      if (sector !== "Todos" && item.target_sector !== sector && item.target_sector !== "Todos") return false;
      if (difficulty !== "Todos" && item.difficulty !== difficulty) return false;
      if (!q) return true;
      return [item.question_text, item.theme, item.bank_type, item.target_sector].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [data, search, sector, difficulty]);

  const close = () => {
    setSearch("");
    setSector("Todos");
    setDifficulty("Todos");
    setSelected(initialSelected);
    onOpenChange(false);
  };

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const confirm = () => {
    onConfirm(data.filter((item) => selected.includes(item.id)));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-amber-500" /> Banco de Questões</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar questão, tema ou banco..." /></div>
          <Select value={sector} onValueChange={setSector}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sectors.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={difficulty} onValueChange={setDifficulty}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{difficulties.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="mt-4 max-h-[58vh] overflow-y-auto rounded-2xl" style={{ border: "1px solid var(--border)" }}>
          {isLoading ? <p className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>Carregando banco de questões...</p> : filtered.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>Nenhuma questão encontrada.</p> : filtered.map((item) => {
            const active = selected.includes(item.id);
            return <button type="button" key={item.id} onClick={() => toggle(item.id)} className="flex w-full gap-3 px-4 py-3 text-left" style={{ borderBottom: "1px solid var(--border-subtle)", background: active ? "rgba(200,160,0,.07)" : "transparent" }}><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: active ? "#C8A000" : "transparent", border: `1.5px solid ${active ? "#C8A000" : "var(--border)"}` }}>{active && <Check className="h-3.5 w-3.5 text-black" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold" style={{ color: "var(--text-1)" }}>{item.question_text}</span><span className="mt-1 block text-[11px]" style={{ color: "var(--text-4)" }}>{questionThemeLabel(item)} · {item.target_sector} · {item.difficulty} · {item.bank_type}</span></span></button>;
          })}
        </div>
        <DialogFooter><span className="mr-auto self-center text-xs" style={{ color: "var(--text-4)" }}>{selected.length} selecionada(s)</span><Button variant="outline" onClick={close}>Cancelar</Button><Button onClick={confirm} disabled={!selected.length} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">Usar questões</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
