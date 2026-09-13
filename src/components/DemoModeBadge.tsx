import { ArrowLeftRight, FlaskConical, X } from "lucide-react";
import { disableDemoMode, enableDemoMode, getDemoRole, isDemoModeEnabled } from "@/lib/demo-mode";

export function DemoModeBadge() {
  if (!isDemoModeEnabled()) return null;

  const role = getDemoRole() ?? "inspector";
  const isOperator = role === "operator";

  const exitDemo = () => {
    disableDemoMode();
    window.location.assign("/");
  };

  const switchProfile = () => {
    const nextRole = isOperator ? "inspector" : "operator";
    enableDemoMode(nextRole);
    window.location.assign(nextRole === "operator" ? "/painel" : "/admin");
  };

  return (
    <div
      className="relative z-20 mb-4 flex w-full flex-wrap items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-[10px] font-black shadow-md sm:w-auto sm:text-[11px] md:fixed md:right-5 md:top-[72px] md:mb-0 md:flex-nowrap md:justify-start md:text-left md:shadow-lg"
      style={{
        background: "#fff7ed",
        border: "1px solid #f59e0b",
        color: "#9a3412",
      }}
      title="Os dados desta sessão são fictícios e não são gravados no MySQL corporativo"
    >
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span className="leading-4">MODO DEMONSTRAÇÃO · {isOperator ? "OPERADOR" : "INSPETOR"} · DADOS FICTÍCIOS</span>
      <button
        type="button"
        onClick={switchProfile}
        className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-[9px] font-black md:h-6 md:text-[10px]"
        style={{ background: "rgba(154,52,18,.08)", border: "1px solid rgba(154,52,18,.20)" }}
        aria-label={isOperator ? "Trocar para demonstração do Inspetor" : "Trocar para demonstração do Operador"}
        title={isOperator ? "Ver como Inspetor" : "Ver como Operador"}
      >
        <ArrowLeftRight className="h-3 w-3" />
        {isOperator ? "Ver Inspetor" : "Ver Operador"}
      </button>
      <button
        type="button"
        onClick={exitDemo}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md md:h-5 md:w-5"
        aria-label="Encerrar modo demonstração"
        title="Encerrar demonstração"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
