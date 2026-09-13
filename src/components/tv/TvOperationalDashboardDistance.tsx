import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Expand,
  RefreshCcw,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { getTvDashboardData, type TvDashboardData, type TvMonthPoint } from "@/lib/tv-dashboard";
import { operationalYear } from "@/lib/operational-time";

const RED = "#e31837";
const GREEN = "#22c98b";
const AMBER = "#f4aa35";
const BLUE = "#5b96ff";
const PURPLE = "#9b7cf6";
const BG = "#07090d";
const PANEL = "rgba(18,21,29,.95)";
const PANEL_SOFT = "rgba(255,255,255,.032)";
const BORDER = "rgba(255,255,255,.095)";
const BORDER_STRONG = "rgba(255,255,255,.145)";
const TEXT = "#f8f9fb";
const MUTED = "#a1a8b7";
const MUTED_2 = "#717989";

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Maceio",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDate(date: Date) {
  const text = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Maceio",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  return text.replace(/\./g, "").toUpperCase();
}

function timeOnly(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatTime(date);
}

function Panel({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <section className={`relative min-w-0 overflow-hidden rounded-[1.2rem] ${className}`} style={{ background: PANEL, border: `1px solid ${BORDER}`, boxShadow: "0 18px 46px rgba(0,0,0,.24)" }}>
      {accent && <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,${accent}c0,${accent}18 50%,transparent)` }} />}
      {children}
    </section>
  );
}

function PanelTitle({ icon: Icon, title, subtitle, accent = RED, aside }: { icon: typeof Activity; title: string; subtitle?: string; accent?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-[clamp(.65rem,.8vw,.95rem)]">
        <div className="flex h-[clamp(2.2rem,2.45vw,2.7rem)] w-[clamp(2.2rem,2.45vw,2.7rem)] shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}14`, border: `1px solid ${accent}34` }}>
          <Icon className="h-[clamp(1rem,1.08vw,1.18rem)] w-[clamp(1rem,1.08vw,1.18rem)]" style={{ color: accent }} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[clamp(1rem,1.12vw,1.28rem)] font-black tracking-[-.025em]" style={{ color: TEXT }}>{title}</h2>
          {subtitle && <p className="mt-1 truncate text-[clamp(.64rem,.7vw,.82rem)] font-semibold" style={{ color: MUTED }}>{subtitle}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}

function StatusHero({ data, accent }: { data: TvDashboardData; accent: string }) {
  const headline = data.level === "Normal" ? "Operação estável" : data.level === "Atenção" ? "Acompanhamento necessário" : "Prioridade operacional";
  const criticalCount = data.attention.filter((item) => item.level === "critical").length;
  const warningCount = data.attention.filter((item) => item.level === "warning").length;
  return (
    <Panel accent={accent} className="min-h-[170px] p-[clamp(1rem,1.25vw,1.45rem)]">
      <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: `${accent}12` }} />
      <div className="relative flex h-full min-h-0 flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 16px ${accent}80` }} /><span className="text-[clamp(.62rem,.68vw,.8rem)] font-black uppercase tracking-[.17em]" style={{ color: MUTED }}>Situação operacional</span></div>
            <p className="mt-[clamp(.35rem,.58vh,.6rem)] text-[clamp(1.9rem,2.8vw,3.5rem)] font-black leading-[.92] tracking-[-.055em]" style={{ color: accent }}>{data.level}</p>
            <p className="mt-2 text-[clamp(.82rem,.92vw,1.05rem)] font-extrabold" style={{ color: TEXT }}>{headline}</p>
          </div>
          <div className="flex h-[clamp(3rem,3.8vw,4.35rem)] w-[clamp(3rem,3.8vw,4.35rem)] shrink-0 items-center justify-center rounded-2xl" style={{ background: `${accent}12`, border: `1px solid ${accent}35` }}><ShieldCheck className="h-[49%] w-[49%]" style={{ color: accent }} /></div>
        </div>
        <div>
          <p className="line-clamp-2 max-w-[44rem] text-[clamp(.7rem,.77vw,.9rem)] font-semibold leading-relaxed" style={{ color: MUTED }}>{data.levelReason}</p>
          <div className="mt-[clamp(.5rem,.72vh,.75rem)] flex flex-wrap gap-2">
            <span className="rounded-lg px-3 py-1.5 text-[clamp(.56rem,.62vw,.72rem)] font-black uppercase tracking-[.07em]" style={{ color: criticalCount ? RED : GREEN, background: criticalCount ? `${RED}12` : `${GREEN}10`, border: `1px solid ${criticalCount ? RED : GREEN}28` }}>{criticalCount ? `${criticalCount} crítico${criticalCount > 1 ? "s" : ""}` : "Sem crítico"}</span>
            <span className="rounded-lg px-3 py-1.5 text-[clamp(.56rem,.62vw,.72rem)] font-black uppercase tracking-[.07em]" style={{ color: warningCount ? AMBER : GREEN, background: warningCount ? `${AMBER}12` : `${GREEN}10`, border: `1px solid ${warningCount ? AMBER : GREEN}28` }}>{warningCount ? `${warningCount} ponto${warningCount > 1 ? "s" : ""} de atenção` : "Sem pendência relevante"}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function KpiCard({ label, value, detail, icon: Icon, accent, alert = false }: { label: string; value: string | number; detail: string; icon: typeof Users; accent: string; alert?: boolean }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[1rem] px-[clamp(.85rem,.95vw,1.08rem)] py-[clamp(.72rem,.86vh,.92rem)]" style={{ background: "linear-gradient(145deg,rgba(27,31,42,.98),rgba(14,17,24,.98))", border: `1px solid ${alert ? `${accent}52` : BORDER}` }}>
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: alert ? accent : `${accent}98` }} />
      <div className="flex items-start justify-between gap-2 pl-1"><div className="min-w-0"><p className="truncate text-[clamp(.57rem,.63vw,.74rem)] font-black uppercase tracking-[.13em]" style={{ color: MUTED }}>{label}</p><p className="mt-[clamp(.22rem,.34vh,.35rem)] truncate text-[clamp(1.5rem,2.15vw,2.55rem)] font-black leading-none tracking-[-.04em]" style={{ color: alert ? accent : TEXT }}>{value}</p></div><div className="flex h-[clamp(2.1rem,2.45vw,2.7rem)] w-[clamp(2.1rem,2.45vw,2.7rem)] shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}11`, border: `1px solid ${accent}28` }}><Icon className="h-[46%] w-[46%]" style={{ color: accent }} /></div></div>
      <p className="mt-[clamp(.3rem,.42vh,.45rem)] truncate pl-1 text-[clamp(.56rem,.62vw,.72rem)] font-semibold" style={{ color: MUTED }}>{detail}</p>
    </div>
  );
}

function currentMonthIndex(months: TvMonthPoint[]) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Maceio", year: "numeric", month: "2-digit" }).format(new Date()).replace("/", "-");
  return months.findIndex((row) => row.month === key);
}

function visibleMonths(months: TvMonthPoint[]) {
  const current = currentMonthIndex(months);
  const lastActive = months.findLastIndex((row) => row.executionRate > 0 || row.attempts > 0);
  const last = current >= 0 ? current : Math.max(lastActive, 0);
  return months.slice(Math.max(0, last - 5), last + 1);
}

function MetricBar({ value, max = 100, color, muted = false, thick = false }: { value: number; max?: number; color: string; muted?: boolean; thick?: boolean }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={thick ? "h-[clamp(.52rem,.72vh,.75rem)] overflow-hidden rounded-full" : "h-[clamp(.4rem,.58vh,.62rem)] overflow-hidden rounded-full"} style={{ background: "rgba(255,255,255,.07)" }}><div className="h-full rounded-full transition-[width]" style={{ width: `${width}%`, background: muted ? `${color}55` : color }} /></div>;
}

function RhythmPanel({ months }: { months: TvMonthPoint[] }) {
  const points = visibleMonths(months);
  const latest = points.at(-1);
  const hasAnyData = points.some((row) => row.executionRate > 0 || row.attempts > 0);
  const assessmentMonths = points.filter((row) => row.attempts > 0);
  if (!hasAnyData) return <div className="flex h-[calc(100%-3rem)] min-h-[150px] items-center justify-center text-center"><div><BarChart3 className="mx-auto h-8 w-8" style={{ color: MUTED_2 }} /><p className="mt-3 text-[clamp(.78rem,.86vw,1rem)] font-black" style={{ color: TEXT }}>Histórico ainda insuficiente</p><p className="mt-1 text-[clamp(.6rem,.66vw,.76rem)] font-semibold" style={{ color: MUTED }}>O painel ganhará tendência conforme cronograma e avaliações forem executados.</p></div></div>;
  return (
    <div className="mt-[clamp(.6rem,.82vh,.85rem)] flex h-[calc(100%-3rem)] min-h-0 flex-col">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl px-3.5 py-2.5" style={{ background: PANEL_SOFT, border: `1px solid ${BORDER}` }}><p className="text-[clamp(.56rem,.62vw,.72rem)] font-black uppercase tracking-[.11em]" style={{ color: MUTED }}>Execução do mês</p><div className="mt-1.5 flex items-end justify-between gap-3"><p className="text-[clamp(1.3rem,1.8vw,2.05rem)] font-black leading-none" style={{ color: (latest?.executionRate ?? 0) >= 80 ? GREEN : AMBER }}>{latest?.executionRate ?? 0}%</p><span className="pb-0.5 text-[clamp(.5rem,.56vw,.65rem)] font-bold" style={{ color: MUTED_2 }}>{latest?.label ?? "—"}</span></div></div>
        <div className="rounded-xl px-3.5 py-2.5" style={{ background: PANEL_SOFT, border: `1px solid ${BORDER}` }}><p className="text-[clamp(.56rem,.62vw,.72rem)] font-black uppercase tracking-[.11em]" style={{ color: MUTED }}>Aprovação no mês</p><div className="mt-1.5 flex items-end justify-between gap-3"><p className="text-[clamp(1.3rem,1.8vw,2.05rem)] font-black leading-none" style={{ color: latest?.attempts ? (latest.approvalRate >= 75 ? GREEN : AMBER) : MUTED }}>{latest?.attempts ? `${latest.approvalRate}%` : "—"}</p><span className="pb-0.5 text-[clamp(.5rem,.56vw,.65rem)] font-bold" style={{ color: MUTED_2 }}>{latest?.attempts ? `${latest.attempts} prova${latest.attempts > 1 ? "s" : ""}` : "sem prova"}</span></div></div>
      </div>
      <div className="mt-[clamp(.65rem,.95vh,.95rem)] min-h-0 flex-1 rounded-xl px-[clamp(.7rem,.85vw,.95rem)] py-[clamp(.55rem,.7vh,.75rem)]" style={{ background: "rgba(255,255,255,.018)", border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between gap-3"><p className="text-[clamp(.55rem,.61vw,.7rem)] font-black uppercase tracking-[.1em]" style={{ color: MUTED }}>Linha do tempo · últimos 6 meses</p><p className="text-[clamp(.5rem,.55vw,.64rem)] font-semibold" style={{ color: MUTED_2 }}>Meses sem avaliação não entram na taxa de aprovação</p></div>
        <div className="relative mt-[clamp(.8rem,1.1vh,1.1rem)] grid h-[calc(100%-2.1rem)] min-h-[112px] grid-cols-6 gap-2"><div className="pointer-events-none absolute left-[8%] right-[8%] top-[1.05rem] h-px" style={{ background: "rgba(255,255,255,.1)" }} />{points.map((point, index) => { const execColor = point.executionRate >= 80 ? GREEN : point.executionRate >= 55 ? AMBER : RED; const hasExam = point.attempts > 0; const current = index === points.length - 1; return <div key={point.month} className="relative z-10 flex min-w-0 flex-col items-center text-center"><span className="flex h-[2.1rem] w-[2.1rem] items-center justify-center rounded-full text-[clamp(.5rem,.56vw,.65rem)] font-black" style={{ color: current ? TEXT : MUTED, background: current ? `${execColor}28` : "#171b24", border: `2px solid ${current ? execColor : BORDER_STRONG}`, boxShadow: current ? `0 0 16px ${execColor}35` : "none" }}>{point.label}</span><div className="mt-2 w-full max-w-[7rem]"><div className="flex items-center justify-between gap-1"><span className="text-[clamp(.48rem,.54vw,.62rem)] font-bold" style={{ color: MUTED }}>Exec.</span><span className="text-[clamp(.58rem,.66vw,.78rem)] font-black" style={{ color: execColor }}>{point.executionRate}%</span></div><div className="mt-1"><MetricBar value={point.executionRate} color={execColor} /></div></div><div className="mt-2 flex items-center gap-1.5"><span className="text-[clamp(.48rem,.54vw,.62rem)] font-bold" style={{ color: MUTED }}>Aprov.</span><span className="text-[clamp(.58rem,.66vw,.78rem)] font-black" style={{ color: hasExam ? (point.approvalRate >= 75 ? GREEN : AMBER) : MUTED_2 }}>{hasExam ? `${point.approvalRate}%` : "—"}</span></div></div>; })}</div>
      </div>
      <p className="mt-1.5 text-right text-[clamp(.46rem,.52vw,.6rem)] font-semibold" style={{ color: MUTED_2 }}>{assessmentMonths.length ? `${assessmentMonths.length} mês${assessmentMonths.length > 1 ? "es" : ""} com avaliação no período exibido` : "Nenhum mês com avaliação no período exibido"}</p>
    </div>
  );
}

function RiskDonut({ data }: { data: TvDashboardData["risk"] }) {
  const values = [data.normal, data.low, data.medium, data.high];
  const colors = [GREEN, BLUE, AMBER, RED];
  const total = values.reduce((sum, value) => sum + value, 0);
  let offset = 0;
  const circumference = 2 * Math.PI * 46;
  return <div className="mt-[clamp(.5rem,.75vh,.75rem)] grid h-[calc(100%-2.7rem)] min-h-0 grid-cols-[.9fr_1.1fr] items-center gap-4"><div className="relative mx-auto aspect-square h-[min(18vh,9.5vw)] min-h-[100px] max-h-[170px]"><svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-label="Distribuição agregada do risco da equipe"><circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,.055)" strokeWidth="13" />{values.map((value, index) => { const length = total ? (value / total) * circumference : 0; const item = <circle key={index} cx="60" cy="60" r="46" fill="none" stroke={colors[index]} strokeWidth="13" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />; offset += length; return item; })}</svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[clamp(1.55rem,2.2vw,2.5rem)] font-black leading-none" style={{ color: TEXT }}>{total}</span><span className="mt-1 text-[clamp(.5rem,.56vw,.65rem)] font-black uppercase tracking-[.15em]" style={{ color: MUTED }}>equipe</span></div></div><div className="space-y-[clamp(.42rem,.64vh,.66rem)]">{[["Normal", data.normal, GREEN], ["Baixo", data.low, BLUE], ["Médio", data.medium, AMBER], ["Alto", data.high, RED]].map(([label, value, color]) => <div key={String(label)} className="flex items-center justify-between gap-3 rounded-lg px-3 py-[clamp(.35rem,.5vh,.5rem)]" style={{ background: "rgba(255,255,255,.025)" }}><div className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: String(color) }} /><span className="text-[clamp(.62rem,.69vw,.8rem)] font-bold" style={{ color: MUTED }}>{label}</span></div><span className="text-[clamp(.82rem,.9vw,1.05rem)] font-black" style={{ color: String(value) === "0" ? MUTED_2 : TEXT }}>{value}</span></div>)}</div></div>;
}

function PerformancePanel({ months, average, approvalRate }: { months: TvMonthPoint[]; average: number; approvalRate: number }) {
  const active = months.filter((row) => row.attempts > 0).slice(-4);
  const scoreColor = average >= 7 ? GREEN : average > 0 ? AMBER : MUTED;
  const approvalColor = approvalRate >= 75 ? GREEN : approvalRate > 0 ? AMBER : MUTED;
  return <div className="mt-[clamp(.55rem,.8vh,.8rem)] flex h-[calc(100%-2.8rem)] min-h-0 flex-col"><div className="grid grid-cols-[1fr_.9fr] gap-4"><div><div className="flex items-end gap-2"><span className="text-[clamp(2.35rem,3.2vw,3.8rem)] font-black leading-none tracking-[-.055em]" style={{ color: scoreColor }}>{average.toFixed(1)}</span><span className="pb-1 text-[clamp(.64rem,.7vw,.82rem)] font-bold" style={{ color: MUTED }}>/ 10</span></div><p className="mt-1.5 text-[clamp(.57rem,.63vw,.73rem)] font-bold" style={{ color: MUTED }}>média geral consolidada</p></div><div className="flex flex-col justify-end"><div className="flex items-end justify-between gap-2"><span className="text-[clamp(.57rem,.63vw,.73rem)] font-bold" style={{ color: MUTED }}>Aprovação geral</span><span className="text-[clamp(.95rem,1.08vw,1.25rem)] font-black" style={{ color: approvalColor }}>{approvalRate}%</span></div><div className="mt-2"><MetricBar value={approvalRate} color={approvalColor} thick /></div></div></div><div className="mt-[clamp(.7rem,1vh,1rem)]"><div className="flex items-center justify-between gap-2"><span className="text-[clamp(.54rem,.6vw,.7rem)] font-black uppercase tracking-[.1em]" style={{ color: MUTED }}>Faixa de desempenho</span><span className="text-[clamp(.54rem,.6vw,.7rem)] font-bold" style={{ color: average >= 7 ? GREEN : AMBER }}>Meta 7,0</span></div><div className="relative mt-2.5"><MetricBar value={average} max={10} color={scoreColor} thick /><span className="absolute top-[-4px] h-[calc(100%+8px)] w-px" style={{ left: "70%", background: AMBER, boxShadow: `0 0 8px ${AMBER}60` }} /></div></div><div className="mt-[clamp(.75rem,1vh,1rem)] min-h-0 flex-1"><p className="mb-2 text-[clamp(.52rem,.58vw,.68rem)] font-black uppercase tracking-[.1em]" style={{ color: MUTED }}>Últimos meses com avaliações</p>{active.length ? <div className="grid h-[calc(100%-1.4rem)] grid-cols-4 gap-2">{active.map((point) => <div key={point.month} className="flex min-w-0 flex-col justify-center rounded-lg px-2 py-2 text-center" style={{ background: PANEL_SOFT, border: `1px solid ${BORDER}` }}><span className="text-[clamp(.52rem,.58vw,.68rem)] font-black" style={{ color: MUTED }}>{point.label}</span><span className="mt-1 text-[clamp(.9rem,1vw,1.16rem)] font-black" style={{ color: point.averageScore >= 7 ? GREEN : AMBER }}>{point.averageScore.toFixed(1)}</span></div>)}</div> : <div className="flex h-[calc(100%-1.4rem)] items-center justify-center rounded-xl text-center" style={{ background: PANEL_SOFT, border: `1px solid ${BORDER}` }}><p className="px-4 text-[clamp(.6rem,.66vw,.76rem)] font-semibold" style={{ color: MUTED }}>Sem histórico de avaliações suficiente para exibir tendência.</p></div>}</div></div>;
}

function SectorBars({ sectors }: { sectors: TvDashboardData["sectors"] }) {
  const rows = [...sectors].sort((a, b) => a.executionRate - b.executionRate || b.planned - a.planned).slice(0, 5);
  return <div className="mt-[clamp(.55rem,.78vh,.8rem)] grid h-[calc(100%-2.8rem)] min-h-0 content-center gap-[clamp(.48rem,.68vh,.7rem)]">{rows.length ? rows.map((sector, index) => { const color = sector.executionRate >= 80 ? GREEN : sector.executionRate >= 55 ? AMBER : RED; return <div key={sector.sector} className="grid grid-cols-[minmax(105px,1.12fr)_2.25fr_68px] items-center gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5">{index === 0 && sector.executionRate < 80 && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}<span className="truncate text-[clamp(.64rem,.71vw,.82rem)] font-bold" style={{ color: index === 0 && sector.executionRate < 80 ? TEXT : MUTED }}>{sector.sector}</span></div><p className="mt-1 text-[clamp(.48rem,.54vw,.63rem)] font-semibold" style={{ color: MUTED_2 }}>{sector.realized}/{sector.planned} realizados</p></div><MetricBar value={sector.executionRate} color={color} thick /><span className="text-right text-[clamp(.8rem,.88vw,1.02rem)] font-black" style={{ color }}>{sector.executionRate}%</span></div>; }) : <p className="text-center text-sm" style={{ color: MUTED }}>Sem dados setoriais.</p>}</div>;
}

function OccurrencePanel({ occurrence }: { occurrence: TvDashboardData["occurrence"] }) {
  const total = occurrence.open + occurrence.analysis + occurrence.concluded;
  const active = occurrence.open + occurrence.analysis;
  const priority = occurrence.critical + occurrence.high;
  return <div className="mt-[clamp(.55rem,.8vh,.8rem)] flex h-[calc(100%-2.8rem)] min-h-0 flex-col"><div className="grid grid-cols-[1fr_.9fr] gap-2.5"><div className="rounded-xl px-3.5 py-2.5" style={{ background: PANEL_SOFT, border: `1px solid ${BORDER}` }}><p className="text-[clamp(.54rem,.6vw,.7rem)] font-black uppercase tracking-[.1em]" style={{ color: MUTED }}>Em tratamento</p><div className="mt-1.5 flex items-end gap-2"><span className="text-[clamp(1.85rem,2.55vw,3rem)] font-black leading-none" style={{ color: active ? AMBER : GREEN }}>{active}</span><span className="pb-1 text-[clamp(.55rem,.61vw,.71rem)] font-bold" style={{ color: MUTED }}>ativas</span></div></div><div className="rounded-xl px-3.5 py-2.5" style={{ background: priority ? `${RED}0d` : PANEL_SOFT, border: `1px solid ${priority ? `${RED}30` : BORDER}` }}><p className="text-[clamp(.54rem,.6vw,.7rem)] font-black uppercase tracking-[.1em]" style={{ color: MUTED }}>Alta / crítica</p><p className="mt-1.5 text-[clamp(1.65rem,2.25vw,2.65rem)] font-black leading-none" style={{ color: priority ? RED : GREEN }}>{priority}</p></div></div><div className="mt-[clamp(.7rem,1vh,1rem)] grid min-h-0 flex-1 content-center gap-[clamp(.46rem,.65vh,.68rem)]">{[{ label: "Abertas", value: occurrence.open, color: RED }, { label: "Em análise", value: occurrence.analysis, color: AMBER }, { label: "Concluídas", value: occurrence.concluded, color: GREEN }].map((row) => <div key={row.label}><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[clamp(.59rem,.66vw,.77rem)] font-bold" style={{ color: MUTED }}>{row.label}</span><span className="text-[clamp(.72rem,.8vw,.92rem)] font-black" style={{ color: row.color }}>{row.value}</span></div><MetricBar value={total ? (row.value / total) * 100 : 0} color={row.color} thick /></div>)}</div></div>;
}

function AttentionRadar({ items }: { items: TvDashboardData["attention"] }) {
  const colors = { info: GREEN, warning: AMBER, critical: RED };
  const labels = { info: "ESTÁVEL", warning: "ATENÇÃO", critical: "PRIORIDADE" };
  return <div className="mt-[clamp(.55rem,.78vh,.8rem)] grid h-[calc(100%-2.8rem)] min-h-0 content-center gap-[clamp(.4rem,.62vh,.65rem)]">{items.map((item, index) => { const color = colors[item.level]; return <div key={item.id} className="grid grid-cols-[6px_1fr_auto] items-center gap-3.5 rounded-xl px-[clamp(.75rem,.9vw,1rem)] py-[clamp(.58rem,.82vh,.82rem)]" style={{ background: item.level === "critical" ? `${RED}09` : "rgba(255,255,255,.026)", border: `1px solid ${item.level === "critical" ? `${RED}2e` : BORDER}` }}><span className="h-full min-h-10 rounded-full" style={{ background: color }} /><div className="min-w-0"><div className="flex items-center gap-2.5"><span className="text-[clamp(.5rem,.56vw,.65rem)] font-black uppercase tracking-[.09em]" style={{ color }}>{labels[item.level]}</span>{index === 0 && item.level !== "info" && <span className="text-[clamp(.45rem,.5vw,.58rem)] font-black uppercase tracking-[.07em]" style={{ color: MUTED_2 }}>foco agora</span>}</div><p className="mt-1 truncate text-[clamp(.72rem,.8vw,.93rem)] font-black" style={{ color: TEXT }}>{item.title}</p><p className="mt-1 truncate text-[clamp(.57rem,.64vw,.74rem)] font-semibold" style={{ color: MUTED }}>{item.detail}</p></div><div className="flex h-8 w-8 items-center justify-center rounded-lg text-[clamp(.58rem,.64vw,.73rem)] font-black" style={{ color, background: `${color}10`, border: `1px solid ${color}25` }}>{String(index + 1).padStart(2, "0")}</div></div>; })}</div>;
}

function LoadingScreen() {
  return <div className="flex h-screen items-center justify-center" style={{ background: BG }}><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-[#e31837]" /><p className="mt-4 text-xs font-black uppercase tracking-[.22em] text-white/45">Montando sala operacional</p></div></div>;
}

export function TvOperationalDashboardDistance() {
  const navigate = useNavigate();
  const year = operationalYear();
  const [clock, setClock] = useState(() => new Date());
  const query = useQuery({ queryKey: ["tv-operational-dashboard", year], queryFn: () => getTvDashboardData(year), refetchInterval: 60_000, refetchIntervalInBackground: true, staleTime: 45_000, retry: 2, refetchOnWindowFocus: true });
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const levelColor = query.data?.level === "Crítica" ? RED : query.data?.level === "Atenção" ? AMBER : GREEN;
  const scoreAccent = (query.data?.metrics.averageScore ?? 0) >= 7 ? GREEN : AMBER;
  const operationDetail = useMemo(() => { const data = query.data; if (!data) return "Carregando indicadores..."; if (data.level === "Normal") return "Operação dentro do esperado"; if (data.level === "Atenção") return "Acompanhamento requerido"; return "Prioridade operacional"; }, [query.data]);
  const fullScreen = async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { /* Smart TVs podem não expor Fullscreen API. */ } };
  if (query.isLoading && !query.data) return <LoadingScreen />;
  if (!query.data && query.isError) return <div className="flex h-screen items-center justify-center px-8 text-center" style={{ background: BG, color: TEXT }}><div><AlertTriangle className="mx-auto h-10 w-10" style={{ color: AMBER }} /><h1 className="mt-4 text-xl font-black">Painel TV indisponível</h1><p className="mt-2 text-sm" style={{ color: MUTED }}>Não foi possível consolidar os indicadores operacionais.</p><button onClick={() => query.refetch()} className="mt-5 rounded-xl px-4 py-2 text-sm font-black" style={{ background: RED, color: "white" }}>Tentar novamente</button></div></div>;
  if (!query.data) return <LoadingScreen />;
  const data = query.data;
  const refreshHasError = query.isError;
  const pendingAttention = data.metrics.overdue + data.metrics.practicalPending;
  return (
    <div className="min-h-screen overflow-auto xl:h-screen xl:min-h-0 xl:overflow-hidden" style={{ background: `radial-gradient(circle at 72% -15%,rgba(227,24,55,.105),transparent 31%),radial-gradient(circle at -8% 90%,rgba(79,141,247,.07),transparent 30%),linear-gradient(180deg,#080a0f 0%,#07090d 100%)`, color: TEXT, fontFamily: "Inter, sans-serif" }}>
      <div className="pointer-events-none fixed inset-0 opacity-[.16]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px)", backgroundSize: "42px 42px" }} />
      <main className="relative mx-auto grid min-h-[980px] w-full min-w-[320px] max-w-[2400px] grid-rows-[auto_auto_auto_auto] gap-3 p-3 sm:p-4 xl:h-screen xl:min-h-0 xl:grid-rows-[8.5vh_17.5vh_37.5vh_31.5vh] xl:gap-[1.05vh] xl:p-[1.25vh_1.05vw]">
        <header className="flex min-h-[76px] items-center justify-between gap-4 rounded-[1.15rem] px-[clamp(.9rem,1.15vw,1.4rem)] py-2" style={{ background: "linear-gradient(90deg,rgba(18,21,29,.98),rgba(11,14,20,.96))", border: `1px solid ${BORDER_STRONG}`, boxShadow: "0 14px 40px rgba(0,0,0,.24)" }}>
          <div className="flex min-w-0 items-center gap-[clamp(.7rem,1vw,1.1rem)]"><div className="flex h-[clamp(2.7rem,3.5vw,3.7rem)] w-[clamp(2.7rem,3.5vw,3.7rem)] shrink-0 items-center justify-center rounded-[1rem]" style={{ background: "linear-gradient(145deg,#ef2847,#ad0d2a)", boxShadow: "0 10px 28px rgba(227,24,55,.22)" }}><span className="text-[clamp(1.05rem,1.4vw,1.5rem)] font-black text-white">S</span></div><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2.5"><h1 className="truncate text-[clamp(1.05rem,1.5vw,1.65rem)] font-black tracking-[-.045em]">SEGEMPAT <span style={{ color: "#667080" }}>·</span> PAINEL SITUACIONAL</h1>{data.isDemo && <span className="rounded-md px-2 py-1 text-[clamp(.42rem,.48vw,.56rem)] font-black uppercase tracking-[.12em]" style={{ color: AMBER, background: `${AMBER}12`, border: `1px solid ${AMBER}30` }}>Dados fictícios</span>}</div><p className="mt-0.5 truncate text-[clamp(.56rem,.63vw,.73rem)] font-semibold" style={{ color: MUTED }}>Sala Operacional · Visão situacional agregada · Sem exposição de dados individuais · Porto de Maceió</p></div></div>
          <div className="flex shrink-0 items-center gap-[clamp(.45rem,.7vw,.8rem)]"><div className="hidden min-w-[158px] lg:block"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: refreshHasError ? RED : levelColor, boxShadow: `0 0 12px ${refreshHasError ? RED : levelColor}65` }} /><span className="text-[clamp(.57rem,.63vw,.73rem)] font-black uppercase tracking-[.11em]" style={{ color: refreshHasError ? RED : levelColor }}>{refreshHasError ? "Atualização pendente" : data.level}</span></div><p className="mt-1 text-[clamp(.48rem,.54vw,.62rem)] font-semibold" style={{ color: MUTED }}>{refreshHasError ? "Exibindo último consolidado válido" : operationDetail}</p></div><div className="hidden border-l pl-[clamp(.65rem,.85vw,.95rem)] sm:block" style={{ borderColor: BORDER }}><p className="text-right text-[clamp(1.12rem,1.55vw,1.65rem)] font-black tabular-nums tracking-[-.025em]">{formatTime(clock)}</p><p className="text-right text-[clamp(.47rem,.53vw,.61rem)] font-bold" style={{ color: MUTED }}>{formatDate(clock)}</p></div><div className="hidden border-l pl-[clamp(.55rem,.75vw,.85rem)] 2xl:block" style={{ borderColor: BORDER }}><p className="text-[clamp(.43rem,.48vw,.56rem)] font-black uppercase tracking-[.1em]" style={{ color: MUTED_2 }}>Último consolidado</p><p className="mt-1 text-[clamp(.55rem,.61vw,.7rem)] font-black tabular-nums" style={{ color: TEXT }}>{timeOnly(data.generatedAt)}</p></div><button onClick={() => query.refetch()} title="Atualizar agora" aria-label="Atualizar painel agora" className="flex h-[clamp(2.15rem,2.6vw,2.75rem)] w-[clamp(2.15rem,2.6vw,2.75rem)] items-center justify-center rounded-xl transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" style={{ border: `1px solid ${BORDER}`, color: query.isFetching ? TEXT : MUTED }}><RefreshCcw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></button><button onClick={fullScreen} title="Tela cheia" aria-label="Alternar tela cheia" className="flex h-[clamp(2.15rem,2.6vw,2.75rem)] w-[clamp(2.15rem,2.6vw,2.75rem)] items-center justify-center rounded-xl transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" style={{ border: `1px solid ${BORDER}`, color: MUTED }}><Expand className="h-4 w-4" /></button><button onClick={() => navigate({ to: "/admin" })} title="Sair do Painel TV" aria-label="Sair do Painel TV" className="flex h-[clamp(2.15rem,2.6vw,2.75rem)] w-[clamp(2.15rem,2.6vw,2.75rem)] items-center justify-center rounded-xl transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" style={{ border: `1px solid ${BORDER}`, color: MUTED }}><X className="h-4 w-4" /></button></div>
        </header>
        <section className="grid min-h-0 gap-2.5 xl:grid-cols-[1.12fr_2.1fr]"><StatusHero data={data} accent={levelColor} /><div className="grid min-h-0 grid-cols-2 gap-2.5 sm:grid-cols-3"><KpiCard label="Equipe ativa" value={data.metrics.activeEmployees} detail="profissionais operacionais" icon={Users} accent={BLUE} /><KpiCard label="Execução do mês" value={`${data.metrics.monthExecutionRate}%`} detail={`${data.metrics.annualExecutionRate}% no acumulado anual`} icon={Target} accent={data.metrics.monthExecutionRate >= 80 ? GREEN : AMBER} /><KpiCard label="Pendências" value={pendingAttention} detail={`${data.metrics.overdue} vencida(s) · ${data.metrics.practicalPending} prática(s)`} icon={Clock3} accent={pendingAttention ? AMBER : GREEN} alert={data.metrics.overdue > 0} /><KpiCard label="Aprovação geral" value={`${data.metrics.approvalRate}%`} detail="resultado consolidado das provas" icon={CheckCircle2} accent={data.metrics.approvalRate >= 75 ? GREEN : AMBER} /><KpiCard label="Média geral" value={data.metrics.averageScore.toFixed(1)} detail="escala de desempenho de 0 a 10" icon={TrendingUp} accent={scoreAccent} /><KpiCard label="Ocorrências ativas" value={data.metrics.activeOccurrences} detail={data.metrics.criticalOccurrences ? `${data.metrics.criticalOccurrences} crítica(s) ativa(s)` : "abertas ou em análise"} icon={AlertTriangle} accent={data.metrics.criticalOccurrences ? RED : data.metrics.activeOccurrences ? AMBER : GREEN} alert={data.metrics.criticalOccurrences > 0} /></div></section>
        <section className="grid min-h-0 gap-2.5 xl:grid-cols-[1.18fr_1.12fr_.78fr]"><Panel accent={levelColor} className="min-h-[320px] p-[clamp(.9rem,1.05vw,1.2rem)]"><PanelTitle icon={Activity} title="Radar Operacional" subtitle="Prioridades agregadas ordenadas para leitura imediata" accent={levelColor} aside={<div className="hidden rounded-lg px-2.5 py-1 text-[clamp(.48rem,.53vw,.61rem)] font-black uppercase tracking-[.08em] 2xl:block" style={{ color: levelColor, background: `${levelColor}10`, border: `1px solid ${levelColor}25` }}>{data.attention.length} sinal{data.attention.length !== 1 ? "s" : ""}</div>} /><AttentionRadar items={data.attention} /></Panel><Panel accent={RED} className="min-h-[320px] p-[clamp(.9rem,1.05vw,1.2rem)]"><PanelTitle icon={BarChart3} title="Ritmo Operacional" subtitle="Execução mensal e aprovação com leitura simplificada" accent={RED} /><RhythmPanel months={data.months} /></Panel><Panel accent={GREEN} className="min-h-[300px] p-[clamp(.9rem,1.05vw,1.2rem)]"><PanelTitle icon={ShieldCheck} title="Saúde da Equipe" subtitle="Distribuição agregada do risco de desempenho" accent={GREEN} /><RiskDonut data={data.risk} /></Panel></section>
        <section className="grid min-h-0 gap-2.5 pb-1 md:grid-cols-2 xl:grid-cols-[1.08fr_.84fr_1fr]"><Panel accent={PURPLE} className="min-h-[245px] p-[clamp(.88rem,1vw,1.12rem)]"><PanelTitle icon={Target} title="Execução por Setor" subtitle="Menores execuções aparecem primeiro" accent={PURPLE} /><SectorBars sectors={data.sectors} /></Panel><Panel accent={AMBER} className="min-h-[245px] p-[clamp(.88rem,1vw,1.12rem)]"><PanelTitle icon={AlertTriangle} title="Ocorrências" subtitle="Tratamento, conclusão e severidade agregada" accent={AMBER} /><OccurrencePanel occurrence={data.occurrence} /></Panel><Panel accent={BLUE} className="min-h-[245px] p-[clamp(.88rem,1vw,1.12rem)]"><PanelTitle icon={CircleGauge} title="Desempenho" subtitle="Média, aprovação e referência da meta 7,0" accent={BLUE} /><PerformancePanel months={data.months} average={data.metrics.averageScore} approvalRate={data.metrics.approvalRate} /></Panel></section>
      </main>
      <div className="pointer-events-none fixed bottom-1.5 right-3 hidden items-center gap-2 text-[10px] font-semibold text-white/30 xl:flex"><span className="h-1.5 w-1.5 rounded-full" style={{ background: refreshHasError ? RED : GREEN }} />Atualização automática a cada 60 s · painel agregado para exposição contínua</div>
    </div>
  );
}
