import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  Search,
  ShieldAlert,
  Target,
  UserRound,
  UserRoundSearch,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { canAccessAdminPath } from "@/lib/access-control";
import { listEmployees } from "@/lib/employees";
import { listOccurrences } from "@/lib/occurrences";
import { listKnowledgeItems } from "@/lib/operations";
import { useCurrentUser } from "@/lib/useCurrentUser";

type SearchPath =
  | "/admin"
  | "/atencao"
  | "/analytics"
  | "/equipe"
  | "/risco"
  | "/individual"
  | "/cronograma"
  | "/ocorrencias"
  | "/avaliacao-pratica"
  | "/relatorios"
  | "/ia-base"
  | "/acessos"
  | "/auditoria"
  | "/provas"
  | "/banco-questoes"
  | "/conteudos"
  | "/treinamentos"
  | "/painel"
  | "/pendencias"
  | "/progresso"
  | "/certificados"
  | "/meu-perfil"
  | "/pratico"
  | "/minhas-ocorrencias";

type StaticResult = {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  path: SearchPath;
  icon: LucideIcon;
  audience: "admin" | "operator" | "all";
};

type SearchResult = {
  id: string;
  group: "Navegação" | "Colaboradores" | "Ocorrências" | "Conhecimento";
  title: string;
  subtitle: string;
  path: SearchPath;
  icon: LucideIcon;
  tone?: string;
};

const staticResults: StaticResult[] = [
  { id: "dashboard-admin", title: "Dashboard", subtitle: "Visão geral da Inspetoria", keywords: "inicio indicadores gestão", path: "/admin", icon: LayoutDashboard, audience: "admin" },
  { id: "attention", title: "Central de Atenção", subtitle: "Prioridades e sinais que exigem acompanhamento", keywords: "alerta pendência crítico atenção", path: "/atencao", icon: BellRing, audience: "admin" },
  { id: "analytics", title: "Analytics", subtitle: "Indicadores e gráficos operacionais", keywords: "grafico desempenho dados painel tv", path: "/analytics", icon: BarChart3, audience: "admin" },
  { id: "team", title: "Equipe", subtitle: "Gestão dos colaboradores operacionais", keywords: "colaborador matrícula setor funcionário", path: "/equipe", icon: Users, audience: "admin" },
  { id: "risk", title: "Zona de Risco", subtitle: "Sinais de desempenho e pendências da equipe", keywords: "risco atenção desempenho", path: "/risco", icon: Target, audience: "admin" },
  { id: "individual", title: "Análise Individual", subtitle: "Dossiê de desempenho do colaborador", keywords: "pessoa nota histórico evolução prova", path: "/individual", icon: UserRoundSearch, audience: "admin" },
  { id: "schedule", title: "Cronograma", subtitle: "Planejamento e execução operacional", keywords: "agenda atividade treinamento planejamento", path: "/cronograma", icon: CalendarDays, audience: "admin" },
  { id: "occurrences", title: "Ocorrências", subtitle: "Registros, evidências e acompanhamento", keywords: "incidente foto pessoa envolvida registro", path: "/ocorrencias", icon: ShieldAlert, audience: "admin" },
  { id: "practical-admin", title: "Avaliação Prática", subtitle: "Gestão das avaliações práticas", keywords: "pratico checklist desempenho", path: "/avaliacao-pratica", icon: Target, audience: "admin" },
  { id: "reports", title: "Central de Relatórios", subtitle: "Visão executiva e fechamento mensal", keywords: "relatório mensal csv imprimir setor", path: "/relatorios", icon: FileSpreadsheet, audience: "admin" },
  { id: "knowledge-admin", title: "IA Base", subtitle: "Pesquisa de procedimentos e conhecimento operacional", keywords: "procedimento documento conteúdo pesquisa", path: "/ia-base", icon: BookOpen, audience: "admin" },
  { id: "exams", title: "Provas", subtitle: "Avaliações cadastradas", keywords: "teste avaliação questões", path: "/provas", icon: Target, audience: "admin" },
  { id: "question-bank", title: "Banco de Questões", subtitle: "Questões para avaliações", keywords: "pergunta resposta prova", path: "/banco-questoes", icon: BookOpen, audience: "admin" },
  { id: "access", title: "Acessos", subtitle: "Gestão operacional de acesso", keywords: "conta ativação usuário", path: "/acessos", icon: Users, audience: "admin" },
  { id: "audit", title: "Auditoria", subtitle: "Rastreabilidade das ações do sistema", keywords: "log histórico segurança", path: "/auditoria", icon: ShieldAlert, audience: "admin" },
  { id: "operator-home", title: "Início", subtitle: "Painel pessoal", keywords: "dashboard painel", path: "/painel", icon: LayoutDashboard, audience: "operator" },
  { id: "operator-pending", title: "Pendências", subtitle: "Atividades e ações pendentes", keywords: "atividade vencimento atenção", path: "/pendencias", icon: BellRing, audience: "operator" },
  { id: "operator-progress", title: "Progresso", subtitle: "Evolução pessoal", keywords: "nota desempenho evolução", path: "/progresso", icon: BarChart3, audience: "operator" },
  { id: "academy", title: "Academia SEGEMPAT", subtitle: "Capacitação, prática e desenvolvimento", keywords: "treinamento simulador desafio teste rápido stress", path: "/treinamentos", icon: GraduationCap, audience: "all" },
  { id: "my-profile", title: "Meu Perfil", subtitle: "Identidade, nível, ciclo e histórico individual", keywords: "perfil conta matrícula nivel pontos histórico", path: "/meu-perfil", icon: UserRound, audience: "all" },
  { id: "operator-certificates", title: "Certificados", subtitle: "Aprovações e documentos pessoais", keywords: "certificado prova aprovação", path: "/certificados", icon: FileSpreadsheet, audience: "operator" },
  { id: "operator-knowledge", title: "Base de Conhecimento", subtitle: "Procedimentos e referências operacionais", keywords: "conteúdo procedimento documento", path: "/conteudos", icon: BookOpen, audience: "operator" },
  { id: "operator-practical", title: "Avaliação Prática", subtitle: "Minhas avaliações práticas", keywords: "prático checklist", path: "/pratico", icon: Target, audience: "operator" },
  { id: "operator-occurrences", title: "Minhas Ocorrências", subtitle: "Registros vinculados ao seu perfil", keywords: "incidente ocorrência", path: "/minhas-ocorrencias", icon: AlertTriangle, audience: "operator" },
];

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matches(term: string, ...values: unknown[]) {
  if (!term) return true;
  return values.some((value) => normalize(value).includes(term));
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const isAdmin = user?.isAdmin ?? false;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const canSearchPeople = Boolean(
    user && isAdmin && canAccessAdminPath(user, "/equipe") && canAccessAdminPath(user, "/individual"),
  );
  const canSearchOccurrences = !isAdmin || Boolean(user && canAccessAdminPath(user, "/ocorrencias"));
  const canSearchKnowledge = !isAdmin || Boolean(user && canAccessAdminPath(user, "/ia-base"));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const employees = useQuery({
    queryKey: ["global-search-employees"],
    queryFn: listEmployees,
    enabled: open && canSearchPeople,
    staleTime: 60_000,
    retry: false,
  });
  const occurrences = useQuery({
    queryKey: ["global-search-occurrences"],
    queryFn: listOccurrences,
    enabled: open && canSearchOccurrences,
    staleTime: 30_000,
    retry: false,
  });
  const knowledge = useQuery({
    queryKey: ["global-search-knowledge"],
    queryFn: listKnowledgeItems,
    enabled: open && canSearchKnowledge,
    staleTime: 60_000,
    retry: false,
  });

  const term = normalize(query.trim());
  const sector = normalize(user?.setor);
  const results = useMemo<SearchResult[]>(() => {
    const audience = isAdmin ? "admin" : "operator";
    const navigation = staticResults
      .filter((item) => item.audience === "all" || item.audience === audience)
      .filter((item) => !isAdmin || !user || canAccessAdminPath(user, item.path))
      .filter((item) => matches(term, item.title, item.subtitle, item.keywords))
      .slice(0, term ? 8 : 6)
      .map((item) => ({ id: `nav-${item.id}`, group: "Navegação" as const, title: item.title, subtitle: item.subtitle, path: item.path, icon: item.icon }));

    const people = canSearchPeople && term
      ? (employees.data ?? []).filter((employee) => matches(term, employee.full_name, employee.matricula, employee.sector)).slice(0, 6).map((employee) => ({
          id: `employee-${employee.id}`,
          group: "Colaboradores" as const,
          title: employee.full_name,
          subtitle: `Mat. ${employee.matricula} · ${employee.sector} · abrir Análise Individual`,
          path: "/individual" as const,
          icon: UserRoundSearch,
        }))
      : [];

    const occurrenceRows = canSearchOccurrences && term
      ? (occurrences.data ?? []).filter((occurrence) => matches(term, occurrence.title, occurrence.category, occurrence.location, occurrence.status, occurrence.severity, occurrence.description)).slice(0, 6).map((occurrence) => ({
          id: `occurrence-${occurrence.id}`,
          group: "Ocorrências" as const,
          title: occurrence.title,
          subtitle: `${occurrence.severity} · ${occurrence.status}${occurrence.location ? ` · ${occurrence.location}` : ""}`,
          path: (isAdmin ? "/ocorrencias" : "/minhas-ocorrencias") as SearchPath,
          icon: ShieldAlert,
          tone: occurrence.severity === "Crítica" ? "#ef4444" : occurrence.severity === "Alta" ? "#f97316" : undefined,
        }))
      : [];

    const knowledgeRows = canSearchKnowledge && term
      ? (knowledge.data ?? [])
          .filter((item) => item.active || isAdmin)
          .filter((item) => isAdmin || item.target_sector === "Todos" || normalize(item.target_sector) === sector)
          .filter((item) => matches(term, item.title, item.category, item.content, item.target_sector))
          .slice(0, 6)
          .map((item) => ({
            id: `knowledge-${item.id}`,
            group: "Conhecimento" as const,
            title: item.title,
            subtitle: `${item.category} · ${item.target_sector}`,
            path: (isAdmin ? "/ia-base" : "/conteudos") as SearchPath,
            icon: BookOpen,
          }))
      : [];

    return [...navigation, ...people, ...occurrenceRows, ...knowledgeRows];
  }, [canSearchKnowledge, canSearchOccurrences, canSearchPeople, employees.data, isAdmin, knowledge.data, occurrences.data, sector, term, user]);

  const groups = ["Navegação", "Colaboradores", "Ocorrências", "Conhecimento"] as const;
  const partialFailure = (canSearchPeople && employees.isError) || (canSearchOccurrences && occurrences.isError) || (canSearchKnowledge && knowledge.isError);

  const openResult = (path: SearchPath) => {
    setOpen(false);
    if (path === "/atencao") {
      // A rota file-based entra na árvore tipada quando o plugin TanStack roda no build.
      // @ts-expect-error /atencao ainda não existe no routeTree versionado antes da geração do build
      navigate({ to: path });
      return;
    }
    navigate({ to: path });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 min-w-0 items-center gap-2 rounded-xl px-3 text-left transition-colors md:flex xl:w-[330px]"
        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-4)" }}
        aria-label="Buscar no SEGEMPAT"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs">Buscar no SEGEMPAT...</span>
        <span className="rounded-md px-1.5 py-0.5 text-[9px] font-black" style={{ background: "var(--bg-surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-4)" }}>Ctrl K</span>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg md:hidden" style={{ color: "var(--text-3)", border: "1px solid var(--border)" }} aria-label="Buscar no SEGEMPAT"><Search className="h-4 w-4" /></button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[86vh] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b p-4 pb-3" style={{ borderColor: "var(--border)" }}>
            <DialogTitle className="flex items-center justify-between gap-3 text-left">
              <span>Busca Global</span>
              <span className="text-[10px] font-normal" style={{ color: "var(--text-4)" }}>Ctrl/Cmd + K</span>
            </DialogTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
              <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isAdmin ? "Buscar colaborador, ocorrência, procedimento ou função..." : "Buscar procedimento, ocorrência ou função..."} className="h-11 pl-10 pr-10" />
              {query && <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-4)" }} aria-label="Limpar busca"><X className="h-4 w-4" /></button>}
            </div>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-y-auto p-3">
            {partialFailure && <div className="mb-3 flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.16)", color: "#d97706" }}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Uma fonte de dados está indisponível. Os demais resultados continuam funcionando.</span></div>}

            {!term && <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Acesso rápido</p>}
            {groups.map((group) => {
              const rows = results.filter((result) => result.group === group);
              if (!rows.length) return null;
              return <section key={group} className="mb-4 last:mb-0"><p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-[.15em]" style={{ color: "var(--text-4)" }}>{group}</p><div className="space-y-1">{rows.map((result) => { const Icon = result.icon; return <button key={result.id} type="button" onClick={() => openResult(result.path)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.035]"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: result.tone ? `${result.tone}12` : "var(--accent-soft)", color: result.tone || "var(--accent)" }}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{result.title}</p><p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--text-4)" }}>{result.subtitle}</p></div><span className="text-xs" style={{ color: "var(--text-4)" }}>↵</span></button>; })}</div></section>;
            })}

            {term && !results.length && <div className="py-12 text-center"><Search className="mx-auto h-8 w-8 opacity-25" /><p className="mt-3 text-sm font-black" style={{ color: "var(--text-1)" }}>Nenhum resultado encontrado.</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Tente outro nome, matrícula, tema ou palavra-chave.</p></div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}