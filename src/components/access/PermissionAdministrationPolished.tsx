import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Loader2, RefreshCw, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "sonner";
import { isDemoModeAllowed } from "@/lib/demo-mode";
import {
  getAuthorizationCatalog,
  listAuthorizationUsers,
  updateAuthorizationUser,
  type AuthorizationUser,
  type PermissionDefinition,
} from "@/lib/backend/authorization-gateway";
import type { AccessLevel } from "@/lib/backend/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function groupPermissions(permissions: PermissionDefinition[]) {
  const groups = new Map<string, PermissionDefinition[]>();
  for (const permission of [...permissions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = groups.get(permission.group) ?? [];
    list.push(permission);
    groups.set(permission.group, list);
  }
  return [...groups.entries()];
}

function levelBadge(level: AccessLevel) {
  if (level === "master") return "Administrador Master";
  if (level === "admin") return "Administrador";
  if (level === "inspector") return "Inspetor";
  return "Operador";
}

function sortedPermissions(values: string[]) {
  return [...new Set(values)].sort();
}

function samePermissions(a: string[], b: string[]) {
  return sortedPermissions(a).join("|") === sortedPermissions(b).join("|");
}

function accountAvailable(user: AuthorizationUser) {
  return user.account_status === "Ativo" && (!user.employee_status || user.employee_status === "Ativo");
}

export function PermissionAdministrationPolished() {
  const queryClient = useQueryClient();
  const demoMode = isDemoModeAllowed();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<AccessLevel | "all">("all");
  const [editing, setEditing] = useState<AuthorizationUser | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<AccessLevel>("operator");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const catalogQuery = useQuery({
    queryKey: ["authorization-catalog"],
    queryFn: getAuthorizationCatalog,
  });
  const usersQuery = useQuery({
    queryKey: ["authorization-users"],
    queryFn: listAuthorizationUsers,
  });

  const catalog = catalogQuery.data;
  const users = usersQuery.data ?? [];
  const groupedPermissions = useMemo(() => groupPermissions(catalog?.permissions ?? []), [catalog?.permissions]);

  const filteredUsers = useMemo(() => {
    const query = normalizeSearch(search);
    return users.filter((user) => {
      if (levelFilter !== "all" && user.level !== levelFilter) return false;
      if (!query) return true;
      return [user.name, user.matricula, user.sector, user.level_label, levelBadge(user.level), user.account_status, user.employee_status]
        .some((value) => normalizeSearch(String(value ?? "")).includes(query));
    });
  }, [levelFilter, search, users]);

  const metrics = useMemo(() => ({
    total: users.length,
    privileged: users.filter((user) => user.level !== "operator").length,
    masters: users.filter((user) => user.level === "master").length,
    unavailable: users.filter((user) => !accountAvailable(user)).length,
  }), [users]);

  const updateMutation = useMutation({
    mutationFn: ({ userId, level, permissions }: { userId: string; level: AccessLevel; permissions: string[] }) =>
      updateAuthorizationUser(userId, { level, permissions }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["authorization-users"] });
      toast.success(demoMode
        ? "Permissões atualizadas na simulação isolada."
        : "Acesso atualizado. As sessões anteriores da conta foram revogadas.");
      setEditing(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar as permissões."),
  });

  const openEditor = (user: AuthorizationUser) => {
    if (user.is_self || !accountAvailable(user)) return;
    setEditing(user);
    setSelectedLevel(user.level);
    setSelectedPermissions([...user.permissions]);
  };

  const changeLevel = (level: AccessLevel) => {
    setSelectedLevel(level);
    if (!catalog) return;
    setSelectedPermissions([...(catalog.default_permissions[level] ?? [])]);
  };

  const restoreDefaults = () => {
    if (!catalog) return;
    setSelectedPermissions([...(catalog.default_permissions[selectedLevel] ?? [])]);
  };

  const togglePermission = (permission: PermissionDefinition, checked: boolean) => {
    if (selectedLevel === "master" || selectedLevel === "operator" || permission.masterOnly) return;
    setSelectedPermissions((current) => {
      const next = new Set(current);
      if (checked) next.add(permission.code);
      else next.delete(permission.code);
      return [...next];
    });
  };

  const effectiveSelection = catalog
    ? selectedLevel === "master"
      ? catalog.permissions.map((permission) => permission.code)
      : selectedLevel === "operator"
        ? []
        : selectedPermissions
    : selectedPermissions;
  const changed = Boolean(editing) && (
    editing?.level !== selectedLevel || !samePermissions(editing?.permissions ?? [], effectiveSelection)
  );
  const loading = catalogQuery.isLoading || usersQuery.isLoading;
  const failed = catalogQuery.isError || usersQuery.isError;

  const retry = async () => {
    await Promise.all([catalogQuery.refetch(), usersQuery.refetch()]);
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b bg-muted/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Níveis e permissões</CardTitle>
              </div>
              <CardDescription className="max-w-3xl">
                Administração de menor privilégio. O Master define o nível e as funções administrativas efetivas de cada conta sem compartilhar credenciais.
              </CardDescription>
            </div>
            {demoMode && <Badge variant="secondary">Simulação isolada</Badge>}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Contas", metrics.total, Users],
              ["Privilegiadas", metrics.privileged, UserCog],
              ["Masters", metrics.masters, ShieldCheck],
              ["Indisponíveis", metrics.unavailable, AlertTriangle],
            ].map(([label, value, Icon]) => {
              const MetricIcon = Icon as typeof Users;
              return (
                <div key={String(label)} className="rounded-xl border bg-background/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">{String(label)}</p>
                      <p className="mt-1 text-xl font-black">{String(value)}</p>
                    </div>
                    <MetricIcon className="h-4 w-4 text-primary" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            Alterações reais são auditadas no MySQL, incrementam a versão de sessão e revogam imediatamente sessões anteriores da conta alterada. A conta Master em uso permanece protegida contra alteração própria.
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Label htmlFor="authorization-search" className="sr-only">Buscar conta de acesso</Label>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="authorization-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, matrícula, setor ou nível…"
                className="pl-9"
              />
            </div>
            <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as AccessLevel | "all")}>
              <SelectTrigger aria-label="Filtrar por nível de acesso"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os níveis</SelectItem>
                <SelectItem value="master">Administrador Master</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="inspector">Inspetor</SelectItem>
                <SelectItem value="operator">Operador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando matriz de acesso…
            </div>
          )}

          {failed && (
            <div className="p-6 text-center">
              <p className="font-semibold text-destructive">Não foi possível carregar a matriz de acesso.</p>
              <p className="mt-1 text-sm text-muted-foreground">Verifique a disponibilidade da API SEGEMPAT e tente novamente.</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={retry}>
                <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
            </div>
          )}

          {!loading && !failed && (
            <div>
              <div className="border-b px-4 py-2 text-xs text-muted-foreground">
                {filteredUsers.length === users.length
                  ? `${users.length} conta(s) de acesso`
                  : `${filteredUsers.length} de ${users.length} conta(s) no filtro atual`}
              </div>
              <div className="divide-y">
                {filteredUsers.map((user) => {
                  const available = accountAvailable(user);
                  return (
                    <div key={user.user_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-semibold">{user.name}</p>
                          <Badge variant={user.level === "master" ? "default" : "outline"}>{user.level_label || levelBadge(user.level)}</Badge>
                          {user.is_self && <Badge variant="secondary">Conta atual · protegida</Badge>}
                          {!available && <Badge variant="destructive">Indisponível</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Mat. {user.matricula}{user.sector ? ` · ${user.sector}` : ""} · {user.permissions.length} permissão(ões) efetiva(s)
                        </p>
                        {!available && (
                          <p className="mt-1 text-[11px] text-destructive">
                            Conta: {user.account_status}{user.employee_status ? ` · Cadastro funcional: ${user.employee_status}` : ""}. Reative o cadastro antes de alterar privilégios.
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={user.is_self || !available}
                        onClick={() => openEditor(user)}
                        className="w-full shrink-0 sm:w-auto"
                      >
                        <UserCog className="mr-2 h-4 w-4" />
                        {user.is_self ? "Protegida" : available ? "Configurar acesso" : "Indisponível"}
                      </Button>
                    </div>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <div className="p-8 text-center">
                    <Search className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-3 font-semibold">Nenhuma conta encontrada.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Ajuste a busca ou o filtro de nível.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && !updateMutation.isPending && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Configurar acesso
            </DialogTitle>
            <DialogDescription>
              {editing ? `${editing.name} · Mat. ${editing.matricula}` : "Selecione o nível e as permissões."}
            </DialogDescription>
          </DialogHeader>

          {editing && catalog && (
            <div className="space-y-5 py-2">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-2">
                  <Label htmlFor="access-level">Nível de acesso</Label>
                  <Select value={selectedLevel} onValueChange={(value) => changeLevel(value as AccessLevel)}>
                    <SelectTrigger id="access-level"><SelectValue placeholder="Selecione o nível" /></SelectTrigger>
                    <SelectContent>
                      {catalog.levels.map((level) => <SelectItem key={level.code} value={level.code}>{level.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Trocar o nível carrega o conjunto padrão correspondente. Admin e Inspetor permitem ajustes finos antes de salvar.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={restoreDefaults} disabled={selectedLevel === "master" || selectedLevel === "operator"}>
                  Restaurar padrão do nível
                </Button>
              </div>

              {selectedLevel === "master" && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  Administrador Master recebe todas as permissões e pode administrar privilégios. O backend impede a remoção do último Master ativo.
                </div>
              )}
              {selectedLevel === "operator" && (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Operador não recebe permissões administrativas. O acesso permanece restrito aos fluxos operacionais destinados à própria conta.
                </div>
              )}

              <div className="space-y-4">
                {groupedPermissions.map(([group, permissions]) => (
                  <section key={group} className="rounded-xl border p-4" aria-labelledby={`permission-group-${group}`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p id={`permission-group-${group}`} className="text-sm font-bold">{group}</p>
                      <span className="text-[11px] text-muted-foreground">
                        {permissions.filter((permission) => selectedLevel === "master" || effectiveSelection.includes(permission.code)).length}/{permissions.length}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {permissions.map((permission) => {
                        const masterLocked = selectedLevel === "master";
                        const operatorLocked = selectedLevel === "operator";
                        const masterOnlyLocked = Boolean(permission.masterOnly) && selectedLevel !== "master";
                        const checked = selectedLevel === "master"
                          ? true
                          : selectedLevel === "operator"
                            ? false
                            : effectiveSelection.includes(permission.code);
                        return (
                          <label key={permission.code} className="flex items-start gap-3 rounded-lg border bg-muted/10 p-3 text-sm">
                            <Checkbox
                              checked={checked}
                              disabled={masterLocked || operatorLocked || masterOnlyLocked}
                              onCheckedChange={(value) => togglePermission(permission, value === true)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="block font-medium">{permission.label}</span>
                              <span className="mt-0.5 block break-all text-[11px] text-muted-foreground">{permission.code}</span>
                              {permission.masterOnly && <span className="mt-1 block text-[11px] font-semibold text-amber-600 dark:text-amber-400">Exclusiva do Administrador Master</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                Ao salvar, a alteração é registrada na auditoria e as sessões anteriores da conta são revogadas. O usuário deverá autenticar novamente com o novo conjunto de privilégios.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              type="button"
              disabled={!editing || !catalog || !changed || updateMutation.isPending}
              onClick={() => editing && updateMutation.mutate({ userId: editing.user_id, level: selectedLevel, permissions: effectiveSelection })}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {changed ? "Salvar e revogar sessões" : "Sem alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
