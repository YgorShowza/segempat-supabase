import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Award, CheckCircle2, Clock3, ExternalLink, FileDown, FileSignature, FilterX, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { hasPermission } from "@/lib/access-control";
import { getSignatureUrl, listExamSignatureEvidence, type ExamSignatureEvidence } from "@/lib/exams";
import { listCertificateRecords, type CertificateRecord } from "@/lib/certificate-records";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function fmt(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Maceio", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

type WorkflowState = "valid" | "signature-pending" | "formalization-pending" | "revoked" | "not-approved";
type FilterState = "all" | WorkflowState;

function workflowState(row: ExamSignatureEvidence, record?: CertificateRecord): WorkflowState {
  if (!row.passed) return "not-approved";
  if (record?.certificate_revoked) return "revoked";
  const signed = Boolean(row.signature_path && row.signed_at);
  if (!signed) return "signature-pending";
  if (record?.formally_issued) return "valid";
  return "formalization-pending";
}

const STATE_META: Record<WorkflowState, { label: string; color: string; background: string }> = {
  valid: { label: "CERTIFICADO VÁLIDO", color: "#10b981", background: "rgba(16,185,129,.09)" },
  "signature-pending": { label: "ASSINATURA PENDENTE", color: "#f59e0b", background: "rgba(245,158,11,.09)" },
  "formalization-pending": { label: "FORMALIZAÇÃO PENDENTE", color: "#3b82f6", background: "rgba(59,130,246,.09)" },
  revoked: { label: "CERTIFICADO REVOGADO", color: "#ef4444", background: "rgba(239,68,68,.09)" },
  "not-approved": { label: "SEM CERTIFICADO", color: "#7c828d", background: "rgba(124,130,141,.10)" },
};

export function ExamSignaturesWorkspace() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canManageCertificates = hasPermission(user, "certificates.manage");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<FilterState>("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");

  const query = useQuery({ queryKey: ["exam-signature-evidence"], queryFn: listExamSignatureEvidence, enabled: canManageCertificates, staleTime: 30_000 });
  const certificatesQuery = useQuery({ queryKey: ["certificate-validation-records"], queryFn: listCertificateRecords, enabled: canManageCertificates, staleTime: 30_000 });
  const rows: ExamSignatureEvidence[] = query.data ?? [];
  const certificateByAttempt = useMemo(() => new Map((certificatesQuery.data ?? []).map((record) => [record.id, record])), [certificatesQuery.data]);

  const years = useMemo(() => Array.from(new Set(rows.map((row) => new Date(row.finished_at).getFullYear()).filter(Number.isFinite))).sort((a, b) => b - a), [rows]);
  const sectors = useMemo(() => Array.from(new Set(rows.map((row) => String(row.employee_sector || "—").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

  const counts = useMemo(() => {
    const stateOf = (row: ExamSignatureEvidence) => workflowState(row, certificateByAttempt.get(row.id));
    return {
      valid: rows.filter((row) => stateOf(row) === "valid").length,
      signature: rows.filter((row) => stateOf(row) === "signature-pending").length,
      formalization: rows.filter((row) => stateOf(row) === "formalization-pending").length,
      revoked: rows.filter((row) => stateOf(row) === "revoked").length,
      notApproved: rows.filter((row) => stateOf(row) === "not-approved").length,
    };
  }, [rows, certificateByAttempt]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(search);
    return rows.filter((row) => {
      const record = certificateByAttempt.get(row.id);
      const state = workflowState(row, record);
      if (stateFilter !== "all" && state !== stateFilter) return false;
      if (yearFilter !== "all" && String(new Date(row.finished_at).getFullYear()) !== yearFilter) return false;
      if (sectorFilter !== "all" && String(row.employee_sector || "—") !== sectorFilter) return false;
      if (!needle) return true;
      const haystack = normalizeSearch([row.employee_name, row.matricula, row.employee_sector, row.exam_title, row.certificate_code, STATE_META[state].label].filter(Boolean).join(" "));
      return haystack.includes(needle);
    });
  }, [rows, search, stateFilter, yearFilter, sectorFilter, certificateByAttempt]);

  if (userLoading) return <Loading />;
  if (!canManageCertificates) return <Restricted />;

  const dataLoading = query.isLoading || certificatesQuery.isLoading;
  const dataError = query.isError || certificatesQuery.isError;
  const dataReady = !dataLoading && !dataError;
  const filtersActive = Boolean(search || stateFilter !== "all" || yearFilter !== "all" || sectorFilter !== "all");

  const clearFilters = () => {
    setSearch("");
    setStateFilter("all");
    setYearFilter("all");
    setSectorFilter("all");
  };

  const openCertificate = (row: ExamSignatureEvidence) => {
    const record = certificateByAttempt.get(row.id);
    const state = workflowState(row, record);
    if (state !== "valid") {
      const message = state === "revoked" ? "Este certificado foi revogado e não pode ser emitido como vigente." : state === "signature-pending" ? "A assinatura eletrônica precisa ser registrada antes da emissão." : state === "formalization-pending" ? "A aprovação já foi assinada, mas o registro formal do certificado ainda não está vigente." : "Avaliação não aprovada não gera certificado.";
      toast.error(message);
      return;
    }
    window.location.assign(`/certificado/${encodeURIComponent(row.id)}`);
  };

  const openSignature = async (signaturePath: string) => {
    try {
      const url = await getSignatureUrl(signaturePath, 300);
      window.location.assign(url);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a assinatura");
    }
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.7rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118 0%,#2b0b13 50%,#111216 100%)", border: "1px solid rgba(200,16,46,.26)", boxShadow: "0 10px 34px rgba(200,16,46,.12)" }}>
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.22),transparent 70%)" }} />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-white/40"><FileSignature className="h-4 w-4" /> Fluxo documental</div><h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Certificados e Assinaturas</h1><p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/55">Acompanhe o ciclo completo: aprovação, assinatura eletrônica, formalização do registro e emissão vigente. Cada etapa tem situação própria para evitar certificados prematuros ou inválidos.</p></div>{dataReady && <div className="rounded-xl px-3 py-2 text-xs font-bold text-white/70" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>{rows.length} registro{rows.length === 1 ? "" : "s"} · {counts.notApproved} sem direito a certificado</div>}</div>
    </section>

    <section className="grid gap-2 rounded-2xl p-4 sm:grid-cols-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }} aria-label="Etapas para emissão"><ProcessStep number="1" title="Aprovação" text="Resultado aprovado" /><ProcessStep number="2" title="Assinatura" text="Aceite eletrônico" /><ProcessStep number="3" title="Formalização" text="Registro correspondente" /><ProcessStep number="4" title="Emissão" text="Documento vigente" /></section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Certificados válidos" value={dataReady ? counts.valid : "—"} state="valid" /><Metric label="Assinatura pendente" value={dataReady ? counts.signature : "—"} state="signature-pending" /><Metric label="Formalização pendente" value={dataReady ? counts.formalization : "—"} state="formalization-pending" /><Metric label="Revogados" value={dataReady ? counts.revoked : "—"} state="revoked" /></div>

    <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px_140px_170px_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Colaborador, matrícula, setor, atividade ou código" className="pl-9" /></div><select aria-label="Filtrar situação documental" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as FilterState)} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="all">Todas as situações</option><option value="valid">Certificado válido</option><option value="signature-pending">Assinatura pendente</option><option value="formalization-pending">Formalização pendente</option><option value="revoked">Revogado</option><option value="not-approved">Sem certificado</option></select><select aria-label="Filtrar ano" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="all">Todos os anos</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select><select aria-label="Filtrar setor" value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="all">Todos os setores</option>{sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select><Button variant="outline" disabled={!filtersActive} onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" /> Limpar</Button></div>
    </section>

    {dataLoading ? <Loading /> : dataError ? <section role="alert" className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar certificados e assinaturas.</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Os indicadores ficam indisponíveis para não transformar falha de consulta em zero operacional.</p><Button variant="outline" className="mt-4" onClick={() => { query.refetch(); certificatesQuery.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></section> : filtered.length === 0 ? <section className="rounded-2xl p-10 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><FileSignature className="mx-auto h-10 w-10 opacity-25" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>{rows.length === 0 ? "Nenhuma avaliação disponível para o fluxo documental." : "Nenhum registro corresponde aos filtros."}</p>{filtersActive && <Button variant="ghost" className="mt-2" onClick={clearFilters}>Limpar filtros</Button>}</section> : <div className="space-y-3">{filtered.map((row) => {
      const record = certificateByAttempt.get(row.id);
      const state = workflowState(row, record);
      const meta = STATE_META[state];
      const signed = Boolean(row.signature_path && row.signed_at);
      return <article key={row.id} className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}><div className="h-[3px]" style={{ background: meta.color }} /><div className="p-4 md:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 break-words text-sm font-black" style={{ color: "var(--text-1)" }}>{row.employee_name}</p><span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ background: meta.background, color: meta.color }}>{meta.label}</span></div><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>Mat. {row.matricula ?? "—"} · {row.employee_sector ?? "—"} · {row.exam_title} · Nota {Number(row.score).toFixed(1)}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-4)" }}><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Prova: {fmt(row.finished_at)}</span>{signed && <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Assinada por {row.signature_name || row.employee_name} em {fmt(row.signed_at)}</span>}{state === "revoked" && <span className="inline-flex items-center gap-1 text-red-500"><XCircle className="h-3 w-3" /> Revogado em {fmt(record?.revoked_at)}{record?.revoked_reason ? ` · ${record.revoked_reason}` : ""}</span>}</div>{row.certificate_code && <div className="mt-3 inline-flex max-w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-black" style={{ background: meta.background, color: meta.color, border: `1px dashed ${meta.color}55` }}><span className="break-all">{row.certificate_code}</span></div>}</div><div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:min-w-48 lg:flex-col">{state === "valid" && <Button className="gap-2 font-bold" onClick={() => openCertificate(row)}><FileDown className="h-4 w-4" /> Visualizar certificado</Button>}{signed && <Button variant="outline" className="gap-2" onClick={() => row.signature_path && openSignature(row.signature_path)}><ExternalLink className="h-4 w-4" /> Ver assinatura</Button>}</div></div></div></article>;
    })}</div>}
    {!dataLoading && !dataError && <p className="text-right text-[11px] font-semibold" style={{ color: "var(--text-4)" }}>{filtered.length} de {rows.length} registro{rows.length === 1 ? "" : "s"}</p>}
  </div>;
}

function ProcessStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ background: "rgba(200,16,46,.10)", color: "#C8102E" }}>{number}</div><div><p className="text-xs font-black" style={{ color: "var(--text-1)" }}>{title}</p><p className="text-[10px]" style={{ color: "var(--text-4)" }}>{text}</p></div></div>;
}

function Metric({ label, value, state }: { label: string; value: number | string; state: WorkflowState }) {
  const meta = STATE_META[state];
  return <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{value}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: meta.background, color: meta.color }}>{state === "valid" ? <Award className="h-4 w-4" /> : state === "revoked" ? <XCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</div></div></section>;
}

function Restricted() {
  return <div className="mx-auto max-w-xl rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><ShieldCheck className="mx-auto h-10 w-10" style={{ color: "var(--accent)" }} /><h1 className="mt-3 text-lg font-black" style={{ color: "var(--text-1)" }}>Acesso restrito</h1><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Seu nível de acesso não possui permissão para gerenciar certificados e assinaturas.</p></div>;
}

function Loading() {
  return <div className="flex flex-col items-center justify-center gap-3 py-14" role="status" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /><p className="text-xs font-semibold" style={{ color: "var(--text-4)" }}>Carregando fluxo documental...</p></div>;
}
