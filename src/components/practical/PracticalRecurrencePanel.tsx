import { useState } from "react";
import { CalendarPlus, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { operationalMonth } from "@/lib/operational-time";
import { invalidateCronogramaFlow } from "@/lib/operational-query-sync";
import { generatePracticalEvaluationsMonth } from "@/lib/practical-generation";
import {
  listPracticalEvalTemplates,
  updatePracticalEvalTemplate,
  type PracticalEvalTemplate,
} from "@/lib/practical-templates";

const RECURRENCE_LABEL: Record<string, string> = {
  once: "Única vez",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
};

export function PracticalRecurrencePanel() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManagePractical = hasPermission(user, "practical.manage");
  const [month, setMonth] = useState(operationalMonth());
  const [applicationDrafts, setApplicationDrafts] = useState<Record<string, number>>({});

  const templatesQuery = useQuery({
    queryKey: ["practical-eval-templates"],
    queryFn: listPracticalEvalTemplates,
    enabled: canManagePractical,
  });
  const activeTemplates = (templatesQuery.data ?? []).filter((template) => template.status === "Ativo");

  const saveApplications = useMutation({
    mutationFn: async ({ template, applications }: { template: PracticalEvalTemplate; applications: number }) => {
      if (!canManagePractical) throw new Error("Seu nível de acesso não permite gerenciar avaliações práticas");
      const normalized = Math.max(1, Math.min(31, Math.trunc(applications)));
      await updatePracticalEvalTemplate(template.id, { applications_per_month: normalized });
      return { id: template.id, applications: normalized };
    },
    onSuccess: async ({ id, applications }) => {
      setApplicationDrafts((current) => ({ ...current, [id]: applications }));
      await qc.invalidateQueries({ queryKey: ["practical-eval-templates"] });
      toast.success("Quantidade mensal atualizada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generate = useMutation({
    mutationFn: () => {
      if (!canManagePractical) throw new Error("Seu nível de acesso não permite gerar avaliações práticas");
      return generatePracticalEvaluationsMonth(month);
    },
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["practical-evaluations"] }),
        invalidateCronogramaFlow(qc),
      ]);
      if (result.created > 0) {
        const suspended = result.suspended > 0
          ? ` ${result.suspended} aplicação(ões) não encontrou(aram) data livre por suspensão/ausência.`
          : "";
        toast.success(`${result.created} avaliação(ões) prática(s) gerada(s) e sincronizada(s) com o Cronograma.${suspended}`);
        return;
      }
      toast.info(
        result.skipped > 0
          ? `Nenhuma nova avaliação gerada. ${result.skipped} aplicação(ões) já existia(m) para o período.`
          : "Nenhum modelo recorrente é devido para o mês selecionado.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canManagePractical) return null;

  return (
    <section
      className="w-full rounded-2xl p-4 md:p-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
      aria-label="Geração recorrente de avaliações práticas"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#C8102E]" />
            <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>
              Geração recorrente
            </p>
            {!templatesQuery.isLoading && !templatesQuery.isError && (
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide"
                style={{ background: "rgba(200,16,46,.08)", color: "#C8102E" }}
              >
                {activeTemplates.length} modelo(s) ativo(s)
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
            Gere as aplicações previstas pelos modelos ativos para o mês selecionado. O servidor distribui as datas, respeita suspensões e ausências, sincroniza cada avaliação com o Cronograma e evita duplicar os mesmos slots.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="sm:w-44"
            aria-label="Mês de geração das avaliações práticas"
          />
          <Button
            onClick={() => generate.mutate()}
            disabled={!month || generate.isPending || templatesQuery.isLoading || templatesQuery.isError || activeTemplates.length === 0}
            className="bg-[#C8102E] font-bold text-white hover:bg-[#A00D24]"
          >
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
            {generate.isPending ? "Gerando..." : "Gerar recorrências"}
          </Button>
        </div>
      </div>

      {templatesQuery.isLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl p-3 text-xs font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)" }} role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin text-[#C8102E]" /> Carregando modelos recorrentes...
        </div>
      ) : templatesQuery.isError ? (
        <div
          className="mt-4 flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.18)" }}
          role="alert"
        >
          <div>
            <p className="text-xs font-bold text-red-500">Não foi possível carregar os modelos recorrentes.</p>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>
              A geração fica indisponível até que a consulta seja restabelecida.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => templatesQuery.refetch()} disabled={templatesQuery.isFetching}>
            <RotateCcw className={`mr-2 h-3.5 w-3.5 ${templatesQuery.isFetching ? "animate-spin" : ""}`} />
            Tentar novamente
          </Button>
        </div>
      ) : activeTemplates.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {activeTemplates.map((template) => {
            const applications = applicationDrafts[template.id] ?? Number(template.applications_per_month || 1);
            const isOnce = template.recurrence === "once";
            const savingThis = saveApplications.isPending && saveApplications.variables?.template.id === template.id;
            return (
              <div
                key={template.id}
                className="flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-center"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs font-black" style={{ color: "var(--text-1)" }}>
                    {template.title}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold" style={{ color: "var(--text-4)" }}>
                    {template.target_sector} · {RECURRENCE_LABEL[template.recurrence] ?? template.recurrence}
                  </p>
                </div>
                {isOnce ? (
                  <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
                    1 aplicação
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
                      Aplicações/mês
                    </span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={applications}
                      onChange={(event) =>
                        setApplicationDrafts((current) => ({
                          ...current,
                          [template.id]: Math.max(1, Math.min(31, Number(event.target.value) || 1)),
                        }))
                      }
                      className="h-8 w-16 text-center text-xs"
                      aria-label={`Aplicações mensais de ${template.title}`}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={saveApplications.isPending || applications === Number(template.applications_per_month || 1)}
                      onClick={() => saveApplications.mutate({ template, applications })}
                      aria-label={`Salvar aplicações mensais de ${template.title}`}
                      title={`Salvar aplicações mensais de ${template.title}`}
                    >
                      {savingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-bold" style={{ color: "var(--text-2)" }}>
            Nenhum modelo ativo para gerar.
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: "var(--text-4)" }}>
            Cadastre ou ative um modelo em “Modelos” antes de executar a geração recorrente.
          </p>
        </div>
      )}
    </section>
  );
}
