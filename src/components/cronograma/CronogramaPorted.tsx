import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { syncCronogramaWithExamAttempts } from "@/lib/cronograma";
import { invalidateCronogramaFlow } from "@/lib/operational-query-sync";
import { CronogramaSourcePolished } from "@/components/cronograma/CronogramaSourcePolished";
import { CronogramaHeaderActions } from "@/components/cronograma/CronogramaHeaderActions";
import "@/operational-desktop.css";

export function CronogramaPorted() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.isAdmin) return;

    let active = true;
    void syncCronogramaWithExamAttempts()
      .then((changed) => {
        if (!active || changed <= 0) return;
        return invalidateCronogramaFlow(queryClient);
      })
      .catch((error) => {
        // A tela continua disponível mesmo se a sincronização automática falhar;
        // a falha será visível nos dados e pode ser repetida no próximo acesso.
        console.error("Falha ao sincronizar Cronograma com provas concluídas", error);
      });

    return () => {
      active = false;
      // Qualquer alteração feita dentro do Cronograma deve ser refletida nos
      // dashboards, relatórios, análise individual, risco e telas do operador
      // assim que o usuário sair deste módulo.
      void invalidateCronogramaFlow(queryClient);
    };
  }, [queryClient, user?.isAdmin]);

  return (
    <div className="segempat-operational-cronograma relative">
      <CronogramaSourcePolished actions={user?.isAdmin ? <CronogramaHeaderActions /> : undefined} />
    </div>
  );
}
