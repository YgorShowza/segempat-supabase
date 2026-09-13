import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, KeyRound, LockKeyhole, Pencil, Plus, Radio, RefreshCw, Search, ShieldCheck, Trash2, UserRoundCog, Users, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { canAccessAdminPath, hasPermission } from "@/lib/access-control";
import { invalidateEmployeeFlow } from "@/lib/operational-query-sync";
import {
  PERFIS,
  SETORES,
  SITUACOES,
  createEmployee,
  deleteEmployee,
  emptyEmployeeForm,
  listEmployees,
  updateEmployee,
  type Employee,
  type EmployeeForm,
} from "@/lib/employees";

function Surface({ children, className = "", style, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      {...props}
      className={`rounded-2xl ${className}`}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function MetricCard({ label, value, icon: Icon, accent, sub }: { label: string; value: number | string; icon: typeof Users; accent: string; sub: string }) {
  return (
    <Surface className="relative min-h-[118px] overflow-hidden p-4 xl:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-1 text-[11px] font-semibold" style={{ color: accent }}>{sub}</p></div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}><Icon className="h-4 w-4" style={{ color: accent }} /></div>
      </div>
    </Surface>
  );
}

function employeeAccent(employee: Employee) {
  if (employee.access_profile === "Inspetor") return "#e11d48";
  if (employee.sector === "CFTV") return "#3b82f6";
  if (employee.sector === "Vigilância") return "#f59e0b";
  return "#8b5cf6";
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function TeamManagementWorkspace() {
  const { data: user } = useCurrentUser();
  const canManageTeam = hasPermission(user, "team.manage");
  const canOpenAccess = Boolean(user && canAccessAdminPath(user, "/acessos"));
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);

  const {
    data: employees = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const editingEmployee = editingId ? employees.find((employee) => employee.id === editingId) ?? null : null;
  const editingPrivileged = editingEmployee?.access_profile === "Inspetor";
  const availableSectors = useMemo(
    () => ["Todos", ...Array.from(new Set([...SETORES, ...employees.map((employee) => employee.sector)])).sort((a, b) => a.localeCompare(b, "pt-BR"))],
    [employees],
  );

  const filtered = useMemo(() => {
    const query = normalizeSearch(search);
    return employees.filter((employee) => {
      if (sectorFilter !== "Todos" && employee.sector !== sectorFilter) return false;
      if (statusFilter !== "Todos" && employee.status !== statusFilter) return false;
      if (!query) return true;
      return [employee.full_name, employee.matricula, employee.sector, employee.access_profile, employee.status]
        .some((value) => normalizeSearch(String(value)).includes(query));
    });
  }, [employees, search, sectorFilter, statusFilter]);

  const cadastrosAtivos = employees.filter((employee) => employee.status === "Ativo").length;
  const operacionaisAtivos = employees.filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor").length;
  const inativos = employees.length - cadastrosAtivos;
  const cftv = employees.filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor" && employee.sector === "CFTV").length;
  const vigilancia = employees.filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor" && employee.sector === "Vigilância").length;
  const metricValue = (value: number) => (isLoading || isError ? "—" : value);

  const invalidate = () => invalidateEmployeeFlow(queryClient);

  const closeEditor = () => {
    setDialogOpen(false);
    setForm(emptyEmployeeForm);
    setEditingId(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!canManageTeam) throw new Error("Seu nível de acesso permite apenas visualizar a equipe");
      if (!form.full_name.trim() || !form.matricula.trim()) throw new Error("Preencha nome e matrícula");
      if (editingId) {
        if (editingPrivileged) await updateEmployee(editingId, { full_name: form.full_name, sector: form.sector });
        else await updateEmployee(editingId, form);
      } else {
        await createEmployee({ ...form, matricula: form.matricula.trim() });
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Funcionário atualizado" : "Funcionário cadastrado");
      closeEditor();
      void invalidate();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message.includes("duplicate") ? "Matrícula já cadastrada" : mutationError.message),
  });

  const remove = useMutation({
    mutationFn: (employee: Employee) => {
      if (!canManageTeam) throw new Error("Seu nível de acesso permite apenas visualizar a equipe");
      return deleteEmployee(employee.id);
    },
    onSuccess: () => {
      toast.success("Funcionário excluído");
      setToDelete(null);
      void invalidate();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const openNew = () => {
    if (!canManageTeam) return;
    setForm(emptyEmployeeForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (employee: Employee) => {
    if (!canManageTeam) return;
    setForm({ full_name: employee.full_name, matricula: employee.matricula, sector: employee.sector, access_profile: employee.access_profile, status: employee.status });
    setEditingId(employee.id);
    setDialogOpen(true);
  };

  const hasFilters = Boolean(search.trim()) || sectorFilter !== "Todos" || statusFilter !== "Todos";
  const clearFilters = () => { setSearch(""); setSectorFilter("Todos"); setStatusFilter("Todos"); };
  const tableHeaders = canManageTeam
    ? ["Funcionário", "Matrícula", "Setor", "Perfil", "Situação", "Ações"]
    : ["Funcionário", "Matrícula", "Setor", "Perfil", "Situação"];

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6 xl:p-7" style={{ background: "linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)", border: "1px solid rgba(200,16,46,.28)", boxShadow: "0 12px 38px rgba(80,0,18,.16)" }}>
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)" }} />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em]" style={{ color: "rgba(255,255,255,.44)" }}><UserRoundCog className="h-4 w-4" /> Gestão operacional</div><h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl xl:text-[2.1rem]">Gestão de Equipe</h1><p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,.52)" }}>{isLoading ? "Carregando cadastros..." : isError ? "Cadastros temporariamente indisponíveis" : `${employees.length} cadastrados · ${cadastrosAtivos} ativos · ${inativos} inativos`}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {!canManageTeam && <div className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-bold text-white/70"><LockKeyhole className="h-3.5 w-3.5" />Somente leitura</div>}
            {canOpenAccess && <Button asChild variant="outline" className="border-white/15 bg-white/5 font-bold text-white hover:bg-white/10 hover:text-white"><Link to="/acessos"><KeyRound className="mr-2 h-4 w-4" />Acessos</Link></Button>}
            {canManageTeam && <Button onClick={openNew} className="bg-[#e0142f] font-bold text-white shadow-lg shadow-red-950/20 hover:bg-[#C8102E]"><Plus className="mr-2 h-4 w-4" />Novo Funcionário</Button>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Equipe ativa" value={metricValue(operacionaisAtivos)} icon={ShieldCheck} accent="#10b981" sub="operacionais ativos" />
        <MetricCard label="CFTV" value={metricValue(cftv)} icon={Eye} accent="#3b82f6" sub="operacionais ativos" />
        <MetricCard label="Vigilância" value={metricValue(vigilancia)} icon={Radio} accent="#f59e0b" sub="operacionais ativos" />
        <MetricCard label="Inativos" value={metricValue(inativos)} icon={UserX} accent="#e11d48" sub="cadastros preservados" />
      </div>

      {!canManageTeam && !isError && (
        <Surface className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}><LockKeyhole className="h-4 w-4" style={{ color: "var(--text-3)" }} /></div>
          <div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Visualização somente leitura</p><p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>Seu nível de acesso permite consultar os colaboradores, mas não cadastrar, editar ou excluir registros.</p></div>
        </Surface>
      )}

      <Surface className="p-4 xl:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Funcionários</p><p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>{isError ? "Dados indisponíveis" : isFetching && !isLoading ? `Atualizando · ${filtered.length} de ${employees.length} registros exibidos` : `${filtered.length} de ${employees.length} registros exibidos`}</p></div>
          {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="self-start lg:self-auto">Limpar filtros</Button>}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(320px,1fr)_220px_180px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, matrícula, setor, perfil ou situação..." className="pl-10" aria-label="Buscar funcionários" /></div>
          <Select value={sectorFilter} onValueChange={setSectorFilter}><SelectTrigger aria-label="Filtrar por setor"><SelectValue /></SelectTrigger><SelectContent>{availableSectors.map((sector) => <SelectItem key={sector} value={sector}>{sector === "Todos" ? "Todos os setores" : sector}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger aria-label="Filtrar por situação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Todos">Todas as situações</SelectItem>{SITUACOES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
        </div>
      </Surface>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 p-12" role="status" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /><span className="text-sm font-semibold" style={{ color: "var(--text-3)" }}>Carregando equipe...</span></div>
      ) : isError ? (
        <Surface className="p-7 text-center md:p-9" role="alert">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "rgba(225,29,72,.08)", border: "1px solid rgba(225,29,72,.18)" }}><AlertTriangle className="h-6 w-6 text-rose-500" /></div>
          <p className="font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar a equipe</p>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-3)" }}>{error instanceof Error ? error.message : "A consulta de colaboradores falhou. Tente novamente."}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{isFetching ? "Tentando novamente..." : "Tentar novamente"}</Button>
        </Surface>
      ) : filtered.length === 0 ? (
        <Surface className="p-9 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "#C8102E1a" }}><Users className="h-6 w-6 text-[#C8102E]" /></div>
          <p className="font-bold" style={{ color: "var(--text-1)" }}>{hasFilters ? "Nenhum funcionário corresponde aos filtros" : "Nenhum funcionário cadastrado"}</p>
          <p className="mx-auto mt-1 max-w-lg text-sm" style={{ color: "var(--text-3)" }}>{hasFilters ? "Limpe ou ajuste a busca, o setor ou a situação para visualizar outros registros." : canManageTeam ? "Cadastre o primeiro colaborador para iniciar a gestão da equipe." : "Não há colaboradores disponíveis para consulta neste momento."}</p>
          {hasFilters ? <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>Limpar filtros</Button> : canManageTeam ? <Button type="button" className="mt-4 bg-[#C8102E] font-bold text-white hover:bg-[#A00D24]" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo Funcionário</Button> : null}
        </Surface>
      ) : (
        <>
          <Surface className="hidden overflow-hidden lg:block">
            <div className="max-h-[62vh] overflow-auto">
              <table className={`w-full border-collapse text-left ${canManageTeam ? "min-w-[920px]" : "min-w-[760px]"}`}>
                <thead className="sticky top-0 z-10" style={{ background: "var(--bg-surface)" }}>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {tableHeaders.map((label) => <th key={label} scope="col" className={`px-4 py-3 text-[10px] font-black uppercase tracking-[.13em] ${label === "Ações" ? "text-right" : ""}`} style={{ color: "var(--text-4)" }}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((employee) => {
                    const active = employee.status === "Ativo";
                    const privileged = employee.access_profile === "Inspetor";
                    const accent = employeeAccent(employee);
                    return (
                      <tr key={employee.id} className="transition-colors hover:bg-black/[.015] dark:hover:bg-white/[.025]" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="px-4 py-3.5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white" style={{ background: active ? accent : "#64748b" }}>{employee.full_name.charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="max-w-[320px] truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{employee.full_name}</p><p className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>{privileged ? "Identidade privilegiada" : "Cadastro operacional"}</p></div></div></td>
                        <td className="px-4 py-3.5 text-sm font-mono" style={{ color: "var(--text-3)" }}>{employee.matricula}</td>
                        <td className="px-4 py-3.5 text-sm" style={{ color: "var(--text-2)" }}>{employee.sector}</td>
                        <td className="px-4 py-3.5"><Badge variant="outline" className="max-w-[180px] truncate text-xs font-bold" style={{ color: accent, borderColor: `${accent}40`, background: `${accent}12` }}>{privileged ? "Inspetor · TI" : employee.access_profile}</Badge></td>
                        <td className="px-4 py-3.5"><span className="inline-flex items-center gap-2 text-xs font-bold" style={{ color: active ? "#10b981" : "var(--text-4)" }}><span className="h-2 w-2 rounded-full" style={{ background: active ? "#10b981" : "#64748b" }} />{employee.status}</span></td>
                        {canManageTeam && <td className="px-4 py-3.5"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title={privileged ? "Editar dados não privilegiados" : `Editar ${employee.full_name}`} aria-label={privileged ? `Editar dados não privilegiados de ${employee.full_name}` : `Editar ${employee.full_name}`} onClick={() => openEdit(employee)}><Pencil className="h-4 w-4" /></Button>{!privileged && <Button variant="ghost" size="icon" title={`Excluir ${employee.full_name}`} aria-label={`Excluir ${employee.full_name}`} className="text-red-500 hover:text-red-600" onClick={() => setToDelete(employee)}><Trash2 className="h-4 w-4" /></Button>}</div></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Surface>

          <div className="grid gap-3 lg:hidden">
            {filtered.map((employee) => {
              const active = employee.status === "Ativo";
              const privileged = employee.access_profile === "Inspetor";
              const accent = employeeAccent(employee);
              return (
                <Surface key={employee.id} className="relative overflow-hidden p-4">
                  <div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: active ? accent : "var(--text-4)" }} />
                  <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white" style={{ background: active ? accent : "#64748b" }}>{employee.full_name.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{employee.full_name}</p><p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-4)" }}>Mat. {employee.matricula} · {employee.sector}</p></div></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline" className="max-w-[160px] truncate text-xs font-bold" style={{ color: accent, borderColor: `${accent}40`, background: `${accent}12` }}>{privileged ? "Inspetor · TI" : employee.access_profile}</Badge><span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold" style={{ color: active ? "#10b981" : "var(--text-4)", background: active ? "rgba(16,185,129,.08)" : "var(--bg-surface-2)", border: `1px solid ${active ? "rgba(16,185,129,.18)" : "var(--border)"}` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "#10b981" : "#64748b" }} />{employee.status}</span><span className="min-w-0 flex-1" />{canManageTeam && <div className="flex items-center gap-1"><Button variant="ghost" size="icon" title={privileged ? "Editar dados não privilegiados" : `Editar ${employee.full_name}`} aria-label={privileged ? `Editar dados não privilegiados de ${employee.full_name}` : `Editar ${employee.full_name}`} onClick={() => openEdit(employee)}><Pencil className="h-4 w-4" /></Button>{!privileged && <Button variant="ghost" size="icon" title={`Excluir ${employee.full_name}`} aria-label={`Excluir ${employee.full_name}`} className="text-red-500" onClick={() => setToDelete(employee)}><Trash2 className="h-4 w-4" /></Button>}</div>}</div>
                </Surface>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else closeEditor(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle style={{ fontFamily: "var(--font-heading)" }}>{editingId ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {editingPrivileged && <div className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: "rgba(225,29,72,.07)", border: "1px solid rgba(225,29,72,.18)", color: "var(--text-3)" }}><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /><span>Identidade privilegiada. Perfil, matrícula e situação do Inspetor são gerenciados exclusivamente pela TI.</span></div>}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2"><Label htmlFor="full_name">Nome completo</Label><Input id="full_name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} placeholder="Nome do funcionário" autoComplete="name" /></div>
              <div className="space-y-1.5"><Label htmlFor="matricula">Matrícula</Label><Input id="matricula" value={form.matricula} inputMode="numeric" disabled={editingPrivileged} onChange={(event) => setForm({ ...form, matricula: event.target.value.replace(/\D/g, "") })} placeholder="Ex.: 970" /></div>
              <div className="space-y-1.5"><Label htmlFor="employee-sector">Setor</Label><Select value={form.sector} onValueChange={(value) => setForm({ ...form, sector: value })}><SelectTrigger id="employee-sector"><SelectValue /></SelectTrigger><SelectContent>{SETORES.map((sector) => <SelectItem key={sector} value={sector}>{sector}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="employee-profile">Perfil de acesso</Label>{editingPrivileged ? <div id="employee-profile" className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-surface-2)", color: "var(--text-3)" }}><LockKeyhole className="h-3.5 w-3.5 text-rose-500" /> Inspetor · TI</div> : <Select value={form.access_profile} onValueChange={(value) => setForm({ ...form, access_profile: value })}><SelectTrigger id="employee-profile"><SelectValue /></SelectTrigger><SelectContent>{PERFIS.map((profile) => <SelectItem key={profile} value={profile}>{profile}</SelectItem>)}</SelectContent></Select>}</div>
              <div className="space-y-1.5"><Label htmlFor="employee-status">Situação</Label><Select value={form.status} disabled={editingPrivileged} onValueChange={(value) => setForm({ ...form, status: value })}><SelectTrigger id="employee-status"><SelectValue /></SelectTrigger><SelectContent>{SITUACOES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={closeEditor} disabled={save.isPending}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !canManageTeam} className="bg-[#C8102E] font-bold text-white hover:bg-[#A00D24]">{save.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir funcionário?</AlertDialogTitle><AlertDialogDescription>{toDelete ? `“${toDelete.full_name}” só poderá ser excluído se não possuir conta ou histórico operacional. Havendo histórico, o SEGEMPAT bloqueará a exclusão e o cadastro deverá ser inativado.` : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={remove.isPending || !canManageTeam} className="bg-[#C8102E] hover:bg-[#A00D24]" onClick={() => toDelete && remove.mutate(toDelete)}>{remove.isPending ? "Excluindo..." : "Excluir se não houver histórico"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
