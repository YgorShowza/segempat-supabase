import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock3,
  Filter,
  FilterX,
  Link2,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, type CronogramaEntry } from "@/lib/cronograma";

type Props = {
  entries: CronogramaEntry[];
  loading: boolean;
  monthLabel: string;
  canManage?: boolean;
};

const STATUS = {
  Pendente: { color: "#f59e0b", bg: "rgba(245,158,11,.10)", icon: Clock3 },
  Realizado: { color: "#10b981", bg: "rgba(16,185,129,.10)", icon: CheckCircle2 },
  Justificado: { color: "#3b82f6", bg: "rgba(59,130,246,.10)", icon: ShieldCheck },
} as const;

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function CronogramaGroupedListPolished({ entries, loading, monthLabel, canManage = false }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const [sector, setSector] = useState("Todos");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const sectors = useMemo(
    () => ["Todos", ...Array.from(new Set(entries.map((entry) => entry.employee_sector).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"))],
    [entries],
  );

  const hasFilters = Boolean(search.trim()) || status !== "Todos" || sector !== "Todos";

  const filtered = useMemo(() => {
    const query = normalizeText(search);
    return entries.filter((entry) => {
      if (status !== "Todos" && entry.status !== status) return false;
      if (sector !== "Todos" && entry.employee_sector !== sector) return false;
      if (!query) return true;
      return [entry.employee_name, entry.employee_matricula, entry.employee_sector, entry.theme]
        .some((value) => normalizeText(value).includes(query));
    });
  }, [entries, search, sector, status]);

  const groups = useMemo(() => {
    const map = new Map<string, CronogramaEntry[]>();
    filtered.forEach((entry) => {
      const key = entry.employee_id || entry.employee_matricula;
      const rows = map.get(key) ?? [];
      rows.push(entry);
      map.set(key, rows);
    });
    return Array.from(map.entries())
      .map(([key, rows]) => ({
        key,
        rows: rows.sort((a, b) => (a.planned_date || "9999-99-99").localeCompare(b.planned_date || "9999-99-99")),
      }))
      .sort((a, b) => (a.rows[0]?.employee_name || "").localeCompare(b.rows[0]?.employee_name || "", "pt-BR"));
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setStatus("Todos");
    setSector("Todos");
  };

  if (loading) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center py-16" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} />
        <p className="mt-3 text-xs font-semibold" style={{ color: "var(--text-4)" }}>Carregando lançamentos do mês...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl p-3 sm:p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Filter className="hidden h-4 w-4 shrink-0 sm:block" style={{ color: "var(--accent)" }} />
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar colaborador, matrícula, setor ou tema..."
                className="pl-10"
                aria-label="Buscar no cronograma"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="min-w-0 sm:w-[160px]" aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
              <SelectContent>{["Todos", "Pendente", "Realizado", "Justificado"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="min-w-0 sm:w-[180px]" aria-label="Filtrar por setor"><SelectValue /></SelectTrigger>
              <SelectContent>{sectors.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {hasFilters && (
            <Button type="button" variant="ghost" className="w-full shrink-0 sm:w-auto" onClick={clearFilters}>
              <FilterX className="mr-2 h-4 w-4" /> Limpar filtros
            </Button>
          )}

          {canManage && (
            <Button variant="outline" asChild className="w-full shrink-0 sm:w-auto">
              <Link to="/cronograma-gestao"><Settings2 className="mr-2 h-4 w-4" /> Gerenciar registros</Link>
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-4)" }}>
          <span>{filtered.length} de {entries.length} lançamento{entries.length === 1 ? "" : "s"} exibido{filtered.length === 1 ? "" : "s"}</span>
          <span>{groups.length} colaborador{groups.length === 1 ? "" : "es"}</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
        <div className="flex items-center gap-3 px-3 py-3 sm:px-4" style={{ background: "var(--bg-surface-2)", borderBottom: "1px solid var(--border)" }}>
          <CalendarDays className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Por colaborador</p>
            <p className="truncate text-[11px] capitalize" style={{ color: "var(--text-4)" }}>{monthLabel}</p>
          </div>
          <span className="shrink-0 text-[11px] font-bold sm:text-xs" style={{ color: "var(--text-4)" }}>
            {groups.length} {groups.length === 1 ? "colaborador" : "colaboradores"}
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="p-8 text-center sm:p-12">
            <CalendarDays className="mx-auto h-10 w-10 opacity-25" style={{ color: "var(--text-4)" }} />
            <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>
              {entries.length === 0 ? "Nenhum lançamento neste mês." : "Nenhum lançamento corresponde aos filtros."}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs" style={{ color: "var(--text-4)" }}>
              {entries.length === 0
                ? canManage ? "Use Novo registro ou Gerenciar registros para iniciar o planejamento deste período." : "O planejamento deste período ainda não possui lançamentos."
                : "Ajuste a busca, o status ou o setor para ampliar os resultados."}
            </p>
            {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearFilters}><FilterX className="mr-2 h-3.5 w-3.5" /> Limpar filtros</Button>}
          </div>
        ) : groups.map(({ key, rows }) => {
          const first = rows[0];
          const realized = rows.filter((row) => row.status === "Realizado").length;
          const pending = rows.filter((row) => row.status === "Pendente").length;
          const justified = rows.filter((row) => row.status === "Justificado").length;
          const executable = rows.filter((row) => row.status !== "Justificado").length;
          const executionRate = executable ? Math.round((realized / executable) * 100) : 0;
          const expanded = Boolean(open[key]);
          const regionId = `cronograma-collaborator-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

          return (
            <div key={key} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <button
                type="button"
                onClick={() => setOpen((current) => ({ ...current, [key]: !current[key] }))}
                aria-expanded={expanded}
                aria-controls={regionId}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:px-4"
                style={{ background: expanded ? "var(--bg-surface-2)" : "transparent" }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black" style={{ background: "linear-gradient(135deg,#C8A000,#FFD700)", color: "#0a0a0a", boxShadow: "0 2px 8px rgba(200,160,0,.28)" }}>
                  {first.employee_name?.charAt(0) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold" style={{ color: "var(--text-1)" }}>{first.employee_name}</p>
                  <p className="truncate text-xs" style={{ color: "var(--text-4)" }}>Mat. {first.employee_matricula} · {first.employee_sector}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1 sm:hidden">
                    {realized > 0 && <Badge value={`✓ ${realized}`} color="#10b981" />}
                    {pending > 0 && <Badge value={`⏳ ${pending}`} color="#f59e0b" />}
                    {justified > 0 && <Badge value={`🛡 ${justified}`} color="#3b82f6" />}
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>{rows.length} reg.</span>
                  </div>
                </div>
                <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                  {realized > 0 && <Badge value={`✓ ${realized}`} color="#10b981" />}
                  {pending > 0 && <Badge value={`⏳ ${pending}`} color="#f59e0b" />}
                  {justified > 0 && <Badge value={`🛡 ${justified}`} color="#3b82f6" />}
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--bg-surface-3)", color: "var(--text-3)" }}>{rows.length} reg.</span>
                </div>
                {expanded ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "var(--text-4)" }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--text-4)" }} />}
              </button>

              {expanded && (
                <div id={regionId} className="space-y-3 px-3 pb-4 pt-1 sm:px-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-surface-3)" }}>
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${executionRate}%`, background: executionRate >= 80 ? "#10b981" : executionRate >= 50 ? "#f59e0b" : "#ef4444" }} />
                      </div>
                      <span className="shrink-0 text-[10px] font-black" style={{ color: executionRate >= 80 ? "#10b981" : executionRate >= 50 ? "#f59e0b" : "var(--text-4)" }}>{executionRate}% executado</span>
                    </div>
                    <p className="mt-1 text-[9px]" style={{ color: "var(--text-4)" }}>Realizados entre os registros executáveis; justificativas ficam fora deste cálculo.</p>
                  </div>
                  {rows.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Badge({ value, color }: { value: string; color: string }) {
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}18`, color, border: `1px solid ${color}44` }}>{value}</span>;
}

function EntryCard({ entry }: { entry: CronogramaEntry }) {
  const config = STATUS[entry.status];
  const Icon = config.icon;
  return (
    <article className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-[220px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="break-words text-sm font-bold" style={{ color: "var(--text-1)" }}>{entry.theme}</p>
            {entry.exam_id && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(16,185,129,.1)", color: "#10b981", border: "1px solid rgba(16,185,129,.25)" }}><Link2 className="h-3 w-3" /> Prova vinculada</span>}
            {!!entry.question_bank_ids?.length && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(200,160,0,.1)", color: "#C8A000", border: "1px solid rgba(200,160,0,.25)" }}><BookOpen className="h-3 w-3" /> {entry.question_bank_ids.length} questão{entry.question_bank_ids.length === 1 ? "" : "ões"}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-4)" }}>
            <span>Prevista: <strong style={{ color: "var(--text-3)" }}>{formatDate(entry.planned_date)}</strong></span>
            {entry.status === "Realizado" && <span>Concluída: <strong style={{ color: "var(--text-3)" }}>{formatDate(entry.completion_date)}</strong></span>}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: config.bg, color: config.color }}><Icon className="h-3 w-3" /> {entry.status}</span>
      </div>

      {entry.status === "Justificado" && entry.justification && (
        <div className="mt-2 rounded-lg p-2.5 text-xs" style={{ background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.2)", color: "var(--text-2)" }}>
          <strong style={{ color: "#3b82f6" }}>Justificativa:</strong> {entry.justification}
        </div>
      )}
      {entry.status === "Pendente" && <p className="mt-2 text-[11px]" style={{ color: "var(--text-4)" }}>Aguardando realização{entry.planned_date ? ` · previsto ${formatDate(entry.planned_date)}` : " · sem data prevista"}</p>}
      {entry.status === "Realizado" && <p className="mt-2 text-[11px]" style={{ color: "var(--text-4)" }}>Registro concluído{entry.exam_title ? ` · ${entry.exam_title}` : ""}</p>}
      {entry.notes && <p className="mt-2 break-words text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>{entry.notes}</p>}
    </article>
  );
}
