import { useState } from "react";
import { CalendarDays, ChevronDown, ClipboardList, Repeat2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CronogramaPlanEvaluation } from "@/components/cronograma/CronogramaPlanEvaluation";
import { CronogramaGeneratePractical } from "@/components/cronograma/CronogramaGeneratePractical";
import { PracticalTemplateManager } from "@/components/practical/PracticalTemplateManager";

/**
 * asSubmenu: renderiza os mesmos itens dentro de um submenu, para reaproveitar
 * as ações práticas no dropdown "Ações" do cabeçalho do Cronograma.
 */
export function CronogramaPracticalActions({ asSubmenu = false }: { asSubmenu?: boolean }) {
  const [planOpen, setPlanOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const items = (
    <>
      <DropdownMenuItem onSelect={() => setPlanOpen(true)}>
        <CalendarDays className="mr-2 h-4 w-4 text-blue-500" />
        <div><p className="font-semibold">Planejar em lote</p><p className="text-[10px] opacity-60">Agendar tema para vários colaboradores</p></div>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setModelsOpen(true)}>
        <Settings2 className="mr-2 h-4 w-4 text-amber-500" />
        <div><p className="font-semibold">Gerenciar modelos</p><p className="text-[10px] opacity-60">Tarefas, recorrência, setor e nota mínima</p></div>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setGenerateOpen(true)}>
        <Repeat2 className="mr-2 h-4 w-4 text-emerald-500" />
        <div><p className="font-semibold">Gerar recorrentes</p><p className="text-[10px] opacity-60">Criar pendências anuais a partir dos modelos</p></div>
      </DropdownMenuItem>
    </>
  );

  const dialogs = (
    <>
      <CronogramaPlanEvaluation open={planOpen} onOpenChange={setPlanOpen} />
      <PracticalTemplateManager open={modelsOpen} onOpenChange={setModelsOpen} />
      <CronogramaGeneratePractical open={generateOpen} onOpenChange={setGenerateOpen} />
    </>
  );

  if (asSubmenu) {
    return (
      <>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ClipboardList className="mr-2 h-4 w-4 text-[#C8102E]" />
            <span className="font-semibold">Avaliação Prática</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">{items}</DropdownMenuSubContent>
        </DropdownMenuSub>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full shadow-sm sm:w-auto">
            <ClipboardList className="mr-2 h-4 w-4" />
            Avaliação Prática
            <ChevronDown className="ml-2 h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">{items}</DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
