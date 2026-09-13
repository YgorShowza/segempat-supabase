import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  Fingerprint,
  History,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAuditLogs } from "@/lib/operations";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria · SEGEMPAT" }] }),
  component: AuditPage,
});

const PAGE_SIZE = 40;
const AUDIT_WINDOW = 500;

const actionLabel: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
  LOGIN: "Login",
  ACTIVATE: "Primeiro acesso ativado",
  PASSWORD_CHANGE: "Alteração de senha",
  ISSUE_ACTIVATION_CODE: "Código de primeiro acesso emitido",
  REVOKE_ACTIVATION_CODE: "Código de primeiro acesso revogado",
  ISSUE_PASSWORD_RESET_CODE: "Recuperação de senha emitida",
  REVOKE_PASSWORD_RESET_CODE: "Recuperação de senha revogada",
  UPDATE_ACCESS_CONTROL: "Nível ou permissões alterados",
  TI_GRANT_MASTER_ACCESS: "Master concedido pela TI",
  TI_MANAGE_INSPECTOR_ACCESS: "Acesso de Inspetor alterado pela TI",
  EXAM_ATTEMPT: "Prova realizada",
  SIGN_EXAM_ATTEMPT: "Prova assinada",
};

const entityLabel: Record<string, string> = {
  app_users: "Conta de acesso",
  employees: "Colaborador",
  user_access_levels: "Nível de acesso",
  user_permission_overrides: "Permissões",
  registration_activation_codes: "Primeiro acesso",
  password_reset_codes: "Recuperação de senha",
  exam_attempts: "Tentativa de prova",
  occurrences: "Ocorrência",
  practical_evaluations: "Avaliação prática",
  practical_eval_templates: "Modelo de avaliação prática",
  knowledge_items: "Conteúdo",
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl ${className}`} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      {children}
    </div>
  );
}

function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionTone(action: string) {
  if (action === "DELETE" || action.startsWith("REVOKE_") || action === "UPDATE_ACCESS_CONTROL") {
    return { color: "#ef4444", background: "rgba(239,68,68,.1)" };
  }
  if (action === "UPDATE" || action === "PASSWORD_CHANGE") {
    return { color: "#f59e0b", background: "rgba(245,158,11,.1)" };
  }
  if (action === "LOGIN" || action === "ACTIVATE" || action.startsWith("ISSUE_") || action.startsWith("TI_")) {
    return { color: "#3b82f6", background: "rgba(59,130,246,.1)" };
  }
  return { color: "#10b981", background: "rgba(16,185,129,.1)" };
}

function isAccessEvent(action: string, entity: string) {
  return action.includes("ACCESS") || action.includes("ACTIVATION") || action.includes("PASSWORD") || action.startsWith("TI_") || ["app_users", "user_access_levels", "user_permission_overrides", "registration_activation_codes", "password_reset_codes"].includes(entity);
}

function isCriticalEvent(action: string) {
  return action === "DELETE" || action.startsWith("REVOKE_") || action === "UPDATE_ACCESS_CONTROL" || action === "TI_GRANT_MASTER_ACCESS";
}

function MetricCard({ label, value, icon: Icon, hint }: { label: string; value: number; icon: LucideIcon; hint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{label}</p>
          <p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{value}</p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-4)" }}>{hint}</p>
        </div>
        <Icon className="h-4 w-4" style={{ color: "var(--accent)" }} />
      </div>
    </Card>
  );
}

function AuditPage() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("Todos");
  const [action, setAction] = useState("Todos");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["audit-logs", AUDIT_WINDOW],
    queryFn: () => listAuditLogs(AUDIT_WINDOW, 0),
    staleTime: 30_000,
  });

  const data = query.data?.items ?? [];
  const hasOlderEvents = query.data?.nextOffset !== null && query.data?.nextOffset !== undefined;
  const entities = useMemo(() => ["Todos", ...Array.from(new Set(data.map((row) => row.entity))).sort()], [data]);
  const actions = useMemo(() => ["Todos", ...Array.from(new Set(data.map((row) => row.action))).sort()], [data]);

  const filtered = useMemo(() => {
    const queryText = normalizeSearch(search);
    return data.filter((row) => {
      if (entity !== "Todos" && row.entity !== entity) return false;
      if (action !== "Todos" && row.action !== action) return false;
      if (!queryText) return true;
      return [
        row.action,
        actionLabel[row.action],
        row.entity,
        entityLabel[row.entity],
        row.entity_id,
        row.actor_id,
        row.actor_name,
      ].some((value) => normalizeSearch(String(value ?? "")).includes(queryText));
    });
  }, [action, data, entity, search]);

  useEffect(() => setPage(1), [search, entity, action]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const metrics = useMemo(() => ({
    loaded: data.length,
    access: data.filter((row) => isAccessEvent(row.action, row.entity)).length,
    critical: data.filter((row) => isCriticalEvent(row.action)).length,
    auth: data.filter((row) => ["LOGIN", "ACTIVATE", "PASSWORD_CHANGE"].includes(row.action)).length,
  }), [data]);

  if (query.isLoading) return <Loading />;
  if (query.isError) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
        <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar a auditoria.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>A trilha de auditoria exige a permissão específica de consulta e disponibilidade da API SEGEMPAT.</p>
        <Button variant="outline" className="mt-4" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
      </Card>
    );
  }

  return (
    <div className="segempat-governance-audit mx-auto w-full max-w-[1536px] space-y-5 pb-10">
      <section className="rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/40"><History className="h-4 w-4" /> Rastreabilidade e responsabilidade</div>
            <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Auditoria</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Histórico dos eventos administrativos e de segurança, com autoria, ação, alvo e horário operacional. A consulta é restrita à permissão <span className="font-mono text-white/75">audit.view</span>.
            </p>
          </div>
          <Button variant="outline" onClick={() => query.refetch()} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar trilha
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Eventos carregados" value={metrics.loaded} icon={Database} hint={`janela de até ${AUDIT_WINDOW}`} />
        <MetricCard label="Acesso e segurança" value={metrics.access} icon={ShieldCheck} hint="identidade e privilégios" />
        <MetricCard label="Eventos críticos" value={metrics.critical} icon={AlertTriangle} hint="exclusões, revogações e privilégios" />
        <MetricCard label="Autenticação" value={metrics.auth} icon={KeyRound} hint="login, ativação e senha" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_260px_auto] lg:items-center">
          <div className="relative">
            <Label htmlFor="audit-search" className="sr-only">Buscar auditoria</Label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
            <Input id="audit-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ator, ação, entidade ou ID…" className="pl-10" />
          </div>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger aria-label="Filtrar auditoria por entidade"><SelectValue /></SelectTrigger>
            <SelectContent>{entities.map((item) => <SelectItem key={item} value={item}>{item === "Todos" ? "Todas as entidades" : entityLabel[item] || item}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger aria-label="Filtrar auditoria por ação"><SelectValue /></SelectTrigger>
            <SelectContent>{actions.map((item) => <SelectItem key={item} value={item}>{item === "Todos" ? "Todas as ações" : actionLabel[item] || item}</SelectItem>)}</SelectContent>
          </Select>
          {(search || entity !== "Todos" || action !== "Todos") && (
            <Button type="button" variant="ghost" onClick={() => { setSearch(""); setEntity("Todos"); setAction("Todos"); }}>Limpar filtros</Button>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ color: "var(--text-4)" }}>
          <span>{filtered.length === data.length ? `${data.length} evento(s) na janela atual` : `${filtered.length} de ${data.length} evento(s) correspondem aos filtros`}</span>
          {hasOlderEvents && <span>Há eventos anteriores fora da janela carregada.</span>}
        </div>
      </Card>

      <div className="space-y-2">
        {visible.map((row) => {
          const tone = actionTone(row.action);
          const actor = row.actor_name || (row.actor_id ? "Usuário identificado" : "Sistema / processo técnico");
          return (
            <Card key={row.id} className="p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(220px,.8fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-2 py-1 text-[10px] font-black" style={tone}>{actionLabel[row.action] || row.action}</span>
                    <p className="break-words text-sm font-bold" style={{ color: "var(--text-1)" }}>{entityLabel[row.entity] || row.entity}</p>
                  </div>
                  <div className="mt-2 flex items-start gap-2">
                    <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-4)" }} />
                    <p className="break-all text-xs" style={{ color: "var(--text-4)" }}>Alvo: {row.entity_id || "sem identificador específico"}</p>
                  </div>
                </div>

                <div className="min-w-0 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-surface-2)" }}>
                  <div className="flex items-center gap-2"><UserCog className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} /><p className="truncate text-xs font-bold" style={{ color: "var(--text-2)" }}>{actor}</p></div>
                  <p className="mt-1 break-all text-[10px]" style={{ color: "var(--text-4)" }}>Ator: {row.actor_id || "processo sem usuário associado"}</p>
                </div>

                <p className="shrink-0 text-xs lg:text-right" style={{ color: "var(--text-4)" }}>{fmtDate(row.created_at)}</p>
              </div>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <Card className="p-10 text-center">
            <History className="mx-auto h-10 w-10 opacity-30" style={{ color: "var(--text-4)" }} />
            <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhum evento encontrado.</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>{data.length ? "Ajuste os filtros para ampliar a consulta." : "A janela de auditoria carregada ainda não possui eventos."}</p>
          </Card>
        )}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs" style={{ color: "var(--text-4)" }}>Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>
            <span className="min-w-20 text-center text-xs font-bold" style={{ color: "var(--text-3)" }}>{safePage}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-2)" }}>Leitura de governança</p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>
              Esta visão utiliza o endpoint dedicado de auditoria, separado das consultas operacionais genéricas. Códigos temporários, hashes e credenciais não são exibidos nesta tela.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Loading() {
  return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
}
