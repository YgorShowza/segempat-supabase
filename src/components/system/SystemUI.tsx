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
