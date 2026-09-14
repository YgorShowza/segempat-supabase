import { Link, createFileRoute } from "@tanstack/react-router";
import { History, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { AccessActivationAdmin } from "@/components/access/AccessActivationAdmin";
import { AccessCredentialAdministration } from "@/components/access/AccessCredentialAdministration";
import { PermissionAdministrationPolished } from "@/components/access/PermissionAdministrationPolished";
import { SystemPageHero, SystemSectionHeader, SystemSurface } from "@/components/system/SystemUI";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";

function ScopeCard({ icon: Icon, title, description, enabled }: { icon: typeof KeyRound; title: string; description: string; enabled: boolean }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: enabled ? "var(--accent-soft)" : "var(--bg-surface-3)", color: enabled ? "var(--accent)" : "var(--text-4)" }}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{title}</p>
            <span
              className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black"
              style={{ background: enabled ? "rgba(16,185,129,.10)" : "var(--bg-surface-3)", color: enabled ? "#10b981" : "var(--text-4)" }}
            >
              {enabled ? "Disponível" : "Sem permissão"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>{description}</p>
        </div>
      </div>
    </div>
  );
}

function AccessPage() {
  const { data: user } = useCurrentUser();
  const canIdentity = hasPermission(user, "access.identity.manage");
  const canReset = hasPermission(user, "access.password_reset");
  const canManagePermissions = hasPermission(user, "access.permissions.manage");
  const canAudit = hasPermission(user, "audit.view");
  const availableCapabilities = [canIdentity, canReset, canManagePermissions].filter(Boolean).length;

  return (
    <div className="segempat-governance-access mx-auto w-full max-w-[1536px] space-y-5 pb-10">
      <SystemPageHero
        icon={ShieldCheck}
        eyebrow="Governança de identidade"
        title="Acessos e privilégios"
        description="Controle de primeiro acesso, recuperação segura e autorização por menor privilégio. As capacidades administrativas continuam independentes e validadas novamente no backend."
        actions={canAudit ? (
          <Link
            to="/auditoria"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <History className="mr-2 h-4 w-4" /> Abrir auditoria
          </Link>
        ) : undefined}
      />

      <SystemSurface className="overflow-hidden">
        <SystemSectionHeader
          icon={KeyRound}
          title="Escopo de governança"
          description="Visão resumida das capacidades liberadas para a conta atual."
          action={
            <span className="hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black sm:block" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              {availableCapabilities}/3 disponíveis
            </span>
          }
        />
        <div aria-label="Escopo de governança disponível" className="grid gap-3 p-4 md:grid-cols-3 lg:p-5">
          <ScopeCard icon={KeyRound} title="Primeiro acesso" description="Emissão e revogação do código temporário para criação inicial da conta." enabled={canIdentity} />
          <ScopeCard icon={KeyRound} title="Recuperação de senha" description="Emissão hierárquica de código temporário para contas já existentes e ativas." enabled={canReset} />
          <ScopeCard icon={UserCog} title="Níveis e permissões" description="Gestão Master de nível, privilégios efetivos e revogação imediata de sessões." enabled={canManagePermissions} />
        </div>
        <div className="border-t px-4 py-3 text-xs leading-5 lg:px-5" style={{ borderColor: "var(--border)", color: "var(--text-4)" }}>
          O SEGEMPAT não trata essas funções como um único “perfil de administrador”. Identidade, recuperação, auditoria e gestão de privilégios possuem permissões próprias; o backend permanece como fonte de verdade.
        </div>
      </SystemSurface>

      {canIdentity && canReset ? (
        <AccessActivationAdmin />
      ) : (
        <>
          {canIdentity && <AccessCredentialAdministration mode="activation" />}
          {canReset && <AccessCredentialAdministration mode="reset" />}
        </>
      )}

      {canManagePermissions && <PermissionAdministrationPolished />}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/acessos")({
  head: () => ({ meta: [{ title: "Acessos · SEGEMPAT" }] }),
  component: AccessPage,
});
