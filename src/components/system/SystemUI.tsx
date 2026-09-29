import type { ComponentProps, CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function SystemSurface({
  children,
  className = "",
  style,
  ...props
}: ComponentProps<"section"> & { style?: CSSProperties }) {
  return (
    <section
      {...props}
      className={`segempat-system-surface rounded-2xl ${className}`}
      style={style}
    >
      {children}
    </section>
  );
}

export function SystemPageHero({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      className="segempat-page-hero relative overflow-hidden rounded-[1.75rem] p-5 md:p-6 lg:p-7"
    >
      <div className="segempat-page-hero-grid pointer-events-none absolute inset-0" />
      <div className="segempat-page-hero-glow pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-white/45">
            <Icon className="h-4 w-4" /> {eyebrow}
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">{title}</h1>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{description}</div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}

export function SystemSectionHeader({
  icon: Icon,
  title,
  description,
  action,
  accent = "var(--accent)",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="segempat-section-header flex items-center gap-3 border-b p-4 lg:px-5">
      <span className="segempat-section-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="segempat-section-title truncate text-sm font-black">{title}</h2>
        <p className="segempat-section-description mt-0.5 text-[11px] leading-4">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function SystemMetricCard({
  label,
  value,
  icon: Icon,
  detail,
  accent,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  detail: string;
  accent: string;
}) {
  return (
    <SystemSurface className="segempat-metric-card relative min-h-[132px] overflow-hidden p-4 sm:p-5">
      <div className="segempat-metric-accent absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
      <div className="segempat-metric-aura absolute -right-9 -top-9 h-28 w-28 rounded-full opacity-[.055]" style={{ background: accent }} />
      <div className="segempat-metric-content relative flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="segempat-metric-label text-[11px] font-black uppercase tracking-[.11em]">{label}</p>
          <p className="segempat-metric-value mt-3 text-[2rem] font-black leading-none tracking-tight">{value}</p>
          <p className="segempat-metric-detail mt-3 text-xs font-semibold leading-5">{detail}</p>
        </div>
        <div
          className="segempat-metric-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}
        >
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
      </div>
    </SystemSurface>
  );
}

export function SystemDataWorkspaceSkeleton({
  metricCount = 4,
  rowCount = 6,
}: {
  metricCount?: number;
  rowCount?: number;
}) {
  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 pb-10" role="status" aria-live="polite" aria-label="Carregando área de trabalho">
      <SystemSurface className="p-6 lg:p-7">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-4 h-8 w-full max-w-sm" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      </SystemSurface>
      {metricCount > 0 && (
        <div className={`grid gap-3 sm:grid-cols-2 ${metricCount >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
          {Array.from({ length: metricCount }, (_, index) => (
            <SystemSurface key={index} className="min-h-[116px] p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-8 w-16" />
              <Skeleton className="mt-3 h-3 w-32" />
            </SystemSurface>
          ))}
        </div>
      )}
      <SystemSurface className="p-4 lg:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </SystemSurface>
      <SystemSurface className="overflow-hidden p-4 lg:p-5">
        <div className="space-y-3">
          {Array.from({ length: rowCount }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
        </div>
      </SystemSurface>
    </div>
  );
}

export function SystemPanelSkeleton({
  rows = 5,
  label = "Carregando conteúdo",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <SystemSurface className="p-4 lg:p-5" role="status" aria-live="polite" aria-label={label}>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-3 h-3 w-full max-w-xl" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
      </div>
    </SystemSurface>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl ${className}`} style={{ background: "var(--bg-surface-2)" }} />;
}

export function SystemListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 pb-10" role="status" aria-live="polite" aria-label="Carregando conteúdo">
      <SystemSurface className="p-6 lg:p-7">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-9 w-full max-w-md" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      </SystemSurface>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[132px] w-full" />)}
      </div>
      <SystemSurface className="overflow-hidden">
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}><Skeleton className="h-10 w-full" /></div>
        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,.8fr)_180px]">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </SystemSurface>
    </div>
  );
}

export function SystemDashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 pb-10" role="status" aria-live="polite" aria-label="Carregando dashboard">
      <SystemSurface className="overflow-hidden p-6 lg:p-8">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-9 w-full max-w-sm" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
      </SystemSurface>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SystemSurface key={index} className="min-h-[132px] p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-4 h-3 w-36" />
          </SystemSurface>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <SystemSurface className="p-5 xl:col-span-7">
          <Skeleton className="h-4 w-44" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
        </SystemSurface>
        <SystemSurface className="p-5 xl:col-span-5">
          <Skeleton className="h-4 w-48" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}
          </div>
        </SystemSurface>
      </div>
    </div>
  );
}
