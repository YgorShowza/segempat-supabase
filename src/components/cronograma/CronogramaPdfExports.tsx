import { useState } from "react";
import { ClipboardCheck, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentMonthStr, listCronogramaEntries } from "@/lib/cronograma";
import { listEmployees } from "@/lib/employees";
import { exportCronogramaAttendancePdf, exportCronogramaDetailedPdf } from "@/lib/cronograma-pdf-client";

export function CronogramaPdfExports({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [month, setMonth] = useState(currentMonthStr());
  const [loading, setLoading] = useState<"detailed" | "attendance" | null>(null);

  const close = () => {
    if (loading) return;
    onOpenChange(false);
  };

  const exportDetailed = async () => {
    if (!month) return toast.error("Selecione o mês.");
    setLoading("detailed");
    try {
      const [entries, employees] = await Promise.all([listCronogramaEntries(month), listEmployees()]);
      await exportCronogramaDetailedPdf(entries, employees, month);
      toast.success("PDF detalhado gerado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setLoading(null);
    }
  };

  const exportAttendance = async () => {
    if (!month) return toast.error("Selecione o mês.");
    setLoading("attendance");
    try {
      const entries = await listCronogramaEntries(month);
      if (!entries.length) return toast.error("Não há lançamentos neste mês para gerar a lista de presença.");
      await exportCronogramaAttendancePdf(entries, month);
      toast.success("Lista de presença gerada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a lista de presença.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-[#C8102E]" /> Relatórios do Cronograma</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mês de referência</Label>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={exportDetailed} disabled={!!loading} className="rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-60" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(200,16,46,.09)" }}><FileText className="h-5 w-5 text-[#C8102E]" /></div>
              <p className="mt-3 text-sm font-black" style={{ color: "var(--text-1)" }}>PDF detalhado</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>Cronograma mensal por setor, colaborador, matrícula, tema, data, status e justificativa.</p>
              {loading === "detailed" && <Loader2 className="mt-3 h-4 w-4 animate-spin text-[#C8102E]" />}
            </button>
            <button type="button" onClick={exportAttendance} disabled={!!loading} className="rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-60" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(16,185,129,.09)" }}><ClipboardCheck className="h-5 w-5 text-emerald-500" /></div>
              <p className="mt-3 text-sm font-black" style={{ color: "var(--text-1)" }}>Lista de presença</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>Documento operacional com campos de responsável, assinatura e checklist de presença.</p>
              {loading === "attendance" && <Loader2 className="mt-3 h-4 w-4 animate-spin text-emerald-500" />}
            </button>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={close} disabled={!!loading}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
