import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Award,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  History,
  IdCard,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate, listAvailableExams, listMyAttempts } from "@/lib/exams";
import { getMyTrainingSchedule, type TrainingCycleStatus } from "@/lib/training-schedules";
import { listMyTrainingActivities } from "@/lib/training-activities";
import { getCurrentEmployeeByAuth } from "@/lib/insights";
import { useCurrentUser } from "@/lib/useCurrentUser";

const LEVELS: Array<{ name: string; icon: LucideIcon; helper: string }> = [
  { name: "Recruta", icon: Target, helper: "Início da jornada" },
  { name: "Patrulheiro", icon: Shield, helper: "Base consolidada" },
  { name: "Sentinela", icon: Sparkles, helper: "Evolução consistente" },
  { name: "Especialista", icon: Award, helper: "Alto domínio" },
  { name: "Elite", icon: Shield, helper: "Nível máximo" },
];

const QUICK_ACTIONS = [
  { to: "/progresso" as const, label: "Meu progresso", description: "Indicadores e evolução", icon: TrendingUp },
  { to: "/treinamentos" as const, label: "Academia SEGEMPAT", description: "Treinos e atividades", icon: GraduationCap },
  { to: "/provas" as const, label: "Provas", description: "Avaliações disponíveis", icon: ClipboardCheck },
  { to: "/certificados" as const, label: "Certificados", description: "Comprovantes emitidos", icon: Award },
];

function sortDate(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDate(value: string | null | undefined) {
  return value ? fmtDate(value) : "—";
}

function cycleTone(status: TrainingCycleStatus | null | undefined) {
  if (status === "Vencido") return { color: "#ef4444", background: "rgba(239,68,68,.10)", icon: AlertCircle };
  if (status === "Próximo ao vencimento") return { color: "#f59e0b", background: "rgba(245,158,11,.10)", icon: CalendarClock };
  if (status === "Em dia") return { color: "#10b981", background: "rgba(16,185,129,.10)", icon: CheckCircle2 };
  return { color: "var(--text-3)", background: "var(--bg-surface-2)", icon: CalendarClock };
}

export function MyProfileWorkspace() {
  const { data: user } = useCurrentUser();
  const employee = useQuery({ queryKey: ["current-employee-profile"], queryFn: getCurrentEmployeeByAuth, staleTime: 60_000 });
  const attempts = useQuery({ queryKey: ["exam-attempts-my"], queryFn: listMyAttempts });
  const activities = useQuery({ queryKey: ["training-activities-my"], queryFn: listMyTrainingActivities });
  const exams = useQuery({ queryKey: ["exams-available-profile"], queryFn: listAvailableExams });
  const cycle = useQuery({ queryKey: ["training-schedule-my"], queryFn: getMyTrainingSchedule });

  const loading = employee.isLoading || attempts.isLoading || activities.isLoading || exams.isLoading || cycle.isLoading;
  const criticalError = employee.isError || attempts.isError || activities.isError || cycle.isError;

  const examMap = useMemo(() => new Map((exams.data ?? []).map((exam) => [exam.id, exam.title])), [exams.data]);
  const rows = useMemo(
    () => [...(attempts.data ?? [])].sort((a, b) => sortDate(b.finished_at || b.created_at) - sortDate(a.finished_at || a.created_at)),
    [attempts.data],
  );
  const activityRows = useMemo(
    () => [...(activities.data ?? [])].sort((a, b) => sortDate(b.created_at) - sortDate(a.created_at)),
    [activities.data],
  );

  const currentEmployee = employee.data;
  const currentCycle = cycle.data;
  const level = Math.min(5, Math.max(1, Number(currentEmployee?.level || 1)));
  const levelMeta = LEVELS[level - 1];
  const LevelIcon = levelMeta.icon;
  const passed = rows.filter((row) => row.passed).length;
  const approvalRate = rows.length ? Math.round((passed / rows.length) * 100) : 0;
  const average = rows.length ? rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length : 0;
  const displayName = currentEmployee?.full_name || user?.nome || "Usuário SEGEMPAT";
  const matricula = currentEmployee?.matricula || user?.matricula || "—";
  const sector = currentEmployee?.sector || user?.setor || "Setor não informado";
  const accessLabel = user?.accessLevelLabel || currentEmployee?.access_profile || "Operacional";
  const initial = displayName.trim().charAt(0).toUpperCase() || "S";
  const cycleStatus = currentCycle?.status ?? null;
  const cycleVisual = cycleTone(cycleStatus);
  const CycleIcon = cycleVisual.icon;
  const points = Number(currentEmployee?.points || 0);

  const retryAll = () => {
    void Promise.all([
      employee.refetch(),
      attempts.refetch(),
      activities.refetch(),
      exams.refetch(),
      cycle.refetch(),
    ]);
  };

  if (loading) return <ProfileLoading />;

  if (criticalError) {
    return (
      <div className="segempat-profile-page mx-auto pb-10">
        <section
          className="rounded-3xl p-6 text-center md:p-8"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
          role="alert"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(239,68,68,.10)", color: "#ef4444" }}>
            <AlertCircle className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-black md:text-2xl" style={{ color: "var(--text-1)" }}>Não foi possível carregar seu perfil</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-3)" }}>
            Os indicadores não serão exibidos com valores incompletos. Tente novamente para consultar seu cadastro, histórico e ciclo de treinamento.
          </p>
          <Button className="mt-5" onClick={retryAll}>
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="segempat-profile-page mx-auto space-y-5 pb-10">
      <section
        className="segempat-profile-hero relative overflow-hidden rounded-[1.75rem] p-5 md:p-7 xl:p-8"
        style={{
          background: "linear-gradient(135deg,#171118 0%,#2b0b13 52%,#111216 100%)",
          border: "1px solid rgba(200,16,46,.28)",
          boxShadow: "0 14px 38px rgba(0,0,0,.17)",
        }}
        aria-labelledby="meu-perfil-title"
      >
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.22),transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-28 left-[28%] h-52 w-52 rounded-full" style={{ background: "radial-gradient(circle,rgba(245,158,11,.08),transparent 72%)" }} />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.4rem] text-3xl font-black text-white"
              style={{ background: "linear-gradient(135deg,#C8102E,#e65a2f)", boxShadow: "0 8px 22px rgba(200,16,46,.28)" }}
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-white/45">Meu perfil · SEGEMPAT</p>
              <h1 id="meu-perfil-title" className="mt-1 break-words text-2xl font-black text-white md:text-3xl xl:text-4xl">{displayName}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <IdentityPill icon={IdCard}>Mat. {matricula}</IdentityPill>
                <IdentityPill icon={UserRound}>{sector}</IdentityPill>
                <IdentityPill icon={Shield}>{accessLabel}</IdentityPill>
              </div>
            </div>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-2xl px-4 py-3.5" style={{ background: "rgba(255,255,255,.065)", border: "1px solid rgba(255,255,255,.09)" }}>
              <div className="flex items-center gap-2 text-white/45"><LevelIcon className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[.15em]">Nível {level}</span></div>
              <p className="mt-2 text-lg font-black text-white">{levelMeta.name}</p>
              <p className="mt-0.5 text-[11px] text-white/45">{levelMeta.helper}</p>
            </div>
            <div className="rounded-2xl px-4 py-3.5" style={{ background: "rgba(255,255,255,.065)", border: "1px solid rgba(255,255,255,.09)" }}>
              <div className="flex items-center gap-2 text-white/45"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[.15em]">Pontuação</span></div>
              <p className="mt-2 text-lg font-black text-white">{points.toLocaleString("pt-BR")} pontos</p>
              <p className="mt-0.5 text-[11px] text-white/45">Atualizada pelo desempenho registrado</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="panorama-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em]" style={{ color: "var(--text-4)" }}>Desempenho individual</p>
            <h2 id="panorama-title" className="mt-1 text-lg font-black md:text-xl" style={{ color: "var(--text-1)" }}>Seu panorama</h2>
          </div>
          <p className="text-xs" style={{ color: "var(--text-4)" }}>Dados vinculados à sua matrícula</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Atividades" value={rows.length + activityRows.length} helper={`${rows.length} prova(s) · ${activityRows.length} treino(s)`} icon={FileText} tone="#3b82f6" />
          <Metric label="Aprovação" value={`${approvalRate}%`} helper={`${passed} de ${rows.length} prova(s)`} icon={CheckCircle2} tone="#10b981" />
          <Metric label="Média nas provas" value={rows.length ? average.toFixed(1) : "—"} helper={rows.length ? "Média das tentativas" : "Sem tentativas"} icon={TrendingUp} tone="#f59e0b" />
          <Metric label="Ciclo" value={cycleStatus || "Não configurado"} helper={currentCycle?.window_end ? `Até ${safeDate(currentCycle.window_end)}` : "Sem vencimento cadastrado"} icon={CalendarClock} tone={String(cycleVisual.color)} compact />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="segempat-profile-card rounded-3xl p-4 md:p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }} aria-labelledby="atalhos-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.15em]" style={{ color: "var(--text-4)" }}>Acesso rápido</p>
              <h2 id="atalhos-title" className="mt-1 text-base font-black" style={{ color: "var(--text-1)" }}>Continue sua jornada</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => <QuickAction key={action.to} {...action} />)}
          </div>
        </section>

        <section className="segempat-profile-card rounded-3xl p-4 md:p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }} aria-labelledby="ciclo-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.15em]" style={{ color: "var(--text-4)" }}>Reciclagem e capacitação</p>
              <h2 id="ciclo-title" className="mt-1 text-base font-black" style={{ color: "var(--text-1)" }}>Ciclo de treinamento</h2>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: cycleVisual.background, color: cycleVisual.color }}><CycleIcon className="h-4 w-4" /></div>
          </div>

          <div className="mt-4 rounded-2xl p-3.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black" style={{ color: "var(--text-2)" }}>Situação atual</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: cycleVisual.background, color: cycleVisual.color }}>
                <CycleIcon className="h-3.5 w-3.5" /> {cycleStatus || "Não configurado"}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <CycleDetail label="Último treinamento" value={safeDate(currentCycle?.last_training_date)} />
              <CycleDetail label="Janela de início" value={safeDate(currentCycle?.window_start)} />
              <CycleDetail label="Vencimento" value={safeDate(currentCycle?.window_end)} />
              <CycleDetail label="Periodicidade" value={currentCycle?.cycle_days ? `${currentCycle.cycle_days} dias` : "—"} />
            </dl>
          </div>
        </section>
      </div>

      {exams.isError && (
        <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.22)" }} role="status">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs leading-5" style={{ color: "var(--text-3)" }}>
            Seu histórico foi carregado, mas os nomes de algumas provas não puderam ser consultados agora. As notas e situações continuam preservadas.
          </p>
        </div>
      )}

      <div className="segempat-profile-history-grid grid gap-4 xl:grid-cols-2">
        <HistoryPanel
          title="Histórico de provas"
          eyebrow="Avaliações formais"
          icon={ClipboardCheck}
          count={rows.length}
          emptyTitle="Nenhuma prova realizada"
          emptyDescription="Quando você concluir uma avaliação, ela aparecerá aqui com data, nota e situação."
          footer={rows.length > 8 ? <HistoryFooter count={rows.length} to="/progresso" label="Ver progresso completo" /> : null}
        >
          {rows.slice(0, 8).map((row) => (
            <div key={row.id} className="segempat-profile-history-row flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: row.passed ? "rgba(16,185,129,.10)" : "rgba(239,68,68,.10)", color: row.passed ? "#10b981" : "#ef4444" }}>
                {row.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" style={{ color: "var(--text-1)" }}>{examMap.get(row.exam_id) || "Avaliação"}</p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>{safeDate(row.finished_at || row.created_at)}</p>
              </div>
              <div className="segempat-profile-history-score text-right">
                <p className="text-base font-black" style={{ color: "var(--text-1)" }}>{Number(row.score || 0).toFixed(1)}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-black" style={{ color: row.passed ? "#10b981" : "#ef4444" }}>
                  {row.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {row.passed ? "Aprovado" : "Não aprovado"}
                </span>
              </div>
            </div>
          ))}
        </HistoryPanel>

        <HistoryPanel
          title="Atividades de treinamento"
          eyebrow="Prática contínua"
          icon={BookOpenCheck}
          count={activityRows.length}
          emptyTitle="Nenhuma atividade realizada"
          emptyDescription="Simuladores, testes rápidos e desafios concluídos aparecerão neste histórico."
          footer={activityRows.length > 8 ? <HistoryFooter count={activityRows.length} to="/progresso" label="Ver evolução completa" /> : null}
        >
          {activityRows.slice(0, 8).map((row) => (
            <div key={row.id} className="segempat-profile-history-row flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(245,158,11,.10)", color: "#f59e0b" }}>
                <BookOpenCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" style={{ color: "var(--text-1)" }}>{row.activity_title}</p>
                <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-4)" }}>{row.activity_type} · {safeDate(row.created_at)}</p>
              </div>
              <div className="segempat-profile-history-score text-right">
                <p className="text-base font-black" style={{ color: "var(--text-1)" }}>{Number(row.score || 0).toFixed(1)}</p>
                <p className="text-[10px] font-black text-amber-500">+{Number(row.points_earned || 0)} XP</p>
              </div>
            </div>
          ))}
        </HistoryPanel>
      </div>

      <section className="segempat-profile-card flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }} aria-label="Origem dos dados do perfil">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><IdCard className="h-4 w-4" /></div>
          <div>
            <p className="text-xs font-black" style={{ color: "var(--text-2)" }}>Dados de identificação protegidos</p>
            <p className="mt-0.5 text-[11px] leading-5" style={{ color: "var(--text-4)" }}>Nome, matrícula e setor vêm do cadastro operacional. Se houver divergência, solicite a correção à Inspetoria.</p>
          </div>
        </div>
        <Link to="/progresso" className="inline-flex shrink-0 items-center gap-1 text-xs font-black" style={{ color: "var(--accent)" }}>
          Meu progresso <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  );
}

function IdentityPill({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white/70" style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.08)" }}>
      <Icon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{children}</span>
    </span>
  );
}

function Metric({ label, value, helper, icon: Icon, tone, compact = false }: { label: string; value: string | number; helper: string; icon: LucideIcon; tone: string; compact?: boolean }) {
  return (
    <section className="segempat-profile-card rounded-2xl p-4 md:p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p>
          <p className={`mt-2 font-black ${compact ? "break-words text-sm leading-5 sm:text-base" : "text-2xl md:text-[1.7rem]"}`} style={{ color: "var(--text-1)" }}>{value}</p>
          <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--text-4)" }}>{helper}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tone}18`, color: tone }}><Icon className="h-4 w-4" /></div>
      </div>
    </section>
  );
}

function QuickAction({ to, label, description, icon: Icon }: (typeof QUICK_ACTIONS)[number]) {
  return (
    <Link to={to} className="segempat-profile-action flex items-center gap-3 rounded-2xl p-3.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "inherit" }}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{label}</p>
        <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-4)" }}>{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-4)" }} />
    </Link>
  );
}

function CycleDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <dt className="text-[10px] font-bold uppercase tracking-[.08em]" style={{ color: "var(--text-4)" }}>{label}</dt>
      <dd className="mt-1 font-bold" style={{ color: "var(--text-2)" }}>{value}</dd>
    </div>
  );
}

function HistoryPanel({ title, eyebrow, icon: Icon, count, emptyTitle, emptyDescription, footer, children }: { title: string; eyebrow: string; icon: LucideIcon; count: number; emptyTitle: string; emptyDescription: string; footer: ReactNode; children: ReactNode }) {
  return (
    <section className="segempat-profile-card overflow-hidden rounded-3xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center gap-3 px-4 py-4 md:px-5" style={{ background: "var(--bg-surface-2)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[.13em]" style={{ color: "var(--text-4)" }}>{eyebrow}</p>
          <h2 className="mt-0.5 truncate text-sm font-black md:text-base" style={{ color: "var(--text-1)" }}>{title}</h2>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-3)" }}>{count}</span>
      </div>
      {count === 0 ? <EmptyHistory title={emptyTitle} description={emptyDescription} /> : <div>{children}</div>}
      {footer}
    </section>
  );
}

function EmptyHistory({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)" }}><History className="h-4 w-4" /></div>
      <p className="mt-3 text-sm font-black" style={{ color: "var(--text-2)" }}>{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5" style={{ color: "var(--text-4)" }}>{description}</p>
    </div>
  );
}

function HistoryFooter({ count, to, label }: { count: number; to: "/progresso"; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-5" style={{ background: "var(--bg-surface-2)", borderTop: "1px solid var(--border-subtle)" }}>
      <p className="text-[11px]" style={{ color: "var(--text-4)" }}>Mostrando os 8 registros mais recentes de {count}.</p>
      <Link to={to} className="inline-flex items-center gap-1 text-[11px] font-black" style={{ color: "var(--accent)" }}>{label}<ChevronRight className="h-3.5 w-3.5" /></Link>
    </div>
  );
}

function ProfileLoading() {
  return (
    <div className="segempat-profile-page mx-auto space-y-5 pb-10" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando seu perfil</span>
      <div className="h-52 animate-pulse rounded-[1.75rem]" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => <div key={index} className="h-80 animate-pulse rounded-3xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }} />)}
      </div>
    </div>
  );
}
