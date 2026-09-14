import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function SystemSurface({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
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
      className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6 lg:p-7"
      style={{
        background: "linear-gradient(135deg,#171117 0%,#310912 54%,#160f14 100%)",
        border: "1px solid rgba(200,16,46,.28)",
        boxShadow: "0 12px 38px rgba(80,0,18,.16)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />
      <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.22),transparent 68%)" }} />
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
    <div className="flex items-center gap-3 border-b p-4 lg:px-5" style={{ borderColor: "var(--border)" }}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}
      >
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{title}</h2>
        <p className="mt-0.5 text-[11px] leading-4" style={{ color: "var(--text-4)" }}>{description}</p>
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
    <SystemSurface className="relative min-h-[132px] overflow-hidden p-4 sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
      <div className="absolute -right-9 -top-9 h-28 w-28 rounded-full opacity-[.055]" style={{ background: accent }} />
      <div className="relative flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[.11em]" style={{ color: "var(--text-4)" }}>{label}</p>
          <p className="mt-3 text-[2rem] font-black leading-none tracking-tight" style={{ color: "var(--text-1)" }}>{value}</p>
          <p className="mt-3 text-xs font-semibold leading-5" style={{ color: "var(--text-3)" }}>{detail}</p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}
        >
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
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
