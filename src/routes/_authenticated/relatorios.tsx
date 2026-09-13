import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Layers3,
  Printer,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthlyReportWorkspace } from "@/components/reports/MonthlyReportWorkspace";
import { getOperationalSnapshot } from "@/lib/insights";
import { operationalYear } from "@/lib/operational-time";
import {
  availableReportingSectors,
  examReporting,
  monthlyReporting,
  reportingSummary,
  sectorReporting,
} from "@/lib/reporting-insights";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Central de Relatórios · SEGEMPAT" }] }),
  component: ReportsCenterPage,
});

type ReportTab = "executivo" | "mensal";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl ${className}`} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>{children}</section>;
}

function ReportsCenterPage() {
  const [tab, setTab] = useState<ReportTab>("executivo");

  return (
    <div className="segempat-analytical-reports mx-auto max-w-7xl space-y-5 pb-10">
      <section className="reports-no-print relative overflow-hidden rounded-[1.75rem] p-5 md:p-6 lg:p-7" style={{ background: "linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)", border: "1px solid rgba(200,16,46,.28)", boxShadow: "0 12px 38px rgba(80,0,18,.16)" }}>
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)" }} />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-white/45"><FileSpreadsheet className="h-4 w-4" /> Inteligência documental</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Central de Relatórios</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">Relatórios para decisão, conferência e evidência: o mesmo dado que aparece no resumo permanece rastreável nos volumes mensais, setores e avaliações.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:w-[470px]" role="tablist" aria-label="Modo de relatório">
            <ReportModeButton active={tab === "executivo"} icon={BarChart3} title="Visão Executiva" subtitle="Ano · setores · avaliações" onClick={() => setTab("executivo")} />
            <ReportModeButton active={tab === "mensal"} icon={CalendarDays} title="Fechamento Mensal" subtitle="Colaborador · cronograma · provas" onClick={() => setTab("mensal")} />
          </div>
        </div>
      </section>

      {tab === "executivo" ? <ExecutiveReport /> : <MonthlyReportWorkspace embedded />}

      <style>{`
        @media print {
          body aside[aria-label="Navegação principal"], body header.sticky, .reports-no-print, .report-screen-only { display:none !important; }
          body aside[aria-label="Navegação principal"] + div { margin-left:0 !important; min-height:0 !important; }
          body main { padding:0 !important; }
          .segempat-analytical-reports { max-width:none !important; width:100% !important; padding:0 !important; }
          .segempat-report-print { box-shadow:none !important; border-color:#d7d9de !important; break-inside:avoid; }
          .segempat-report-page-break { break-before:page; }
          @page { size:A4 portrait; margin:12mm; }
        }
      `}</style>
    </div>
  );
}

function ReportModeButton({ active, icon: Icon, title, subtitle, onClick }: { active: boolean; icon: typeof BarChart3; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      style={active
        ? { background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.26)", boxShadow: "0 10px 24px rgba(0,0,0,.16)" }
        : { background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.09)" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: active ? "#C8102E" : "rgba(255,255,255,.07)" }}><Icon className="h-4 w-4 text-white" /></div>
      <div className="min-w-0"><p className="text-sm font-black text-white">{title}</p><p className="mt-0.5 text-[10px] text-white/45">{subtitle}</p></div>
    </button>
  );
}

function ExecutiveReport() {
  const currentYear = operationalYear();
  const [year, setYear] = useState(currentYear);
  const [sector, setSector] = useState("Todos");
  const query = useQuery({ queryKey: ["reports-snapshot", year], queryFn: () => getOperationalSnapshot(year), staleTime: 60_000 });
  const sectors = useMemo(() => (query.data ? availableReportingSectors(query.data) : []), [query.data]);

  useEffect(() => {
    if (sector !== "Todos" && !sectors.includes(sector)) setSector("Todos");
  }, [sector, sectors]);

  if (query.isLoading && !query.data) return <Loading />;
  if (query.isError || !query.data) {
    return <Card className="mx-auto max-w-xl p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>Não foi possível carregar o relatório executivo.</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>O SEGEMPAT não substitui dados indisponíveis por zeros.</p><Button variant="outline" className="mt-4" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></Card>;
  }

  const data = query.data;
  const summary = reportingSummary(data, sector);
  const allSectorRows = sectorReporting(data);
  const sectorRows = sector === "Todos" ? allSectorRows : allSectorRows.filter((row) => row.sector === sector);
  const months = monthlyReporting(data, year, sector);
  const exams = examReporting(data, sector);
  const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - 3 + index);
  const hasOperationalData = summary.activeEmployees > 0 || summary.planned > 0 || summary.attempts > 0;
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Maceio", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const exportCsv = () => {
    const rows: unknown[][] = [
      ["SEGEMPAT", "RELATÓRIO EXECUTIVO"],
      ["Ano operacional", year],
      ["Setor", sector],
      ["Gerado em", generatedAt],
      [],
      ["RESUMO"],
      ["Equipe ativa", summary.activeEmployees],
      ["Cronograma planejado", summary.planned],
      ["Realizados", summary.realized],
      ["Pendentes", summary.pending],
      ["Justificados", summary.justified],
      ["Execução %", csvMetric(summary.executionRate)],
      ["Tentativas", summary.attempts],
      ["Aprovadas", summary.passed],
      ["Aprovação %", csvMetric(summary.approvalRate)],
      ["Média", summary.averageScore ?? "SEM BASE"],
      [],
      ["SETOR", "EQUIPE", "PLANEJADOS", "REALIZADOS", "PENDENTES", "JUSTIFICADOS", "EXECUÇÃO %", "TENTATIVAS", "APROVADAS", "APROVAÇÃO %", "MÉDIA"],
      ...sectorRows.map((row) => [row.sector, row.activeEmployees, row.planned, row.realized, row.pending, row.justified, csvMetric(row.executionRate), row.attempts, row.passed, csvMetric(row.approvalRate), row.averageScore ?? "SEM BASE"]),
      [],
      ["MÊS", "PLANEJADOS", "REALIZADOS", "PENDENTES", "JUSTIFICADOS", "EXECUÇÃO %", "TENTATIVAS", "APROVADAS", "APROVAÇÃO %", "MÉDIA"],
      ...months.map((row) => [row.month, row.planned, row.realized, row.pending, row.justified, csvMetric(row.executionRate), row.attempts, row.passed, csvMetric(row.approvalRate), row.averageScore ?? "SEM BASE"]),
      [],
      ["AVALIAÇÃO", "MODALIDADE", "PÚBLICO", "MÍNIMO INDIVIDUAL %", "TENTATIVAS", "APROVADAS", "APROVAÇÃO %", "MÉDIA"],
      ...exams.map((exam) => [exam.title, exam.type, exam.targetSector, exam.minApprovalPct, exam.attempts, exam.passed, csvMetric(exam.approvalRate), exam.averageScore ?? "SEM BASE"]),
    ];
    downloadCsv(`SEGEMPAT_Relatorio_Executivo_${year}_${safeFileName(sector)}.csv`, rows);
    toast.success("Relatório executivo exportado");
  };

  return (
    <div className="space-y-5">
      <Card className="reports-no-print p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em]" style={{ color: "var(--accent)" }}>Configuração do relatório</p><p className="mt-1 text-sm font-bold" style={{ color: "var(--text-1)" }}>Ano e setor recalculam resumo, meses, tabela setorial, avaliações e o arquivo exportado.</p></div>
          <div className="grid gap-2 sm:grid-cols-[130px_minmax(190px,250px)_auto_auto]">
            <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>Ano<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl px-3 text-sm font-bold outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}>{yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>Setor<select value={sector} onChange={(event) => setSector(event.target.value)} className="mt-1 h-10 w-full rounded-xl px-3 text-sm font-bold outline-none" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }}><option value="Todos">Todos os setores</option>{sectors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <Button variant="outline" className="h-10 self-end gap-2" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
            <Button className="h-10 self-end gap-2 bg-[#e0142f] font-bold text-white hover:bg-[#C8102E]" onClick={exportCsv}><Download className="h-4 w-4" /> Exportar CSV</Button>
          </div>
        </div>
      </Card>

      <section className="segempat-report-print rounded-2xl p-5" style={{ background: "#fff", color: "#171A1F", border: "1px solid #d7d9de" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#C8102E]">EMPRESA ALAGOANA DE TERMINAIS · UNIDADE DE SEGURANÇA PORTUÁRIA</p><h2 className="mt-2 text-xl font-black">Relatório Executivo SEGEMPAT · {year}</h2><p className="mt-1 text-xs text-[#616772]">Escopo: {sector === "Todos" ? "todos os setores operacionais" : sector} · Gerado em {generatedAt}</p></div>
          <Button variant="outline" className="report-screen-only gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / salvar PDF</Button>
        </div>
      </section>

      {!hasOperationalData && <Card className="segempat-report-print p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><div><p className="font-black" style={{ color: "var(--text-1)" }}>Base sem volume operacional no recorte</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>O relatório foi carregado, mas ainda não há registros suficientes para alguns indicadores. Campos percentuais sem denominador aparecem como “—”.</p></div></div></Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Equipe ativa" value={summary.activeEmployees} icon={Users} sub="colaboradores no escopo" />
        <Metric label="Execução" value={formatPercent(summary.executionRate)} icon={Target} sub={`${summary.realized}/${summary.planned} realizados`} />
        <Metric label="Pendências" value={summary.pending} icon={AlertTriangle} sub={`${summary.justified} justificados`} />
        <Metric label="Aprovação" value={formatPercent(summary.approvalRate)} icon={CheckCircle2} sub={`${summary.passed}/${summary.attempts} aprovadas`} />
        <Metric label="Média" value={formatScore(summary.averageScore)} icon={BarChart3} sub={`${summary.attempts} tentativas`} />
      </div>

      <Card className="segempat-report-print overflow-hidden">
        <ReportHeading icon={Layers3} title="Indicadores por setor" subtitle="A execução e a aprovação sempre aparecem junto aos respectivos volumes de referência." />
        {sectorRows.length === 0 ? <Empty text="Nenhum setor com dados disponíveis." /> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead style={{ background: "var(--bg-surface-2)" }}><tr>{["Setor", "Equipe", "Planejados", "Realizados", "Pendentes", "Execução", "Tentativas", "Aprovação", "Média"].map((label) => <th key={label} className={`p-3 text-[9px] font-black uppercase tracking-[.1em] ${label === "Setor" ? "text-left" : "text-right"}`} style={{ color: "var(--text-4)" }}>{label}</th>)}</tr></thead><tbody>{sectorRows.map((row) => <tr key={row.sector} style={{ borderTop: "1px solid var(--border-subtle)" }}><td className="p-3 font-black" style={{ color: "var(--text-1)" }}>{row.sector}</td><td className="p-3 text-right">{row.activeEmployees}</td><td className="p-3 text-right">{row.planned}</td><td className="p-3 text-right">{row.realized}</td><td className="p-3 text-right">{row.pending}</td><td className="p-3 text-right font-black">{formatPercent(row.executionRate)}</td><td className="p-3 text-right">{row.attempts}</td><td className="p-3 text-right font-black">{formatPercent(row.approvalRate)}</td><td className="p-3 text-right font-black">{formatScore(row.averageScore)}</td></tr>)}</tbody></table></div>}
      </Card>

      <Card className="segempat-report-print overflow-hidden">
        <ReportHeading icon={CalendarDays} title="Fechamento mês a mês" subtitle="Doze meses permanecem visíveis, inclusive os meses sem planejamento ou sem avaliações, para preservar a leitura do período inteiro." />
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead style={{ background: "var(--bg-surface-2)" }}><tr>{["Mês", "Planejados", "Realizados", "Pendentes", "Justificados", "Execução", "Tentativas", "Aprovadas", "Aprovação", "Média"].map((label) => <th key={label} className={`p-3 text-[9px] font-black uppercase tracking-[.1em] ${label === "Mês" ? "text-left" : "text-right"}`} style={{ color: "var(--text-4)" }}>{label}</th>)}</tr></thead><tbody>{months.map((row) => <tr key={row.month} style={{ borderTop: "1px solid var(--border-subtle)" }}><td className="p-3 font-black uppercase" style={{ color: "var(--text-1)" }}>{row.label}</td><td className="p-3 text-right">{row.planned}</td><td className="p-3 text-right">{row.realized}</td><td className="p-3 text-right">{row.pending}</td><td className="p-3 text-right">{row.justified}</td><td className="p-3 text-right font-black">{formatPercent(row.executionRate)}</td><td className="p-3 text-right">{row.attempts}</td><td className="p-3 text-right">{row.passed}</td><td className="p-3 text-right font-black">{formatPercent(row.approvalRate)}</td><td className="p-3 text-right font-black">{formatScore(row.averageScore)}</td></tr>)}</tbody></table></div>
      </Card>

      <Card className="segempat-report-print segempat-report-page-break overflow-hidden">
        <ReportHeading icon={BarChart3} title="Desempenho das avaliações" subtitle="O mínimo é o critério individual configurado na prova; a taxa de aprovação é a proporção de tentativas aprovadas no recorte." />
        {exams.length === 0 ? <Empty text="Nenhuma avaliação concluída neste escopo." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead style={{ background: "var(--bg-surface-2)" }}><tr>{["Avaliação", "Modalidade", "Mínimo", "Tentativas", "Aprovadas", "Aprovação", "Média"].map((label) => <th key={label} className={`p-3 text-[9px] font-black uppercase tracking-[.1em] ${label === "Avaliação" || label === "Modalidade" ? "text-left" : "text-right"}`} style={{ color: "var(--text-4)" }}>{label}</th>)}</tr></thead><tbody>{exams.map((exam) => <tr key={exam.examId} style={{ borderTop: "1px solid var(--border-subtle)" }}><td className="p-3 font-black" style={{ color: "var(--text-1)" }}>{exam.title}</td><td className="p-3" style={{ color: "var(--text-3)" }}>{exam.type}</td><td className="p-3 text-right">{exam.minApprovalPct}%</td><td className="p-3 text-right">{exam.attempts}</td><td className="p-3 text-right">{exam.passed}</td><td className="p-3 text-right font-black">{formatPercent(exam.approvalRate)}</td><td className="p-3 text-right font-black">{formatScore(exam.averageScore)}</td></tr>)}</tbody></table></div>}
      </Card>

      <Card className="segempat-report-print p-4">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} /><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Rastreabilidade do relatório</p><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>Fonte: snapshot operacional do SEGEMPAT para o ano selecionado. Escopo funcional: colaboradores ativos fora do perfil Inspetor, cronograma associado por ID ou matrícula e avaliações associadas pela matrícula. Ausência de denominador é representada por “—”; nenhum valor é estimado por IA.</p></div></div>
      </Card>
    </div>
  );
}

function ReportHeading({ icon: Icon, title, subtitle }: { icon: typeof Layers3; title: string; subtitle: string }) {
  return <div className="flex items-start gap-2 border-b p-4" style={{ borderColor: "var(--border-subtle)" }}><Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} /><div><h2 className="text-sm font-black" style={{ color: "var(--text-1)" }}>{title}</h2><p className="mt-0.5 text-[11px]" style={{ color: "var(--text-4)" }}>{subtitle}</p></div></div>;
}

function Metric({ label, value, icon: Icon, sub }: { label: string; value: string | number; icon: typeof Users; sub: string }) {
  return <Card className="segempat-report-print p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-2xl font-black md:text-3xl" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>{sub}</p></div><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)" }}><Icon className="h-4 w-4" style={{ color: "var(--accent)" }} /></div></div></Card>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>{text}</div>;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csvMetric(value: number | null) {
  return value == null ? "SEM BASE" : value;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const content = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

function formatScore(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

function Loading() {
  return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /></div>;
}
