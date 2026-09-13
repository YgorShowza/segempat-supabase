import { Link, createFileRoute } from "@tanstack/react-router";
import { History, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { AccessActivationAdmin } from "@/components/access/AccessActivationAdmin";
import { AccessCredentialAdministration } from "@/components/access/AccessCredentialAdministration";
import { PermissionAdministrationPolished } from "@/components/access/PermissionAdministrationPolished";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";

function ScopeCard({ icon: Icon, title, description, enabled }: { icon: typeof KeyRound; title: string; description: string; enabled: boolean }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl p-2" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <p className="font-bold" style={{ color: "var(--text-1)" }}>{title}</p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>{description}</p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[.08em]"
          style={{
            background: enabled ? "rgba(16,185,129,.1)" : "var(--bg-surface-3)",
            color: enabled ? "#10b981" : "var(--text-4)",
          }}
        >
          {enabled ? "Disponível" : "Sem permissão"}
        </span>
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

  return (
    <div className="segempat-governance-access mx-auto w-full max-w-[1536px] space-y-6 pb-10">
      <section className="rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/40"><ShieldCheck className="h-4 w-4" /> Governança de identidade</div>
            <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Acessos e privilégios</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Primeiro acesso, recuperação segura de senha e autorização por menor privilégio. Cada capacidade administrativa é separada e validada novamente no backend.
            </p>
          </div>
          {canAudit && (
            <Link
              to="/auditoria"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              <History className="mr-2 h-4 w-4" /> Abrir auditoria
            </Link>
          )}
        </div>
      </section>

      <section aria-label="Escopo de governança disponível" className="grid gap-3 md:grid-cols-3">
        <ScopeCard icon={KeyRound} title="Primeiro acesso" description="Emissão e revogação do código temporário para criação inicial da conta." enabled={canIdentity} />
        <ScopeCard icon={KeyRound} title="Recuperação de senha" description="Emissão hierárquica de código temporário para contas já existentes e ativas." enabled={canReset} />
        <ScopeCard icon={UserCog} title="Níveis e permissões" description="Gestão Master de nível, privilégios efetivos e revogação imediata de sessões." enabled={canManagePermissions} />
      </section>

      <div className="rounded-xl border px-4 py-3 text-xs leading-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-4)" }}>
        O SEGEMPAT não trata essas funções como um único “perfil de administrador”. Identidade, recuperação, auditoria e gestão de privilégios possuem permissões próprias; o backend permanece como fonte de verdade.
      </div>

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
