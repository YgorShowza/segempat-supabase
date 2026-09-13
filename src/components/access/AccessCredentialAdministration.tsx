import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, RefreshCw, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isDemoModeAllowed } from "@/lib/demo-mode";
import {
  generateActivationCode,
  generatePasswordResetCode,
  listActivationCodes,
  revokeActivationCode,
  revokePasswordResetCode,
  type ActivationCodeStatus,
} from "@/lib/backend/access-gateway";

type Mode = "activation" | "reset";

function formatDate(value?: string | null) {
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

export function AccessCredentialAdministration({ mode }: { mode: Mode }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const demoMode = isDemoModeAllowed();
  const access = useQuery({
    queryKey: ["activation-codes-status"],
    queryFn: listActivationCodes,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (access.data ?? [])
      .filter((row) => mode === "reset" ? row.has_account : !row.has_account)
      .filter((row) => !query || [row.employee_name, row.matricula, row.sector].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [access.data, mode, search]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["activation-codes-status"] });

  const generate = useMutation({
    mutationFn: async (row: ActivationCodeStatus) => mode === "reset"
      ? generatePasswordResetCode(row.employee_id)
      : generateActivationCode(row.employee_id),
    onSuccess: async (generated) => {
      await refresh();
      try {
        await navigator.clipboard.writeText(generated.code);
        toast.success(`Código ${generated.code} gerado e copiado. Entregue-o somente ao titular da matrícula.`);
      } catch {
        toast.success(`Código gerado: ${generated.code}. Copie e entregue somente ao titular da matrícula.`);
      }
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível gerar o código."),
  });

  const revoke = useMutation({
    mutationFn: async (row: ActivationCodeStatus) => {
      if (mode === "reset") await revokePasswordResetCode(row.employee_id);
      else await revokeActivationCode(row.employee_id);
      return row;
    },
    onSuccess: async (row) => {
      await refresh();
      toast.success(`Código de ${row.employee_name} revogado.`);
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível revogar o código."),
  });

  const title = mode === "reset" ? "Recuperação de senha" : "Primeiro acesso";
  const description = mode === "reset"
    ? "Emita ou revogue códigos temporários de recuperação somente para contas ativas."
    : "Emita ou revogue o código temporário usado na criação inicial da conta.";

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            {mode === "reset" ? <RotateCcw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {mode === "reset" && demoMode && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            A recuperação real de senha permanece desabilitada no modo demonstração isolado.
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, matrícula ou setor…" className="pl-9" />
        </div>

        {access.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando acessos…</p>}
        {access.isError && (
          <div className="py-6 text-center">
            <p className="text-sm text-destructive">Não foi possível carregar os acessos.</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => access.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        )}

        {!access.isLoading && !access.isError && (
          <div className="divide-y rounded-xl border">
            {rows.map((row) => {
              const live = mode === "reset"
                ? Boolean(row.reset_expires_at && !row.reset_used_at && !row.reset_expired && !row.reset_locked_at)
                : Boolean(row.expires_at && !row.used_at && !row.expired);
              const hasRecord = mode === "reset"
                ? Boolean(row.reset_expires_at && !row.reset_used_at)
                : Boolean(row.expires_at && !row.used_at);
              const expiresAt = mode === "reset" ? row.reset_expires_at : row.expires_at;
              const busy = generate.isPending || revoke.isPending;
              return (
                <div key={row.employee_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="truncate text-sm font-semibold">{row.employee_name}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Mat. {row.matricula} · {row.sector}</p>
                    {hasRecord && (
                      <p className={`mt-1 text-[11px] ${live ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                        {live ? `Código válido até ${formatDate(expiresAt)}` : "Código expirado, utilizado ou bloqueado"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {hasRecord && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || (mode === "reset" && demoMode)}
                        onClick={() => confirm(`Revogar o código de ${row.employee_name}?`) && revoke.mutate(row)}
                      >
                        Revogar
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || (mode === "reset" && demoMode) || (mode === "reset" && row.account_active === false)}
                      onClick={() => {
                        if (live && !confirm("Gerar um novo código invalidará o código atual. Continuar?")) return;
                        generate.mutate(row);
                      }}
                    >
                      {mode === "reset" ? <RotateCcw className="mr-2 h-4 w-4" /> : <KeyRound className="mr-2 h-4 w-4" />}
                      {hasRecord ? "Gerar novo" : "Gerar código"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conta compatível encontrada.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
