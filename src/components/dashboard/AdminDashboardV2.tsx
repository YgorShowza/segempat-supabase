import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarDays,
  ChevronRight,
  Crown,
  FileSpreadsheet,
  FileText,
  History,
  KeyRound,
  Maximize2,
  RefreshCw,
  Shield,
  Target,
  Users,
} from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { employeeRisk, getOperationalSnapshot, sectorMetrics, snapshotMetrics } from "@/lib/insights";
import { operationalYear } from "@/lib/operational-time";
import {
  SystemDashboardSkeleton,
  SystemMetricCard,
  SystemSectionHeader,
  SystemSurface,
} from "@/components/system/SystemUI";

const SECTOR_COLORS = ["#C8102E", "#2563eb", "#10b981", "#f59e0b", "#64748b", "#3b82f6"];

export function AdminDashboardV2() {
  const year = operationalYear();
  const { data: user } = useCurrentUser();
  const [showAllQuick, setShowAllQuick] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const [showMorePriorities, setShowMorePriorities] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-snapshot", year],
    queryFn: () => getOperationalSnapshot(year),
    staleTime: 60_000,
  });

  if (isLoading) return <SystemDashboardSkeleton />;

  if (!data) {
    return (
      <SystemSurface className="mx-auto max-w-3xl p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o dashboard.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white"
          style={{ background: "var(--accent)" }}
        >
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      </SystemSurface>
    );
  }

  const metrics = snapshotMetrics(data);
  const sectors = sectorMetrics(data);
  const sectorOverview = [...sectors].sort(
    (a, b) => Number(b.planned > 0) - Number(a.planned > 0) || a.executionRate - b.executionRate || a.sector.localeCompare(b.sector, "pt-BR"),
  );
  const risk = employeeRisk(data);
  const priority = risk.filter((item) => item.score > 0);
  const priorityCount = priority.length;
  const visiblePriorities = priority.slice(0, showMorePriorities ? 7 : 3);
  const highRiskCount = priority.filter((item) => item.level === "Alto").length;
  const first = user?.nome?.split(" ")[0] || "Inspetor";
  const isMaster = Boolean(user?.isMaster || user?.accessLevel === "master");
  const permissionCount = user?.permissions?.length ?? 0;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Maceio" }).format(now));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const updatedAt = now.toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Maceio",
  });

  const quick = [
    { to: "/equipe", label: "Equipe", icon: Users, accent: "#2563eb" },
    { to: "/analytics", label: "Analytics", icon: BarChart3, accent: "#C8102E" },
    { to: "/cronograma", label: "Cronograma", icon: CalendarDays, accent: "#f59e0b" },
    { to: "/ocorrencias", label: "Ocorrências", icon: AlertTriangle, accent: "#ef4444" },
    { to: "/provas", label: "Provas", icon: FileText, accent: "#2563eb" },
    { to: "/risco", label: "Zona de Risco", icon: Target, accent: "#f59e0b" },
    { to: "/individual", label: "Análise Individual", icon: BarChart3, accent: "#3b82f6" },
    { to: "/relatorios", label: "Relatórios", icon: FileSpreadsheet, accent: "#C8102E" },
  ];
  const visibleQuick = showAllQuick ? quick : quick.slice(0, 4);

  const performanceOverview = data.employees
    .filter((employee) => employee.status === "Ativo" && employee.access_profile !== "Inspetor")
    .map((employee) => {
      const attempts = data.attempts.filter((attempt) => attempt.matricula === employee.matricula);
      const passed = attempts.filter((attempt) => attempt.passed).length;
      const averageScore = attempts.length
        ? Math.round((attempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / attempts.length) * 10) / 10
        : 0;
      const approvalRate = attempts.length ? Math.round((passed / attempts.length) * 100) : 0;
      const cron = data.cronograma.filter((entry) => entry.employee_id === employee.id || entry.employee_matricula === employee.matricula);
      const realized = cron.filter((entry) => entry.status === "Realizado").length;
      const executionRate = cron.length ? Math.round((realized / cron.length) * 100) : 0;
      return { employee, attempts: attempts.length, averageScore, approvalRate, executionRate };
    })
    .sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name, "pt-BR"))
    .slice(0, 4);

  return (
    <div className="segempat-admin-dashboard mx-auto w-full max-w-[1536px] space-y-5 pb-10">
      <section
        className="segempat-admin-hero relative overflow-hidden rounded-[1.75rem] px-5 py-6 sm:px-6 md:px-7 lg:px-8 lg:py-7"
        style={{
          background: "var(--segempat-hero-bg)",
          border: "1px solid var(--segempat-hero-border)",
          boxShadow: "var(--segempat-hero-shadow)",
        }}
      >
        <div className="segempat-admin-hero-grid pointer-events-none absolute inset-0" />
        <div className="segempat-admin-hero-glow pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full" />

        <div className="segempat-admin-hero-content relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="segempat-admin-hero-copy min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="segempat-admin-hero-eyebrow text-[11px] font-bold uppercase tracking-[.14em]">
                {isMaster ? "Comando Master" : "Visão operacional"} · {year}
              </p>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-[2rem] xl:text-[2.2rem]">{greeting}, {first}</h1>
            <p className="segempat-admin-hero-description mt-2 max-w-3xl text-xs leading-5 sm:text-sm">
              {isMaster
                ? "Operação e governança reunidas em uma visão executiva, com acesso integral às áreas administrativas do SEGEMPAT."
                : "Acompanhe equipe, execução, desempenho e prioridades da operação em uma única visão."}
            </p>
            <p className="segempat-admin-hero-updated mt-2 text-[11px] capitalize">Atualizado em {updatedAt}</p>

            <div className="segempat-admin-hero-badges mt-5 flex flex-wrap gap-2">
              {isMaster && (
                <span className="segempat-admin-badge segempat-admin-badge--master inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold">
                  <Crown className="h-3.5 w-3.5" /> Administrador Master
                </span>
              )}
              <span
                className="segempat-admin-badge inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                data-state={priorityCount ? "attention" : "ok"}
              >
                <AlertTriangle className="h-3.5 w-3.5" /> {priorityCount} em acompanhamento
              </span>
            </div>
          </div>

          <div className="segempat-admin-hero-actions grid gap-2 sm:grid-cols-[auto_auto_44px] xl:justify-end">
            <Link
              to={"/atencao" as never}
              className="segempat-admin-hero-action segempat-admin-hero-action--primary inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold"
            >
              <BellRing className="h-4 w-4" /> Central de Atenção
            </Link>
            <Link
              to="/tv"
              className="segempat-admin-hero-action segempat-admin-hero-action--secondary inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
            >
              <Maximize2 className="h-4 w-4" /> Painel TV
            </Link>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="segempat-admin-hero-action segempat-admin-hero-action--icon flex h-11 items-center justify-center rounded-xl transition-opacity disabled:opacity-50"
              aria-label="Atualizar dashboard"
              title="Atualizar dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </section>

      {isMaster && (
        <SystemSurface className="segempat-admin-governance overflow-hidden">
          <SystemSectionHeader
            icon={Crown}
            title="Central de Governança Master"
            description="Atalhos de alto privilégio separados das rotinas operacionais para reduzir ruído e acelerar decisões administrativas."
            accent="#f59e0b"
            action={
              <button
                type="button"
                onClick={() => setShowGovernance((current) => !current)}
                aria-expanded={showGovernance}
                aria-controls="segempat-master-governance"
                className="segempat-admin-governance-toggle inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] transition-colors"
                title={`${permissionCount} permissões efetivas`}
              >
                {showGovernance ? "Ocultar" : "Abrir"}
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showGovernance ? "rotate-90" : ""}`} />
              </button>
            }
          />
          <div id="segempat-master-governance" className={`${showGovernance ? "grid" : "hidden"} gap-3 p-4 md:grid-cols-3 lg:p-5`}>
            <Link to="/acessos" className="segempat-admin-governance-card group rounded-xl p-4 transition-[transform,border-color,box-shadow] duration-150">
              <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)" }}><KeyRound className="h-4 w-4" style={{ color: "var(--accent)" }} /></span><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--text-4)" }} /></div>
              <p className="mt-3 text-sm font-black" style={{ color: "var(--text-1)" }}>Acessos e privilégios</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>Contas, primeiro acesso, recuperação e permissões administrativas.</p>
            </Link>
            <Link to="/auditoria" className="segempat-admin-governance-card group rounded-xl p-4 transition-[transform,border-color,box-shadow] duration-150">
              <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(37,99,235,.10)" }}><History className="h-4 w-4 text-blue-600" /></span><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--text-4)" }} /></div>
              <p className="mt-3 text-sm font-black" style={{ color: "var(--text-1)" }}>Auditoria</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>Rastreabilidade de acessos, mudanças sensíveis e eventos administrativos.</p>
            </Link>
            <Link to="/documento-seguranca" className="segempat-admin-governance-card group rounded-xl p-4 transition-[transform,border-color,box-shadow] duration-150">
              <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(16,185,129,.10)" }}><Shield className="h-4 w-4 text-emerald-600" /></span><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--text-4)" }} /></div>
              <p className="mt-3 text-sm font-black" style={{ color: "var(--text-1)" }}>Documento de Segurança</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>Controles implementados, arquitetura e pontos de homologação.</p>
            </Link>
          </div>
        </SystemSurface>
      )}

      <div className="segempat-admin-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SystemMetricCard
          label="Equipe ativa"
          value={metrics.activeEmployees}
          icon={Users}
          detail={`${metrics.pending} pendência${metrics.pending === 1 ? "" : "s"} no cronograma`}
          accent="#2563eb"
        />
        <SystemMetricCard
          label="Taxa de aprovação"
          value={`${metrics.approvalRate}%`}
          icon={Shield}
          detail={`${metrics.passed} aprovações em ${metrics.attempts} tentativa${metrics.attempts === 1 ? "" : "s"}`}
          accent="#10b981"
        />
        <SystemMetricCard
          label="Média geral"
          value={metrics.averageScore}
          icon={BarChart3}
          detail={metrics.attempts ? `Desempenho consolidado de ${metrics.attempts} tentativa${metrics.attempts === 1 ? "" : "s"}` : "Ainda sem tentativas registradas"}
          accent="#f59e0b"
        />
        <SystemMetricCard
          label="Execução anual"
          value={`${metrics.executionRate}%`}
          icon={Target}
          detail={`${metrics.realized} de ${metrics.planned} atividades realizadas`}
          accent="#C8102E"
        />
      </div>

      <div className="segempat-admin-primary-grid grid gap-4 xl:grid-cols-12">
        <SystemSurface className="segempat-admin-sector-card overflow-hidden xl:col-span-7">
          <SystemSectionHeader
            icon={BarChart3}
            title="Execução por setor"
            description="Setores com menor execução aparecem primeiro para facilitar a priorização."
          />

          {sectorOverview.length === 0 ? (
            <div className="segempat-empty-state py-10 text-center">
              <BarChart3 className="mx-auto h-9 w-9" style={{ color: "var(--text-4)" }} />
              <p className="mt-2 text-sm font-bold" style={{ color: "var(--text-2)" }}>Sem dados por setor</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Os indicadores aparecem quando houver lançamentos no Cronograma.</p>
            </div>
          ) : (
            <div className="space-y-4 p-4 lg:p-5">
              {sectorOverview.map((sector, index) => {
                const color = SECTOR_COLORS[index % SECTOR_COLORS.length];
                return (
                  <div key={sector.sector} className="segempat-admin-sector-row rounded-xl p-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{sector.sector}</p>
                        <p className="mt-1 text-[11px]" style={{ color: "var(--text-4)" }}>
                          {sector.employees} profissional{sector.employees === 1 ? "" : "is"} · {sector.realized}/{sector.planned} atividades
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black" style={{ color }}>{sector.executionRate}%</span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--bg-surface)" }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${Math.max(sector.executionRate > 0 ? 3 : 0, Math.min(100, sector.executionRate))}%`, background: color }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold" style={{ color: "var(--text-4)" }}>
                      <span>{sector.attempts} tentativa{sector.attempts === 1 ? "" : "s"}</span>
                      <span>{sector.approvalRate}% aprovação</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SystemSurface>

        <SystemSurface className="segempat-admin-priority-card overflow-hidden xl:col-span-5">
          <SystemSectionHeader
            icon={AlertTriangle}
            title="Prioridades operacionais"
            description="Profissionais com pendências, atrasos ou reprovações que pedem acompanhamento."
            accent="#f59e0b"
            action={
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                {highRiskCount > 0 && <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: "rgba(225,29,72,.10)", color: "#fb7185" }}>{highRiskCount} alto risco</span>}
                <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{priorityCount} total</span>
              </div>
            }
          />

          <div className="max-h-[470px] space-y-2 overflow-y-auto p-3 lg:p-4">
            {visiblePriorities.map((item) => (
              <Link key={item.employee.id} to="/individual">
                <div className="segempat-admin-priority-row rounded-xl p-3.5 transition-[transform,border-color,box-shadow] duration-150">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{item.employee.full_name}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-4)" }}>{item.employee.sector}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-black"
                      style={{
                        color: item.level === "Alto" ? "#fb7185" : item.level === "Médio" ? "#f59e0b" : "#60a5fa",
                        background: item.level === "Alto" ? "rgba(225,29,72,.10)" : item.level === "Médio" ? "rgba(245,158,11,.10)" : "rgba(59,130,246,.10)",
                      }}
                    >
                      {item.level}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="segempat-admin-priority-stat rounded-lg px-2 py-2">
                      <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{item.pending}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--text-4)" }}>Pendentes</p>
                    </div>
                    <div className="segempat-admin-priority-stat rounded-lg px-2 py-2">
                      <p className="text-sm font-black text-amber-500">{item.overdue}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--text-4)" }}>Atrasadas</p>
                    </div>
                    <div className="segempat-admin-priority-stat rounded-lg px-2 py-2">
                      <p className="text-sm font-black text-red-500">{item.failed}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--text-4)" }}>Reprovações</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {priorityCount === 0 && (
              <div className="segempat-empty-state py-10 text-center">
                <Shield className="mx-auto h-9 w-9 text-emerald-500" />
                <p className="mt-2 text-sm font-bold text-emerald-500">Sem alertas relevantes</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Nenhum profissional exige ação neste momento.</p>
              </div>
            )}
          </div>

          <div className="segempat-admin-card-footer flex items-center justify-between gap-3 border-t px-4 py-3 lg:px-5">
            <Link to="/risco" className="inline-flex items-center gap-1 text-xs font-black" style={{ color: "var(--accent)" }}>
              Abrir Zona de Risco <ChevronRight className="h-3 w-3" />
            </Link>
            {priorityCount > 3 && (
              <button
                type="button"
                onClick={() => setShowMorePriorities((current) => !current)}
                aria-expanded={showMorePriorities}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-black"
                style={{ color: "var(--text-3)" }}
              >
                {showMorePriorities ? "Mostrar menos" : "Ver mais"}
                <ChevronRight className={`h-3 w-3 transition-transform ${showMorePriorities ? "-rotate-90" : "rotate-90"}`} />
              </button>
            )}
          </div>
        </SystemSurface>
      </div>

      <SystemSurface className="segempat-admin-quick p-3.5 lg:p-4">
        <div className="mb-3 flex items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-2">
            <span className="segempat-admin-quick-heading-icon flex h-8 w-8 items-center justify-center rounded-lg">
              <Target className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className="segempat-admin-quick-title text-xs font-bold uppercase tracking-[.06em]">Acesso rápido</h2>
              <p className="segempat-admin-quick-description hidden text-[10px] sm:block">Atalhos para as rotinas mais usadas pela Inspetoria.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAllQuick((current) => !current)}
            aria-expanded={showAllQuick}
            className="segempat-admin-quick-toggle inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] transition-colors"
          >
            {showAllQuick ? "Mostrar menos" : "Ver todos"}
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAllQuick ? "-rotate-90" : "rotate-90"}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {visibleQuick.map(({ to, label, icon: Icon, accent }) => (
            <Link key={to} to={to as never} className="min-w-0">
              <div
                className="segempat-admin-quick-tile group relative flex h-full min-h-[92px] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl p-3 text-center transition-[border-color,transform,box-shadow] duration-150"
              >
                <div className="absolute -right-7 -top-7 h-16 w-16 rounded-full opacity-[.08]" style={{ background: accent }} />
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${accent}12`, border: `1px solid ${accent}20` }}>
                  <Icon className="h-4 w-4" style={{ color: accent }} />
                </div>
                <span className="max-w-full text-[11px] font-bold leading-4" style={{ color: "var(--text-2)" }}>{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </SystemSurface>

      <SystemSurface className="segempat-admin-performance overflow-hidden">
        <SystemSectionHeader
          icon={BarChart3}
          title="Visão de desempenho por colaborador"
          description="Leitura descritiva de aprovação, média e execução, sem classificação ou ranking entre profissionais."
          accent="#2563eb"
          action={<span className="hidden text-[11px] font-semibold sm:block" style={{ color: "var(--text-4)" }}>{performanceOverview.length} exibidos</span>}
        />

        {performanceOverview.length === 0 ? (
          <div className="segempat-empty-state p-8 text-center">
            <BarChart3 className="mx-auto h-8 w-8" style={{ color: "var(--text-4)" }} />
            <p className="mt-2 text-sm font-bold" style={{ color: "var(--text-2)" }}>Sem dados de desempenho disponíveis</p>
          </div>
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4 lg:p-4">
            {performanceOverview.map((item) => (
              <Link key={item.employee.id} to="/individual" className="min-w-0">
                <div
                  className="segempat-admin-performance-tile h-full rounded-xl p-4 text-left transition-[transform,border-color,box-shadow] duration-150"
                >
                  <div className="flex items-start justify-end">
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--text-4)" }} />
                  </div>
                  <p className="mt-3 truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{item.employee.full_name}</p>
                  <p className="mt-1 truncate text-xs" style={{ color: "var(--text-4)" }}>{item.employee.sector}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-lg px-2.5 py-1 text-xs font-black text-amber-500" style={{ background: "rgba(245,158,11,.10)" }}>
                      {item.attempts ? `${item.averageScore.toFixed(1)} média` : `${item.executionRate}% execução`}
                    </span>
                    {item.attempts > 0 && (
                      <span className="rounded-lg px-2.5 py-1 text-xs font-black text-emerald-500" style={{ background: "rgba(16,185,129,.09)" }}>
                        {item.approvalRate}% aprovação
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SystemSurface>
    </div>
  );
}
