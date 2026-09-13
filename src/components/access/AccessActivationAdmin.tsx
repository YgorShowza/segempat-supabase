import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, RefreshCw, RotateCcw, Search, ShieldCheck, XCircle, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isDemoModeAllowed } from "@/lib/demo-mode";
import {
  generateActivationCode,
  generatePasswordResetCode,
  listActivationCodes,
  revokeActivationCode,
  revokePasswordResetCode,
  type ActivationCodeStatus,
  type GeneratedAccess,
} from "@/lib/backend/access-gateway";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
      }}
    >
      {children}
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function accessState(row: ActivationCodeStatus) {
  if (row.has_account) return { label: "ACESSO CRIADO", color: "#10b981", bg: "rgba(16,185,129,.10)" };
  if (row.used_at) return { label: "CÓDIGO UTILIZADO", color: "#3b82f6", bg: "rgba(59,130,246,.10)" };
  if (row.expires_at && row.expired) return { label: "CÓDIGO EXPIRADO", color: "#ef4444", bg: "rgba(239,68,68,.10)" };
  if (row.expires_at) return { label: "CÓDIGO ATIVO", color: "#f59e0b", bg: "rgba(245,158,11,.10)" };
  return { label: "SEM CÓDIGO", color: "var(--text-4)", bg: "var(--bg-surface-3)" };
}

type GeneratedCredential = {
  kind: "activation" | "reset";
  data: GeneratedAccess;
};

export function AccessActivationAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [generated, setGenerated] = useState<GeneratedCredential | null>(null);
  const [copied, setCopied] = useState(false);
  const recoveryUnavailableInDemo = isDemoModeAllowed();

  const access = useQuery({
    queryKey: ["activation-codes-status"],
    queryFn: listActivationCodes,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (access.data ?? []).filter((row) =>
      !q || [row.employee_name, row.matricula, row.sector].some((value) => (value || "").toLowerCase().includes(q)),
    );
  }, [access.data, search]);

  const metrics = useMemo(() => {
    const all = access.data ?? [];
    return {
      accounts: all.filter((row) => row.has_account).length,
      activeCodes: all.filter((row) => !row.has_account && !row.used_at && Boolean(row.expires_at) && !row.expired).length,
      attention: all.filter((row) => !row.has_account && (!row.expires_at || row.expired)).length,
    };
  }, [access.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["activation-codes-status"] });

  const generate = useMutation({
    mutationFn: async (row: ActivationCodeStatus) => generateActivationCode(row.employee_id),
    onSuccess: async (data) => {
      setCopied(false);
      setGenerated({ kind: "activation", data });
      await refresh();
      toast.success("Código de primeiro acesso gerado");
    },
    onError: (error: Error) => {
      const message = error.message.toLowerCase();
      toast.error(
        message.includes("já possui acesso")
          ? "Esta matrícula já possui acesso cadastrado"
          : error.message || "Não foi possível gerar o código",
      );
    },
  });

  const revoke = useMutation({
    mutationFn: async (row: ActivationCodeStatus) => {
      await revokeActivationCode(row.employee_id);
      return row;
    },
    onSuccess: async (row) => {
      await refresh();
      toast.success(`Código de ${row.employee_name} revogado`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generateReset = useMutation({
    mutationFn: async (row: ActivationCodeStatus) => generatePasswordResetCode(row.employee_id),
    onSuccess: async (data) => {
      setCopied(false);
      setGenerated({ kind: "reset", data });
      await refresh();
      toast.success("Código seguro de recuperação gerado");
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível gerar o código de recuperação"),
  });

  const revokeReset = useMutation({
    mutationFn: async (row: ActivationCodeStatus) => {
      await revokePasswordResetCode(row.employee_id);
      return row;
    },
    onSuccess: async (row) => {
      await refresh();
      toast.success(`Recuperação de senha de ${row.employee_name} revogada`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyCode = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.data.code);
      setCopied(true);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar automaticamente");
    }
  };

  if (access.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-9 w-9 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} />
      </div>
    );
  }

  if (access.isError) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <XCircle className="mx-auto h-10 w-10 text-red-500" />
        <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar os acessos.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Tente novamente. Se o problema persistir, verifique a API de acesso.</p>
        <Button className="mt-4" variant="outline" onClick={() => access.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <section className="rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/40"><ShieldCheck className="h-4 w-4" /> Controle de identidade</div>
        <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Primeiro acesso</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/50">Acompanhe o ciclo completo do acesso e, para contas já criadas, emita uma recuperação segura de senha quando necessário.</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Acessos criados</p><p className="mt-2 text-2xl font-black text-emerald-500">{metrics.accounts}</p></div><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Códigos ativos</p><p className="mt-2 text-2xl font-black text-amber-500">{metrics.activeCodes}</p></div><Clock3 className="h-5 w-5 text-amber-500" /></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Sem acesso / expirado</p><p className="mt-2 text-2xl font-black text-red-500">{metrics.attention}</p></div><AlertTriangle className="h-5 w-5 text-red-500" /></div></Card>
      </div>

      <Card className="p-4">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, matrícula ou setor..." className="pl-10" /></div>
      </Card>

      <div className="space-y-3">
        {rows.map((row) => {
          const state = accessState(row);
          const canRevoke = Boolean(row.expires_at && !row.has_account && !row.used_at);
          const hasLiveCode = Boolean(row.expires_at && !row.expired && !row.used_at && !row.has_account);
          const hasResetRecord = Boolean(row.reset_expires_at && !row.reset_used_at);
          const hasLiveReset = Boolean(hasResetRecord && !row.reset_expired && !row.reset_locked_at);
          const resetBusy = generateReset.isPending || revokeReset.isPending;
          const resetAllowed = row.password_reset_allowed !== false;
          const resetBlockReason = row.password_reset_block_reason || null;
          const resetActionTitle = recoveryUnavailableInDemo
            ? "Disponível no ambiente corporativo conectado à API SEGEMPAT"
            : !resetAllowed
              ? resetBlockReason || "Seu nível não possui autoridade para recuperar esta conta."
              : undefined;

          return (
            <Card key={row.employee_id} className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold" style={{ color: "var(--text-1)" }}>{row.employee_name}</p>
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ background: state.bg, color: state.color }}>{state.label}</span>
                    {row.has_account && row.access_level_label && (
                      <span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>
                        {row.access_level_label.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Mat. {row.matricula} · {row.sector}</p>
                  {row.expires_at && !row.has_account && !row.used_at && (
                    <p className="mt-1 text-[11px]" style={{ color: row.expired ? "#ef4444" : "var(--text-4)" }}>{row.expired ? "Expirou" : "Válido até"} {formatDateTime(row.expires_at)}</p>
                  )}
                  {row.has_account && <p className="mt-1 text-[11px] text-emerald-500">A matrícula já possui credencial cadastrada no SEGEMPAT.</p>}
                  {row.has_account && !resetAllowed && resetBlockReason && !recoveryUnavailableInDemo && (
                    <p className="mt-1 text-[11px] text-amber-500">{resetBlockReason}</p>
                  )}
                  {row.has_account && hasResetRecord && (
                    <p className="mt-1 text-[11px]" style={{ color: row.reset_locked_at || row.reset_expired ? "#ef4444" : "#f59e0b" }}>
                      {row.reset_locked_at ? "Recuperação bloqueada por tentativas incorretas" : row.reset_expired ? "Código de recuperação expirado" : `Recuperação válida até ${formatDateTime(row.reset_expires_at)}`}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  {row.has_account ? (
                    <>
                      {hasResetRecord ? (
                        <Button
                          variant="outline"
                          onClick={() => { if (confirm(`Revogar a recuperação de senha de ${row.employee_name}?`)) revokeReset.mutate(row); }}
                          disabled={resetBusy || recoveryUnavailableInDemo || !resetAllowed}
                          title={resetActionTitle}
                        >
                          Revogar
                        </Button>
                      ) : <span />}
                      <Button
                        onClick={() => {
                          if (hasLiveReset && !confirm("Gerar um novo código invalidará o código de recuperação atual. Continuar?")) return;
                          generateReset.mutate(row);
                        }}
                        disabled={resetBusy || recoveryUnavailableInDemo || row.account_active === false || !resetAllowed}
                        title={resetActionTitle}
                        className="bg-[#C8102E] font-bold text-white hover:bg-[#A00D24] disabled:bg-[var(--bg-surface-3)] disabled:text-[var(--text-4)]"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" /> {hasResetRecord ? "Gerar novo" : "Redefinir senha"}
                      </Button>
                    </>
                  ) : (
                    <>
                      {canRevoke ? (
                        <Button variant="outline" onClick={() => { if (confirm(`Revogar o código de ${row.employee_name}?`)) revoke.mutate(row); }} disabled={revoke.isPending || generate.isPending}>Revogar</Button>
                      ) : <span />}
                      <Button
                        onClick={() => {
                          if (hasLiveCode && !confirm("Gerar um novo código invalidará o código atual. Continuar?")) return;
                          generate.mutate(row);
                        }}
                        disabled={generate.isPending || revoke.isPending}
                        className="bg-[#C8102E] font-bold text-white hover:bg-[#A00D24] disabled:bg-[var(--bg-surface-3)] disabled:text-[var(--text-4)]"
                      >
                        <KeyRound className="mr-2 h-4 w-4" /> {row.expires_at ? "Gerar novo" : "Gerar código"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {!rows.length && <Card className="p-10 text-center"><KeyRound className="mx-auto h-10 w-10 opacity-30" style={{ color: "var(--text-4)" }} /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhum colaborador ativo encontrado.</p></Card>}
      </div>

      <Dialog open={!!generated} onOpenChange={(open) => { if (!open) { setGenerated(null); setCopied(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{generated?.kind === "reset" ? "Código de recuperação de senha" : "Código de primeiro acesso"}</DialogTitle></DialogHeader>
          {generated && (
            <div className="space-y-4">
              <div><p className="font-bold" style={{ color: "var(--text-1)" }}>{generated.data.employee_name}</p><p className="text-xs" style={{ color: "var(--text-4)" }}>Matrícula {generated.data.matricula}</p></div>
              <div className="rounded-2xl p-5 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
                <p className="text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "var(--text-4)" }}>{generated.kind === "reset" ? "Código de recuperação" : "Código temporário"}</p>
                <p className="mt-2 text-3xl font-black tracking-[.24em]" style={{ color: "var(--accent)" }}>{generated.data.code}</p>
                <p className="mt-3 text-xs" style={{ color: "var(--text-4)" }}>Válido até {formatDateTime(generated.data.expires_at)}</p>
              </div>
              <Button onClick={copyCode} className="w-full" variant="outline">{copied ? <Check className="mr-2 h-4 w-4 text-emerald-500" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? "Código copiado" : "Copiar código"}</Button>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>
                {generated.kind === "reset"
                  ? "Compartilhe somente com o titular da matrícula. O código é de uso único, expira em 30 minutos, é armazenado apenas como hash e bloqueia após cinco tentativas incorretas."
                  : "Compartilhe apenas com o titular da matrícula. O código é de uso único, expira em 24 horas e não é armazenado em texto puro no banco."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
