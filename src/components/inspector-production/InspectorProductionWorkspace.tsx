import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileImage,
  FileText,
  FilterX,
  History,
  ImagePlus,
  MapPin,
  Medal,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SystemDashboardSkeleton,
  SystemMetricCard,
  SystemPageHero,
  SystemSectionHeader,
  SystemSurface,
} from "@/components/system/SystemUI";
import {
  addInspectorProductionAttachment,
  cancelInspectorProductionEntry,
  createInspectorProductionEntry,
  getInspectorProductionEntry,
  getInspectorProductionMembership,
  getInspectorProductionSummary,
  inspectorProductionAttachmentUrl,
  listInspectorProductionEntries,
  listInspectorProductionSuggestions,
  type InspectorProductionEntry,
  type InspectorProductionStatus,
  type InspectorProductionSummary,
} from "@/lib/inspector-production";
import { addOperationalDays, operationalDate, operationalYear } from "@/lib/operational-time";
import { useCurrentUser } from "@/lib/useCurrentUser";

type WorkspaceTab = "dashboard" | "registrar" | "historico" | "relatorio";

interface PendingEvidence {
  id: string;
  name: string;
  data_url: string;
  size: number;
  caption: string;
}

const MAX_EVIDENCES = 5;
const MAX_EVIDENCE_BYTES = 1_250_000;
const PAGE_SIZE = 50;

function displayDateTime(value?: string | null) {
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

function displayDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function periodLabel(from: string, to: string) {
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  return `${date(from)} a ${date(to)}`;
}

function dateSpan(from: string, to: string) {
  return Math.max(0, Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000));
}

function balanceState(summary: InspectorProductionSummary) {
  const active = summary.ranking.filter((row) => row.total > 0);
  if (summary.totals.executions < Math.max(6, summary.ranking.length * 2)) {
    return { label: "Base em formação", detail: "Ainda há poucos registros no período para interpretar a distribuição com segurança.", tone: "#64748b" };
  }
  if (active.length < summary.ranking.length) {
    return { label: "Participação incompleta", detail: "Há integrante configurado sem execução registrada no período.", tone: "#f59e0b" };
  }
  const shares = active.map((row) => row.share);
  const spread = Math.max(...shares) - Math.min(...shares);
  if (spread <= 15) return { label: "Distribuição equilibrada", detail: "As execuções registradas estão relativamente distribuídas entre os inspetores.", tone: "#10b981" };
  if (spread <= 30) return { label: "Distribuição em atenção", detail: "Existe diferença relevante de participação registrada entre os inspetores.", tone: "#f59e0b" };
  return { label: "Concentração elevada", detail: "Uma parcela significativa das execuções registradas está concentrada em parte da equipe.", tone: "#C8102E" };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Falha ao ler a imagem"));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler a imagem"));
    reader.readAsDataURL(file);
  });
}

async function prepareEvidenceFiles(files: FileList | null, available: number) {
  if (!files?.length || available <= 0) return [] as PendingEvidence[];
  const accepted: PendingEvidence[] = [];
  const selected = Array.from(files).slice(0, available);
  if (files.length > available) toast.warning(`Somente ${available} evidência(s) cabem neste registro.`);

  for (const file of selected) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error(`${file.name}: use PNG ou JPEG`);
      continue;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error(`${file.name}: máximo de 1,25 MB`);
      continue;
    }
    accepted.push({
      id: crypto.randomUUID(),
      name: file.name,
      data_url: await readFileAsDataUrl(file),
      size: file.size,
      caption: "",
    });
  }
  return accepted;
}

function rankAccent(rank: number) {
  if (rank === 1) return "#C8A000";
  if (rank === 2) return "#64748b";
  if (rank === 3) return "#b45309";
  return "#C8102E";
}

function aggregateTimeline(summary: InspectorProductionSummary) {
  const monthly = dateSpan(summary.period.from, summary.period.to) > 62;
  const buckets = new Map<string, number>();
  for (const row of summary.timeline) {
    const key = monthly ? row.day.slice(0, 7) : row.day;
    buckets.set(key, (buckets.get(key) ?? 0) + row.total);
  }
  return Array.from(buckets.entries()).map(([key, total]) => ({ key, total })).slice(-24);
}

function timelineLabel(key: string) {
  if (/^\d{4}-\d{2}$/.test(key)) {
    return new Date(`${key}-01T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "short" }).replace(".", "");
  }
  return key.slice(8, 10) + "/" + key.slice(5, 7);
}

export function InspectorProductionWorkspace() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const today = operationalDate();
  const year = operationalYear();
  const [tab, setTab] = useState<WorkspaceTab>("dashboard");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);

  const membership = useQuery({
    queryKey: ["inspector-production-membership"],
    queryFn: getInspectorProductionMembership,
    staleTime: 60_000,
  });
  const summary = useQuery({
    queryKey: ["inspector-production-summary", from, to],
    queryFn: () => getInspectorProductionSummary(from, to),
    staleTime: 15_000,
  });

  const [historySearchDraft, setHistorySearchDraft] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyEmployee, setHistoryEmployee] = useState("");
  const [historyCategory, setHistoryCategory] = useState("");
  const [historyStatus, setHistoryStatus] = useState<InspectorProductionStatus | "">("");
  const [historyEvidence, setHistoryEvidence] = useState<"with" | "without" | "">("");
  const [historyOffset, setHistoryOffset] = useState(0);

  useEffect(() => {
    setHistoryOffset(0);
  }, [from, to, historyEmployee, historyCategory, historyStatus, historyEvidence, historySearch]);

  const historyQuery = useQuery({
    queryKey: ["inspector-production-history", from, to, historyEmployee, historyCategory, historyStatus, historyEvidence, historySearch, historyOffset],
    queryFn: () => listInspectorProductionEntries({
      from,
      to,
      employee_id: historyEmployee || undefined,
      category: historyCategory || undefined,
      status: historyStatus,
      evidence: historyEvidence,
      search: historySearch || undefined,
      limit: PAGE_SIZE,
      offset: historyOffset,
    }),
    enabled: tab === "historico",
    staleTime: 10_000,
  });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Inspeção");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState("");
  const [pendingEvidence, setPendingEvidence] = useState<PendingEvidence[]>([]);

  const suggestions = useQuery({
    queryKey: ["inspector-production-suggestions", title.trim().toLowerCase()],
    queryFn: () => listInspectorProductionSuggestions(title.trim()),
    enabled: tab === "registrar" && title.trim().length >= 2,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await createInspectorProductionEntry({
        title: title.trim(),
        category,
        details: details.trim(),
        location: location.trim() || null,
      });
      const failures: string[] = [];
      for (const evidence of pendingEvidence) {
        try {
          await addInspectorProductionAttachment(created.id, {
            data_url: evidence.data_url,
            original_name: evidence.name,
            caption: evidence.caption.trim() || null,
          });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : evidence.name);
        }
      }
      return { created, evidenceFailures: failures };
    },
    onSuccess: async ({ evidenceFailures }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inspector-production-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["inspector-production-history"] }),
        queryClient.invalidateQueries({ queryKey: ["inspector-production-suggestions"] }),
      ]);
      setTitle("");
      setCategory(membership.data?.categories?.[0] || "Inspeção");
      setDetails("");
      setLocation("");
      setPendingEvidence([]);
      if (evidenceFailures.length) {
        toast.warning(`Atribuição registrada, mas ${evidenceFailures.length} evidência(s) não foram anexadas.`);
      } else {
        toast.success("Atribuição registrada na Produção da Inspetoria");
      }
      setTab("dashboard");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível registrar a atribuição"),
  });

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsQuery = useQuery({
    queryKey: ["inspector-production-entry", detailsId],
    queryFn: () => getInspectorProductionEntry(detailsId as string),
    enabled: Boolean(detailsId),
    staleTime: 10_000,
  });

  const [cancelTarget, setCancelTarget] = useState<InspectorProductionEntry | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!cancelTarget) throw new Error("Registro não selecionado");
      await cancelInspectorProductionEntry(cancelTarget.id, cancelReason.trim());
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inspector-production-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["inspector-production-history"] }),
        queryClient.invalidateQueries({ queryKey: ["inspector-production-entry"] }),
      ]);
      toast.success("Registro cancelado e preservado no histórico");
      setCancelTarget(null);
      setCancelReason("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível cancelar o registro"),
  });

  const setPreset = (preset: "today" | "month" | "30d" | "year") => {
    if (preset === "today") {
      setFrom(today);
      setTo(today);
    } else if (preset === "month") {
      setFrom(`${today.slice(0, 7)}-01`);
      setTo(today);
    } else if (preset === "30d") {
      setFrom(addOperationalDays(today, -29));
      setTo(today);
    } else {
      setFrom(`${year}-01-01`);
      setTo(today);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      membership.refetch(),
      summary.refetch(),
      tab === "historico" ? historyQuery.refetch() : Promise.resolve(),
    ]);
    toast.success("Dados atualizados");
  };

  const canRegister = Boolean(membership.data?.current_member?.active);
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof BarChart3 }> = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "registrar", label: "Registrar", icon: Plus },
    { id: "historico", label: "Histórico", icon: History },
    { id: "relatorio", label: "Relatório", icon: FileText },
  ];

  if (membership.isLoading || summary.isLoading) return <SystemDashboardSkeleton />;

  if (membership.isError || summary.isError) {
    return (
      <SystemSurface className="mx-auto max-w-2xl p-8 text-center" role="alert">
        <ShieldCheck className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-lg font-black" style={{ color: "var(--text-1)" }}>Produção da Inspetoria indisponível</h1>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-4)" }}>Não foi possível carregar os dados com segurança. Nenhum indicador é apresentado como zero enquanto a consulta estiver indisponível.</p>
        <Button variant="outline" className="mt-5" onClick={() => void refreshAll()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>
      </SystemSurface>
    );
  }

  const dashboard = summary.data as InspectorProductionSummary;
  const balance = balanceState(dashboard);
  const timeline = aggregateTimeline(dashboard);
  const maxTimeline = Math.max(1, ...timeline.map((point) => point.total));

  const currentMember = membership.data?.current_member ?? null;
  const canCancel = (entry: InspectorProductionEntry) => Boolean(
    user?.isMaster ||
    currentMember?.is_leader ||
    entry.executor_user_id === user?.id
  );

  const submitHistorySearch = () => setHistorySearch(historySearchDraft.trim());
  const clearHistoryFilters = () => {
    setHistorySearchDraft("");
    setHistorySearch("");
    setHistoryEmployee("");
    setHistoryCategory("");
    setHistoryStatus("");
    setHistoryEvidence("");
  };

  const downloadReportCsv = async () => {
    try {
      const rows: InspectorProductionEntry[] = [];
      let offset = 0;
      while (true) {
        const page = await listInspectorProductionEntries({ from, to, limit: 500, offset });
        rows.push(...page.items);
        if (page.next_offset === null) break;
        offset = page.next_offset;
        if (rows.length > 20_000) throw new Error("O período possui registros demais para uma única exportação. Reduza o período.");
      }
      const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const header = ["Data/hora", "Inspetor", "Matrícula", "Atribuição", "Categoria", "Descrição/resultado", "Local", "Evidências", "Situação", "Motivo cancelamento"];
      const csv = [
        header.map(escape).join(";"),
        ...rows.map((row) => [
          displayDateTime(row.executed_at),
          row.executor_name,
          row.executor_matricula,
          row.title,
          row.category,
          row.details,
          row.location ?? "",
          row.attachment_count,
          row.status,
          row.canceled_reason ?? "",
        ].map(escape).join(";")),
      ].join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `producao-inspetoria_${from}_a_${to}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Relatório CSV gerado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 pb-10">
      <SystemPageHero
        icon={ClipboardCheck}
        eyebrow="Gestão de desempenho · Inspetoria"
        title="Produção da Inspetoria"
        description={
          <>
            Registro rastreável das atribuições efetivamente executadas. O executor é vinculado à conta autenticada,
            a data/hora é definida pelo servidor e registros cancelados permanecem preservados no histórico.
          </>
        }
        actions={
          <>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => void refreshAll()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Button disabled={!canRegister} className="bg-[#e0142f] font-bold text-white hover:bg-[#C8102E]" onClick={() => setTab("registrar")}>
              <Plus className="mr-2 h-4 w-4" /> Registrar atribuição
            </Button>
          </>
        }
      />

      <SystemSurface className="p-2">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition-colors"
                style={active ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid rgba(200,16,46,.18)" } : { color: "var(--text-3)", border: "1px solid transparent" }}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>
      </SystemSurface>

      <SystemSurface className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Período analisado</p>
            <p className="mt-1 text-sm font-black" style={{ color: "var(--text-1)" }}>{periodLabel(from, to)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPreset("today")}>Hoje</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset("month")}>Este mês</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset("30d")}>30 dias</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset("year")}>Ano</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>De</span><Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Até</span><Input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
        </div>
      </SystemSurface>

      {membership.data?.members.length === 0 && (
        <SystemSurface className="border-dashed p-5">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-black" style={{ color: "var(--text-1)" }}>Equipe da Inspetoria ainda não vinculada</p>
              <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>
                O módulo está pronto para trabalhar somente com os inspetores oficialmente configurados. Enquanto os três integrantes não forem vinculados por matrícula, o sistema não libera lançamentos para evitar dados atribuídos à pessoa errada.
              </p>
            </div>
          </div>
        </SystemSurface>
      )}

      {tab === "dashboard" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SystemMetricCard label="Execuções registradas" value={dashboard.totals.executions} icon={ClipboardCheck} accent="#C8102E" detail="registros ativos no período" />
            <SystemMetricCard label="Equipe configurada" value={dashboard.totals.configured_inspectors} icon={Users} accent="#2563eb" detail={`${dashboard.totals.participating_inspectors} com participação no período`} />
            <SystemMetricCard label="Média por inspetor" value={dashboard.totals.average_per_inspector} icon={BarChart3} accent="#64748b" detail="média sobre a equipe configurada" />
            <SystemMetricCard label="Com evidência" value={dashboard.totals.with_evidence} icon={Camera} accent="#10b981" detail={`${dashboard.totals.evidence_rate}% das execuções ativas`} />
            <SystemMetricCard label="Sem evidência" value={dashboard.totals.without_evidence} icon={CameraOff} accent="#64748b" detail={`${dashboard.totals.without_evidence_rate}% das execuções ativas`} />
          </div>

          <SystemSurface className="p-4 lg:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(16,185,129,.08)", color: "#10b981" }}>
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Cobertura de evidências</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>
                    {dashboard.totals.with_evidence} de {dashboard.totals.executions} execuções ativas possuem imagem preservada. A ausência de evidência é informativa e não caracteriza irregularidade automaticamente.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={dashboard.totals.without_evidence === 0}
                onClick={() => {
                  setHistoryEvidence("without");
                  setHistoryStatus("Registrada");
                  setHistorySearch("");
                  setHistorySearchDraft("");
                  setTab("historico");
                }}
              >
                <CameraOff className="mr-2 h-4 w-4" /> Ver sem evidência
              </Button>
            </div>
            <div className="mt-4 overflow-hidden rounded-full" style={{ height: 10, background: "var(--bg-surface-3)" }} aria-label={`${dashboard.totals.evidence_rate}% das execuções possuem evidência`}>
              <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${dashboard.totals.evidence_rate}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold" style={{ color: "var(--text-4)" }}>
              <span>Com evidência: {dashboard.totals.evidence_rate}%</span>
              <span>Sem evidência: {dashboard.totals.without_evidence_rate}%</span>
            </div>
          </SystemSurface>

          <div className="grid gap-4 xl:grid-cols-12">
            <SystemSurface className="overflow-hidden xl:col-span-7">
              <SystemSectionHeader icon={Trophy} title="Ranking de Execuções Registradas" description="Ordenação objetiva pela quantidade de atribuições ativas registradas no período." accent="#C8A000" />
              <div className="space-y-3 p-4 lg:p-5">
                {dashboard.ranking.length === 0 ? (
                  <p className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>Nenhum inspetor configurado.</p>
                ) : dashboard.ranking.map((row) => {
                  const accent = rankAccent(row.rank);
                  const max = Math.max(1, dashboard.ranking[0]?.total ?? 1);
                  return (
                    <button key={row.employee_id} type="button" onClick={() => { setHistoryEmployee(row.employee_id); setTab("historico"); }} className="w-full rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black" style={{ background: `${accent}12`, border: `1px solid ${accent}30`, color: accent }}>{row.rank}º</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{row.name}</p>
                            {row.is_leader && <span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ background: "rgba(200,160,0,.10)", color: "#C8A000" }}>LÍDER</span>}
                          </div>
                          <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>Mat. {row.matricula} · {row.share}% da produção registrada</p>
                          <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}>
                            <div className="h-full rounded-full transition-[width]" style={{ width: `${(row.total / max) * 100}%`, background: accent }} />
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-2xl font-black" style={{ color: "var(--text-1)" }}>{row.total}</p>
                          <p className="text-[10px] font-semibold" style={{ color: "var(--text-4)" }}>{row.with_evidence} com · {row.without_evidence} sem evidência</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SystemSurface>

            <SystemSurface className="overflow-hidden xl:col-span-5">
              <SystemSectionHeader icon={Activity} title="Distribuição da carga registrada" description="Leitura da participação percentual, sem classificar qualidade ou mérito profissional." accent={balance.tone} />
              <div className="p-5">
                <div className="rounded-2xl p-4" style={{ background: `${balance.tone}0c`, border: `1px solid ${balance.tone}26` }}>
                  <p className="text-sm font-black" style={{ color: balance.tone }}>{balance.label}</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-3)" }}>{balance.detail}</p>
                </div>
                <div className="mt-5 space-y-4">
                  {dashboard.ranking.map((row) => (
                    <div key={row.employee_id}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-bold" style={{ color: "var(--text-2)" }}>{row.name}</span>
                        <span className="font-black tabular-nums" style={{ color: "var(--text-1)" }}>{row.share}%</span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}>
                        <div className="h-full rounded-full bg-[#C8102E]" style={{ width: `${row.share}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[11px] leading-5" style={{ color: "var(--text-4)" }}>
                  O indicador considera somente registros ativos no SEGEMPAT. Atividades não registradas não podem ser interpretadas como não realizadas.
                </p>
              </div>
            </SystemSurface>
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <SystemSurface className="overflow-hidden xl:col-span-7">
              <SystemSectionHeader icon={BarChart3} title="Evolução no período" description={dateSpan(from, to) > 62 ? "Volume consolidado por mês." : "Volume diário de execuções registradas."} accent="#2563eb" />
              <div className="p-5">
                {timeline.length === 0 ? <p className="py-12 text-center text-sm" style={{ color: "var(--text-4)" }}>Ainda não há execuções no período selecionado.</p> : (
                  <div className="overflow-x-auto pb-2">
                    <div className="flex h-56 min-w-max items-end gap-2">
                      {timeline.map((point) => (
                        <div key={point.key} className="flex w-11 flex-col items-center justify-end gap-2">
                          <span className="text-[10px] font-black tabular-nums" style={{ color: "var(--text-3)" }}>{point.total}</span>
                          <div className="flex h-40 w-full items-end rounded-xl p-1" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                            <div className="w-full rounded-lg bg-[#C8102E]" style={{ height: `${Math.max(6, (point.total / maxTimeline) * 100)}%` }} />
                          </div>
                          <span className="text-[9px] font-bold" style={{ color: "var(--text-4)" }}>{timelineLabel(point.key)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SystemSurface>

            <SystemSurface className="overflow-hidden xl:col-span-5">
              <SystemSectionHeader icon={ClipboardCheck} title="Distribuição por categoria" description="Onde a Inspetoria concentrou suas execuções registradas." accent="#C8102E" />
              <div className="space-y-3 p-5">
                {dashboard.categories.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>Sem categorias no período.</p> : dashboard.categories.slice(0, 8).map((row) => (
                  <div key={row.category}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-bold" style={{ color: "var(--text-2)" }}>{row.category}</span>
                      <span className="font-black tabular-nums" style={{ color: "var(--text-1)" }}>{row.total} · {row.share}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}><div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${row.share}%` }} /></div>
                  </div>
                ))}
              </div>
            </SystemSurface>
          </div>

          <SystemSurface className="overflow-hidden">
            <SystemSectionHeader icon={Clock3} title="Registros mais recentes" description="Últimas movimentações do período, preservando inclusive cancelamentos." />
            <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {dashboard.recent.length === 0 ? <p className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>Nenhum registro encontrado.</p> : dashboard.recent.map((entry) => (
                <button key={entry.id} type="button" onClick={() => setDetailsId(entry.id)} className="grid w-full gap-3 p-4 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.025] lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,.7fr)_170px_120px] lg:items-center">
                  <div className="min-w-0"><p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{entry.title}</p><p className="mt-1 truncate text-xs" style={{ color: "var(--text-4)" }}>{entry.executor_name} · {entry.category}{entry.location ? ` · ${entry.location}` : ""}</p></div>
                  <div className="text-xs" style={{ color: "var(--text-3)" }}>{displayDateTime(entry.executed_at)}</div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}><Camera className="h-3.5 w-3.5" /> {entry.attachment_count} evidência(s)</div>
                  <span className="justify-self-start rounded-full px-2 py-1 text-[9px] font-black lg:justify-self-end" style={entry.status === "Registrada" ? { background: "rgba(16,185,129,.09)", color: "#10b981" } : { background: "rgba(239,68,68,.08)", color: "#ef4444" }}>{entry.status.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </SystemSurface>
        </>
      )}

      {tab === "registrar" && (
        <div className="grid gap-4 xl:grid-cols-12">
          <SystemSurface className="overflow-hidden xl:col-span-8">
            <SystemSectionHeader icon={Plus} title="Registrar atribuição executada" description="O registro deve representar uma entrega efetivamente realizada. Após salvo, o conteúdo torna-se histórico imutável." />
            <div className="space-y-5 p-5">
              {!canRegister ? (
                <div className="rounded-2xl p-5" style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.20)" }}>
                  <p className="font-black text-amber-600">Cadastro da Inspetoria necessário</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-3)" }}>Sua conta ainda não está vinculada como integrante ativo deste módulo. Isso impede que um lançamento seja atribuído ao inspetor errado.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="production-title">Atribuição realizada</Label>
                      <Input
                        id="production-title"
                        list="inspector-production-suggestions"
                        value={title}
                        maxLength={255}
                        onChange={(event) => {
                          const value = event.target.value;
                          setTitle(value);
                          const match = suggestions.data?.find((item) => item.title.toLowerCase() === value.trim().toLowerCase());
                          if (match && membership.data?.categories.includes(match.category)) setCategory(match.category);
                        }}
                        placeholder="Ex.: Inspeção no Pátio 03"
                      />
                      <datalist id="inspector-production-suggestions">
                        {(suggestions.data ?? []).map((item) => <option key={`${item.title}-${item.category}`} value={item.title}>{item.category}</option>)}
                      </datalist>
                      <p className="text-[11px]" style={{ color: "var(--text-4)" }}>O SEGEMPAT sugere nomenclaturas já utilizadas para reduzir registros duplicados com nomes diferentes.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="production-category">Categoria</Label>
                      <select id="production-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-1)" }}>
                        {(membership.data?.categories ?? []).map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="production-location">Local / área <span className="font-normal" style={{ color: "var(--text-4)" }}>(opcional)</span></Label>
                      <Input id="production-location" value={location} maxLength={255} onChange={(event) => setLocation(event.target.value)} placeholder="Ex.: Portaria 01, Pátio, CFTV..." />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="production-details">Descrição / resultado</Label>
                      <Textarea id="production-details" rows={5} maxLength={10000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Descreva objetivamente o que foi executado, o resultado e, quando aplicável, a providência adotada." />
                    </div>
                  </div>

                  <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      <div>
                        <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Identidade e horário protegidos pelo servidor</p>
                        <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>
                          Executor: <strong style={{ color: "var(--text-2)" }}>{currentMember?.full_name}</strong> · Mat. {currentMember?.matricula}. A data/hora efetiva do registro é gravada pelo servidor no envio e não pode ser editada depois.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Evidências</p><p className="mt-0.5 text-xs" style={{ color: "var(--text-4)" }}>PNG/JPEG · até 5 imagens · 1,25 MB cada · opcional</p></div>
                      <label className="inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                        <ImagePlus className="mr-2 h-4 w-4" /> Adicionar imagem
                        <Input className="sr-only" type="file" accept="image/png,image/jpeg" multiple onChange={async (event) => {
                          const accepted = await prepareEvidenceFiles(event.target.files, MAX_EVIDENCES - pendingEvidence.length);
                          setPendingEvidence((current) => [...current, ...accepted]);
                          event.target.value = "";
                        }} />
                      </label>
                    </div>
                    {pendingEvidence.length > 0 && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {pendingEvidence.map((evidence) => (
                          <div key={evidence.id} className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--border)" }}>
                            <img src={evidence.data_url} alt="Prévia da evidência" className="h-36 w-full object-cover" />
                            <div className="space-y-2 p-3">
                              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-bold" style={{ color: "var(--text-1)" }}>{evidence.name}</p><p className="text-[10px]" style={{ color: "var(--text-4)" }}>{Math.round(evidence.size / 1024)} KB</p></div><Button type="button" size="icon" variant="ghost" onClick={() => setPendingEvidence((current) => current.filter((item) => item.id !== evidence.id))} aria-label={`Remover ${evidence.name}`}><X className="h-4 w-4" /></Button></div>
                              <Input value={evidence.caption} maxLength={500} onChange={(event) => setPendingEvidence((current) => current.map((item) => item.id === evidence.id ? { ...item, caption: event.target.value } : item))} placeholder="Legenda (opcional)" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={() => { setTitle(""); setDetails(""); setLocation(""); setPendingEvidence([]); }}>Limpar</Button>
                    <Button
                      className="bg-[#C8102E] font-bold text-white hover:bg-[#A00D24]"
                      disabled={createMutation.isPending || title.trim().length < 3 || details.trim().length < 5}
                      onClick={() => createMutation.mutate()}
                    >
                      {createMutation.isPending ? "Registrando..." : <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar execução</>}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </SystemSurface>

          <div className="space-y-4 xl:col-span-4">
            <SystemSurface className="p-5">
              <div className="flex items-start gap-3"><UserRound className="mt-0.5 h-5 w-5 text-[#C8102E]" /><div><p className="font-black" style={{ color: "var(--text-1)" }}>Quem recebe o crédito?</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>A atribuição é contabilizada exclusivamente para o inspetor autenticado que realizou o lançamento. O formulário não permite escolher outro executor.</p></div></div>
            </SystemSurface>
            <SystemSurface className="p-5">
              <div className="flex items-start gap-3"><History className="mt-0.5 h-5 w-5 text-[#2563eb]" /><div><p className="font-black" style={{ color: "var(--text-1)" }}>Histórico preservado</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>Depois de registrado, título, categoria, descrição, executor e horário não são editáveis. Em caso de erro, o registro é cancelado com motivo e continua auditável.</p></div></div>
            </SystemSurface>
            <SystemSurface className="p-5">
              <div className="flex items-start gap-3"><Camera className="mt-0.5 h-5 w-5 text-emerald-500" /><div><p className="font-black" style={{ color: "var(--text-1)" }}>Evidência fortalece o registro</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>A imagem não é obrigatória para toda atribuição, mas quando anexada fica em armazenamento privado e vinculada permanentemente ao lançamento.</p></div></div>
            </SystemSurface>
          </div>
        </div>
      )}

      {tab === "historico" && (
        <SystemSurface className="overflow-hidden">
          <SystemSectionHeader icon={History} title="Histórico da Produção" description="Pesquisa por período, inspetor, categoria e situação. Registros cancelados permanecem visíveis." />
          <div className="space-y-3 border-b p-4 lg:p-5" style={{ borderColor: "var(--border)" }}>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px_190px_145px_165px_auto]">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={historySearchDraft} onChange={(event) => setHistorySearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitHistorySearch(); }} placeholder="Atribuição, descrição, local ou inspetor" className="pl-9" /></div>
              <select value={historyEmployee} onChange={(event) => setHistoryEmployee(event.target.value)} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="">Todos os inspetores</option>{membership.data?.members.map((member) => <option key={member.employee_id} value={member.employee_id}>{member.full_name}</option>)}</select>
              <select value={historyCategory} onChange={(event) => setHistoryCategory(event.target.value)} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="">Todas as categorias</option>{membership.data?.categories.map((item) => <option key={item}>{item}</option>)}</select>
              <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as InspectorProductionStatus | "")} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="">Todas</option><option value="Registrada">Registradas</option><option value="Cancelada">Canceladas</option></select>
              <select value={historyEvidence} onChange={(event) => setHistoryEvidence(event.target.value as "with" | "without" | "")} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="">Evidência: todas</option><option value="with">Com evidência</option><option value="without">Sem evidência</option></select>
              <div className="flex gap-2"><Button variant="outline" size="icon" onClick={submitHistorySearch} aria-label="Pesquisar"><Search className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={clearHistoryFilters} aria-label="Limpar filtros"><FilterX className="h-4 w-4" /></Button></div>
            </div>
          </div>

          {historyQuery.isLoading ? (
            <div className="p-10 text-center text-sm" style={{ color: "var(--text-4)" }}>Carregando histórico...</div>
          ) : historyQuery.isError ? (
            <div className="p-8 text-center" role="alert"><p className="font-black text-red-500">Não foi possível consultar o histórico.</p><Button variant="outline" className="mt-3" onClick={() => void historyQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[980px] text-left">
                  <thead><tr className="border-b text-[10px] font-black uppercase tracking-[.11em]" style={{ borderColor: "var(--border)", color: "var(--text-4)" }}><th className="px-5 py-3">Data/hora</th><th className="px-4 py-3">Inspetor</th><th className="px-4 py-3">Atribuição</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3 text-center">Evidência</th><th className="px-4 py-3">Situação</th><th className="px-5 py-3 text-right">Ações</th></tr></thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                    {(historyQuery.data?.items ?? []).map((entry) => (
                      <tr key={entry.id} className="align-top">
                        <td className="whitespace-nowrap px-5 py-4 text-xs" style={{ color: "var(--text-3)" }}>{displayDateTime(entry.executed_at)}</td>
                        <td className="px-4 py-4"><p className="text-xs font-black" style={{ color: "var(--text-1)" }}>{entry.executor_name}</p><p className="mt-0.5 text-[10px] font-mono" style={{ color: "var(--text-4)" }}>Mat. {entry.executor_matricula}</p></td>
                        <td className="max-w-md px-4 py-4"><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{entry.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: "var(--text-4)" }}>{entry.details}</p></td>
                        <td className="px-4 py-4 text-xs font-semibold" style={{ color: "var(--text-3)" }}>{entry.category}</td>
                        <td className="px-4 py-4 text-center"><span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold" style={{ background: entry.attachment_count ? "rgba(16,185,129,.08)" : "var(--bg-surface-2)", color: entry.attachment_count ? "#10b981" : "var(--text-4)" }}><Camera className="h-3 w-3" /> {entry.attachment_count}</span></td>
                        <td className="px-4 py-4"><span className="rounded-full px-2 py-1 text-[9px] font-black" style={entry.status === "Registrada" ? { background: "rgba(16,185,129,.09)", color: "#10b981" } : { background: "rgba(239,68,68,.08)", color: "#ef4444" }}>{entry.status.toUpperCase()}</span></td>
                        <td className="px-5 py-4"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => setDetailsId(entry.id)} aria-label="Abrir detalhes"><Eye className="h-4 w-4" /></Button>{entry.status === "Registrada" && canCancel(entry) && <Button size="icon" variant="ghost" className="text-red-500" onClick={() => setCancelTarget(entry)} aria-label="Cancelar registro"><XCircle className="h-4 w-4" /></Button>}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 p-4 lg:hidden">
                {(historyQuery.data?.items ?? []).map((entry) => (
                  <button key={entry.id} type="button" onClick={() => setDetailsId(entry.id)} className="w-full rounded-2xl p-4 text-left" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-black" style={{ color: "var(--text-1)" }}>{entry.title}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{entry.executor_name} · {displayDateTime(entry.executed_at)}</p></div><span className="shrink-0 rounded-full px-2 py-1 text-[9px] font-black" style={entry.status === "Registrada" ? { background: "rgba(16,185,129,.09)", color: "#10b981" } : { background: "rgba(239,68,68,.08)", color: "#ef4444" }}>{entry.status.toUpperCase()}</span></div>
                    <p className="mt-3 line-clamp-2 text-xs leading-5" style={{ color: "var(--text-3)" }}>{entry.details}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px]" style={{ color: "var(--text-4)" }}><span>{entry.category}</span>{entry.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {entry.location}</span>}<span className="flex items-center gap-1"><Camera className="h-3 w-3" /> {entry.attachment_count}</span></div>
                  </button>
                ))}
              </div>

              {(historyQuery.data?.items.length ?? 0) === 0 && <div className="p-10 text-center"><History className="mx-auto h-9 w-9 opacity-25" /><p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>Nenhum registro corresponde aos filtros.</p></div>}

              <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-4)" }}>
                  {historyQuery.data?.total ?? 0} registro(s) no período · exibindo {Math.min(historyOffset + 1, historyQuery.data?.total ?? 0)}–{Math.min(historyOffset + PAGE_SIZE, historyQuery.data?.total ?? 0)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={historyOffset === 0} onClick={() => setHistoryOffset(Math.max(0, historyOffset - PAGE_SIZE))}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={historyQuery.data?.next_offset == null} onClick={() => { const nextOffset = historyQuery.data?.next_offset; if (nextOffset != null) setHistoryOffset(nextOffset); }}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </SystemSurface>
      )}

      {tab === "relatorio" && (
        <div className="space-y-4">
          <SystemSurface className="p-5 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div><p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Relatório gerencial</p><h2 className="mt-1 text-xl font-black" style={{ color: "var(--text-1)" }}>Produção da Inspetoria · {periodLabel(from, to)}</h2><p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-4)" }}>Resumo baseado exclusivamente nos registros preservados no SEGEMPAT no período selecionado. O ranking representa volume de execuções registradas, não avaliação qualitativa do desempenho profissional.</p></div>
              <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Imprimir</Button><Button className="bg-[#C8102E] text-white hover:bg-[#A00D24]" onClick={() => void downloadReportCsv()}><Download className="mr-2 h-4 w-4" /> Exportar CSV</Button></div>
            </div>
          </SystemSurface>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SystemMetricCard label="Execuções válidas" value={dashboard.totals.executions} icon={CheckCircle2} accent="#10b981" detail="cancelamentos excluídos do ranking" />
            <SystemMetricCard label="Registros cancelados" value={dashboard.totals.canceled} icon={XCircle} accent="#64748b" detail="preservados para rastreabilidade" />
            <SystemMetricCard label="Com evidência" value={dashboard.totals.with_evidence} icon={FileImage} accent="#2563eb" detail={`${dashboard.totals.evidence_rate}% das execuções ativas`} />
            <SystemMetricCard label="Sem evidência" value={dashboard.totals.without_evidence} icon={CameraOff} accent="#64748b" detail={`${dashboard.totals.without_evidence_rate}% das execuções ativas`} />
            <SystemMetricCard label="Média por inspetor" value={dashboard.totals.average_per_inspector} icon={Users} accent="#C8102E" detail="equipe oficialmente configurada" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SystemSurface className="overflow-hidden">
              <SystemSectionHeader icon={Medal} title="Participação por inspetor" description="Ordem definida pelo número de execuções ativas registradas." accent="#C8A000" />
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {dashboard.ranking.map((row) => <div key={row.employee_id} className="flex items-center gap-4 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black" style={{ background: `${rankAccent(row.rank)}12`, color: rankAccent(row.rank) }}>{row.rank}º</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{row.name}{row.is_leader ? " · Líder" : ""}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{row.total} execuções · {row.with_evidence} com · {row.without_evidence} sem evidência</p></div><div className="text-right"><p className="text-xl font-black" style={{ color: "var(--text-1)" }}>{row.share}%</p><p className="text-[9px]" style={{ color: "var(--text-4)" }}>participação</p></div></div>)}
                {dashboard.ranking.length === 0 && <p className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>Equipe não configurada.</p>}
              </div>
            </SystemSurface>
            <SystemSurface className="overflow-hidden">
              <SystemSectionHeader icon={ClipboardCheck} title="Categorias predominantes" description="Distribuição das atribuições registradas." />
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>{dashboard.categories.map((row) => <div key={row.category} className="flex items-center justify-between gap-4 p-4"><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>{row.category}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{row.share}% do volume</p></div><p className="text-xl font-black" style={{ color: "var(--text-1)" }}>{row.total}</p></div>)}{dashboard.categories.length === 0 && <p className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>Sem registros no período.</p>}</div>
            </SystemSurface>
          </div>

          <SystemSurface className="p-5">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C8102E]" /><div><p className="font-black" style={{ color: "var(--text-1)" }}>Critérios de confiabilidade</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>Identidade derivada da sessão autenticada · data/hora do lançamento definida pelo servidor · conteúdo imutável após gravação · cancelamentos com motivo e autor preservados · evidências armazenadas de forma privada · operações críticas registradas na auditoria do SEGEMPAT.</p></div></div>
          </SystemSurface>
        </div>
      )}

      <Dialog open={Boolean(detailsId)} onOpenChange={(open) => { if (!open) setDetailsId(null); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Detalhes da execução</DialogTitle></DialogHeader>
          {detailsQuery.isLoading ? <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>Carregando registro...</div> : detailsQuery.isError ? <div className="py-8 text-center text-sm text-red-500">Não foi possível abrir o registro.</div> : detailsQuery.data ? (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{detailsQuery.data.category}</p><h3 className="mt-1 text-lg font-black" style={{ color: "var(--text-1)" }}>{detailsQuery.data.title}</h3></div><span className="rounded-full px-2 py-1 text-[9px] font-black" style={detailsQuery.data.status === "Registrada" ? { background: "rgba(16,185,129,.09)", color: "#10b981" } : { background: "rgba(239,68,68,.08)", color: "#ef4444" }}>{detailsQuery.data.status.toUpperCase()}</span></div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text-2)" }}>{detailsQuery.data.details}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Executor" value={detailsQuery.data.executor_name} detail={`Mat. ${detailsQuery.data.executor_matricula}`} icon={UserRound} />
                <Info label="Data/hora" value={displayDateTime(detailsQuery.data.executed_at)} detail="Gravada pelo servidor" icon={Clock3} />
                <Info label="Local / área" value={detailsQuery.data.location || "Não informado"} detail="Contexto do registro" icon={MapPin} />
                <Info label="Evidências" value={String(detailsQuery.data.attachment_count)} detail="Imagens preservadas" icon={Camera} />
              </div>
              {detailsQuery.data.status === "Cancelada" && <div className="rounded-2xl p-4" style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.20)" }}><p className="text-sm font-black text-red-500">Registro cancelado</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-3)" }}>{detailsQuery.data.canceled_reason}</p><p className="mt-2 text-[11px]" style={{ color: "var(--text-4)" }}>Por {detailsQuery.data.canceled_by_name || "usuário autorizado"} · {displayDateTime(detailsQuery.data.canceled_at)}</p></div>}
              <div><p className="mb-2 text-sm font-black" style={{ color: "var(--text-1)" }}>Evidências preservadas</p>{detailsQuery.data.attachments.length ? <div className="grid gap-3 sm:grid-cols-2">{detailsQuery.data.attachments.map((attachment) => <a key={attachment.id} href={inspectorProductionAttachmentUrl(detailsQuery.data.id, attachment.id)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--border)" }}><img src={inspectorProductionAttachmentUrl(detailsQuery.data.id, attachment.id)} alt={attachment.caption || "Evidência da atribuição"} className="h-44 w-full object-cover" /><div className="p-3"><p className="truncate text-xs font-black" style={{ color: "var(--text-1)" }}>{attachment.original_name}</p>{attachment.caption && <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-3)" }}>{attachment.caption}</p>}<p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>{Math.round(attachment.size_bytes / 1024)} KB · {displayDate(attachment.created_at)}</p></div></a>)}</div> : <p className="rounded-xl p-4 text-sm" style={{ background: "var(--bg-surface-2)", color: "var(--text-4)" }}>Nenhuma evidência anexada a esta execução.</p>}</div>
              {detailsQuery.data.status === "Registrada" && canCancel(detailsQuery.data) && <div className="flex justify-end"><Button variant="outline" className="text-red-500" onClick={() => { setCancelTarget(detailsQuery.data); setDetailsId(null); }}><XCircle className="mr-2 h-4 w-4" /> Cancelar registro</Button></div>}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => { if (!open) { setCancelTarget(null); setCancelReason(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Cancelar registro de produção</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}><p className="font-black" style={{ color: "var(--text-1)" }}>{cancelTarget?.title}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{cancelTarget?.executor_name} · {displayDateTime(cancelTarget?.executed_at)}</p></div>
            <div className="space-y-1.5"><Label htmlFor="production-cancel-reason">Motivo do cancelamento</Label><Textarea id="production-cancel-reason" rows={4} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Informe objetivamente por que este lançamento não deve permanecer como execução válida." /></div>
            <p className="text-xs leading-5" style={{ color: "var(--text-4)" }}>O registro não será apagado. Ele continuará disponível no histórico, identificado como cancelado, com autor, horário e motivo do cancelamento.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(""); }}>Voltar</Button><Button className="bg-red-600 text-white hover:bg-red-700" disabled={cancelMutation.isPending || cancelReason.trim().length < 5} onClick={() => cancelMutation.mutate()}>{cancelMutation.isPending ? "Cancelando..." : "Confirmar cancelamento"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof UserRound }) {
  return <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon className="h-4 w-4" /></div><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-1 break-words text-sm font-black" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>{detail}</p></div></div></div>;
}
