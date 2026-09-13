import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, FileSpreadsheet, FileText, Plus, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CronogramaAnnualGeneratorV2 } from "@/components/cronograma/CronogramaAnnualGeneratorV2";
import { CronogramaImportResults } from "@/components/cronograma/CronogramaImportResults";
import { CronogramaPdfExports } from "@/components/cronograma/CronogramaPdfExports";
import { CronogramaPracticalActions } from "@/components/cronograma/CronogramaPracticalActions";

/**
 * Composição visual: agrupa as ações administrativas já existentes do Cronograma
 * dentro do próprio cabeçalho (sem recriar lógica de nenhuma delas).
 */
export function CronogramaHeaderActions() {
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  return (
    <>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
        <Button
          asChild
          className="h-10 w-full font-bold sm:w-auto"
          style={{ background: "linear-gradient(135deg,#f0c400,#ffd700)", color: "#111", boxShadow: "0 6px 18px rgba(200,160,0,.28)" }}
        >
          <Link to="/cronograma-gestao" search={{ novo: true }}>
            <Plus className="mr-2 h-4 w-4" /> Novo registro
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10 w-full font-bold sm:w-auto" style={{ borderColor: "var(--border)", background: "var(--bg-surface-2)" }}>
              Mais ações <ChevronDown className="ml-2 h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => setPdfOpen(true)}>
              <FileText className="mr-2 h-4 w-4 text-[#C8102E]" />
              <span className="font-semibold">Relatórios PDF</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setImportOpen(true)}>
              <FileSpreadsheet className="mr-2 h-4 w-4 text-blue-500" />
              <span className="font-semibold">Importar resultados</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setGeneratorOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4 text-amber-500" />
              <span className="font-semibold">Gerar planejamento anual</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <CronogramaPracticalActions asSubmenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/cronograma-gestao">
                <Settings2 className="mr-2 h-4 w-4 text-emerald-500" />
                <span className="font-semibold">Gerenciar registros</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CronogramaAnnualGeneratorV2 open={generatorOpen} onOpenChange={setGeneratorOpen} />
      <CronogramaImportResults open={importOpen} onOpenChange={setImportOpen} />
      <CronogramaPdfExports open={pdfOpen} onOpenChange={setPdfOpen} />
    </>
  );
}
