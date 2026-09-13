import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck, UserCog } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export function PermissionAdministration() {
  const queryClient = useQueryClient();
  const demoMode = isDemoModeAllowed();
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
  const groupedPermissions = useMemo(
    () => groupPermissions(catalog?.permissions ?? []),
    [catalog?.permissions],
  );

  const updateMutation = useMutation({
    mutationFn: ({ userId, level, permissions }: { userId: string; level: AccessLevel; permissions: string[] }) =>
      updateAuthorizationUser(userId, { level, permissions }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["authorization-users"] });
      toast.success(demoMode ? "Permissões atualizadas na simulação isolada." : "Nível e permissões atualizados. As sessões anteriores da conta foram invalidadas.");
      setEditing(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar as permissões."),
  });

  const openEditor = (user: AuthorizationUser) => {
    if (user.is_self) return;
    setEditing(user);
    setSelectedLevel(user.level);
    setSelectedPermissions([...user.permissions]);
  };

  const changeLevel = (level: AccessLevel) => {
    setSelectedLevel(level);
    if (!catalog) return;
    setSelectedPermissions([...(catalog.default_permissions[level] ?? [])]);
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

  const loading = catalogQuery.isLoading || usersQuery.isLoading;
  const failed = catalogQuery.isError || usersQuery.isError;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="gap-3 border-b bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Níveis e permissões</CardTitle>
              </div>
              <CardDescription>
                Controle de menor privilégio. O Administrador Master define o nível e exatamente quais funções administrativas cada conta pode executar.
              </CardDescription>
            </div>
            {demoMode && <Badge variant="secondary">Simulação isolada</Badge>}
          </div>
          <div className="rounded-lg border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            Alterações reais são auditadas no MySQL e incrementam a versão de sessão da conta, revogando imediatamente sessões anteriores. A conta Master em uso não pode alterar a si própria por esta tela.
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando controles de acesso…
            </div>
          )}

          {failed && (
            <div className="p-5 text-sm text-destructive">
              Não foi possível carregar a matriz de acesso. Atualize a página ou verifique a disponibilidade da API SEGEMPAT.
            </div>
          )}

          {!loading && !failed && (
            <div className="divide-y">
              {(usersQuery.data ?? []).map((user) => (
                <div key={user.user_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{user.name}</p>
                      <Badge variant={user.level === "master" ? "default" : "outline"}>{user.level_label || levelBadge(user.level)}</Badge>
                      {user.is_self && <Badge variant="secondary">Conta atual · protegida</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mat. {user.matricula}{user.sector ? ` · ${user.sector}` : ""} · {user.permissions.length} permissão(ões)
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={user.is_self}
                    onClick={() => openEditor(user)}
                    className="shrink-0"
                  >
                    <UserCog className="mr-2 h-4 w-4" />
                    {user.is_self ? "Protegida" : "Configurar"}
                  </Button>
                </div>
              ))}
              {(usersQuery.data ?? []).length === 0 && (
                <div className="p-5 text-sm text-muted-foreground">Nenhuma conta de acesso encontrada.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && !updateMutation.isPending && setEditing(null)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
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
              <div className="space-y-2">
                <Label htmlFor="access-level">Nível de acesso</Label>
                <Select value={selectedLevel} onValueChange={(value) => changeLevel(value as AccessLevel)}>
                  <SelectTrigger id="access-level">
                    <SelectValue placeholder="Selecione o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.levels.map((level) => (
                      <SelectItem key={level.code} value={level.code}>{level.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ao trocar o nível, o SEGEMPAT carrega o conjunto padrão de menor privilégio. Você pode ajustar as permissões antes de salvar.
                </p>
              </div>

              <div className="space-y-4">
                {groupedPermissions.map(([group, permissions]) => (
                  <div key={group} className="rounded-xl border p-4">
                    <p className="mb-3 text-sm font-bold">{group}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {permissions.map((permission) => {
                        const masterLocked = selectedLevel === "master";
                        const operatorLocked = selectedLevel === "operator";
                        const masterOnlyLocked = Boolean(permission.masterOnly) && selectedLevel !== "master";
                        const checked = selectedLevel === "master"
                          ? true
                          : selectedLevel === "operator"
                            ? false
                            : selectedPermissions.includes(permission.code);
                        return (
                          <label
                            key={permission.code}
                            className="flex items-start gap-3 rounded-lg border bg-muted/10 p-3 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={masterLocked || operatorLocked || masterOnlyLocked}
                              onCheckedChange={(value) => togglePermission(permission, value === true)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="block font-medium">{permission.label}</span>
                              {permission.masterOnly && <span className="mt-0.5 block text-[11px] text-muted-foreground">Exclusiva do Administrador Master</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!editing || !catalog || updateMutation.isPending}
              onClick={() => editing && updateMutation.mutate({
                userId: editing.user_id,
                level: selectedLevel,
                permissions: selectedPermissions,
              })}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nível e permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
