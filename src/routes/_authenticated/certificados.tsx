import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Clock3, Copy, FileBadge2, FilterX, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAvailableExams, listMyAttempts, type ExamAttempt } from "@/lib/exams";
import { listMyCertificateStates, type MyCertificateState } from "@/lib/certificate-records";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/certificados")({ head: () => ({ meta: [{ title: "Certificados · SEGEMPAT" }] }), component: CertificatesPage });

type MyCertificateStatus = "valid" | "signature-pending" | "formalization-pending" | "revoked";
type StatusFilter = "all" | MyCertificateStatus;

const STATUS_META: Record<MyCertificateStatus, { label: string; color: string; background: string; description: string }> = {
  valid: { label: "VÁLIDO", color: "#10b981", background: "rgba(16,185,129,.09)", description: "Documento formal vigente e disponível para emissão pela Inspetoria." },
  "signature-pending": { label: "ASSINATURA PENDENTE", color: "#f59e0b", background: "rgba(245,158,11,.09)", description: "Aprovação registrada; falta concluir a assinatura eletrônica vinculada à avaliação." },
  "formalization-pending": { label: "EM FORMALIZAÇÃO", color: "#3b82f6", background: "rgba(59,130,246,.09)", description: "Aprovação já assinada; o registro formal do certificado ainda não está vigente." },
  revoked: { label: "REVOGADO", color: "#ef4444", background: "rgba(239,68,68,.09)", description: "Registro mantido para rastreabilidade, sem validade documental vigente." },
};

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function localDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Maceio", day: "2-digit", month: "2-digit", year: "numeric" });
}

function localDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Maceio", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isSigned(attempt: ExamAttempt) {
  return Boolean(attempt.signature_agreed && attempt.signature_path && attempt.signed_at);
}

function statusFor(attempt: ExamAttempt, state?: MyCertificateState): MyCertificateStatus {
  if (state?.revoked) return "revoked";
  if (!isSigned(attempt)) return "signature-pending";
  if (state && attempt.certificate_code && state.verification_code === attempt.certificate_code) return "valid";
  return "formalization-pending";
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl ${className}`} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>{children}</div>;
}

function CertificatesPage() {
  const exams = useQuery({ queryKey: ["available-exams-certificates"], queryFn: listAvailableExams });
  const attempts = useQuery({ queryKey: ["my-cert-attempts"], queryFn: listMyAttempts });
  const certificateStates = useQuery({ queryKey: ["my-certificate-states"], queryFn: listMyCertificateStates });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [yearFilter, setYearFilter] = useState("all");

  const stateByAttempt = useMemo(() => new Map((certificateStates.data ?? []).map((state) => [state.attempt_id, state])), [certificateStates.data]);
  const examMap = useMemo(() => new Map((exams.data ?? []).map((exam) => [exam.id, exam])), [exams.data]);
  const approved = useMemo(() => (attempts.data ?? []).filter((attempt) => attempt.passed), [attempts.data]);
  const years = useMemo(() => Array.from(new Set(approved.map((attempt) => new Date(attempt.finished_at).getFullYear()).filter(Number.isFinite))).sort((a, b) => b - a), [approved]);

  const counts = useMemo(() => ({
    valid: approved.filter((attempt) => statusFor(attempt, stateByAttempt.get(attempt.id)) === "valid").length,
    signature: approved.filter((attempt) => statusFor(attempt, stateByAttempt.get(attempt.id)) === "signature-pending").length,
    formalization: approved.filter((attempt) => statusFor(attempt, stateByAttempt.get(attempt.id)) === "formalization-pending").length,
    revoked: approved.filter((attempt) => statusFor(attempt, stateByAttempt.get(attempt.id)) === "revoked").length,
  }), [approved, stateByAttempt]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(search);
    return approved.filter((attempt) => {
      const status = statusFor(attempt, stateByAttempt.get(attempt.id));
      const exam = examMap.get(attempt.exam_id);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (yearFilter !== "all" && String(new Date(attempt.finished_at).getFullYear()) !== yearFilter) return false;
      if (!needle) return true;
      const haystack = normalizeSearch([exam?.title, attempt.certificate_code, attempt.matricula, STATUS_META[status].label].filter(Boolean).join(" "));
      return haystack.includes(needle);
    }).sort((a, b) => new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime());
  }, [approved, search, statusFilter, yearFilter, stateByAttempt, examMap]);

  if (exams.isLoading || attempts.isLoading || certificateStates.isLoading) return <Loading />;
  if (exams.isError || attempts.isError || certificateStates.isError) return <Card className="p-8 text-center" ><div role="alert"><p className="font-bold" style={{ color: "var(--text-1)" }}>Não foi possível carregar seus certificados.</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Nenhum total é exibido enquanto a consulta estiver incompleta.</p></div><Button variant="outline" className="mt-4" onClick={() => { exams.refetch(); attempts.refetch(); certificateStates.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></Card>;

  const copyCode = async (code?: string | null) => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar automaticamente");
    }
  };
  const filtersActive = Boolean(search || statusFilter !== "all" || yearFilter !== "all");
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setYearFilter("all"); };
  const nonApproved = (attempts.data ?? []).length - approved.length;

  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.75rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171117 0%,#310912 55%,#160f14 100%)", border: "1px solid rgba(200,16,46,.28)", boxShadow: "0 12px 38px rgba(80,0,18,.16)" }}><div className="absolute -right-20 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.25),transparent 68%)" }} /><div className="relative"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-white/40"><Award className="h-4 w-4" /> Capacitação formal</div><h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Meus Certificados</h1><p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/55">Acompanhe somente suas aprovações com potencial de certificação e entenda exatamente em qual etapa documental cada uma se encontra.</p>{nonApproved > 0 && <p className="mt-3 text-[11px] font-semibold text-white/35">{nonApproved} tentativa{nonApproved === 1 ? "" : "s"} sem aprovação não {nonApproved === 1 ? "gera" : "geram"} certificado e permanecem fora desta lista.</p>}</div></section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Válidos" value={counts.valid} icon={FileBadge2} status="valid" sub="documentos vigentes" /><Metric label="Assinar" value={counts.signature} icon={Clock3} status="signature-pending" sub="aguardando seu aceite" /><Metric label="Formalização" value={counts.formalization} icon={ShieldCheck} status="formalization-pending" sub="etapa administrativa" /><Metric label="Revogados" value={counts.revoked} icon={XCircle} status="revoked" sub="sem vigência" /></div>

    <Card className="p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /><div><p className="font-bold" style={{ color: "var(--text-1)" }}>O que torna um certificado válido?</p><p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-4)" }}>Aprovação, assinatura eletrônica, código correspondente, registro formal vigente e ausência de revogação. A emissão, impressão, salvamento e entrega do documento formal permanecem controlados pela Inspetoria de Segurança Portuária.</p></div></div></Card>

    <Card className="p-4"><div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px_150px_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Atividade, código ou matrícula" className="pl-9" /></div><select aria-label="Filtrar situação do certificado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="all">Todas as situações</option><option value="valid">Válidos</option><option value="signature-pending">Assinatura pendente</option><option value="formalization-pending">Em formalização</option><option value="revoked">Revogados</option></select><select aria-label="Filtrar certificados por ano" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="h-10 rounded-md border px-3 text-sm" style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-2)" }}><option value="all">Todos os anos</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select><Button variant="outline" disabled={!filtersActive} onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" /> Limpar</Button></div></Card>

    {approved.length === 0 ? <Card className="p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 opacity-30" style={{ color: "var(--text-4)" }} /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhuma aprovação apta à certificação.</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Após uma avaliação aprovada, o andamento documental aparecerá aqui.</p></Card> : filtered.length === 0 ? <Card className="p-10 text-center"><Search className="mx-auto h-9 w-9 opacity-25" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Nenhum certificado corresponde aos filtros.</p><Button variant="ghost" className="mt-2" onClick={clearFilters}>Limpar filtros</Button></Card> : <div className="grid gap-3 md:grid-cols-2">{filtered.map((attempt) => {
      const exam = examMap.get(attempt.exam_id);
      const state = stateByAttempt.get(attempt.id);
      const status = statusFor(attempt, state);
      const meta = STATUS_META[status];
      const codeVisible = status === "valid" || status === "revoked";
      return <Card key={attempt.id} className="relative overflow-hidden p-5"><div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: meta.color }} /><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: meta.background, border: `1px solid ${meta.color}30` }}>{status === "valid" ? <ShieldCheck className="h-5 w-5" style={{ color: meta.color }} /> : status === "revoked" ? <XCircle className="h-5 w-5" style={{ color: meta.color }} /> : <Clock3 className="h-5 w-5" style={{ color: meta.color }} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-black" style={{ color: "var(--text-1)" }}>{exam?.title || "Avaliação SEGEMPAT"}</p><span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ background: meta.background, color: meta.color }}>{meta.label}</span></div><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Aprovação em {localDate(attempt.finished_at)} · Nota {Number(attempt.score).toFixed(1)}</p>{attempt.signed_at && <p className="mt-1 text-xs font-semibold" style={{ color: status === "revoked" ? "var(--text-4)" : "#10b981" }}>Assinatura registrada em {localDateTime(attempt.signed_at)}</p>}{status === "revoked" && <p className="mt-1 text-xs font-semibold text-red-500">Revogado em {state?.revoked_at ? localDateTime(state.revoked_at) : "data não informada"}{state?.revoked_reason ? ` · ${state.revoked_reason}` : ""}</p>}<p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>{meta.description}</p>{codeVisible && attempt.certificate_code && <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: meta.background, border: `1px dashed ${meta.color}55` }}><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[.1em]" style={{ color: "var(--text-4)" }}>Código de validação</p><p className="break-all font-mono text-[11px] font-black" style={{ color: meta.color }}>{attempt.certificate_code}</p></div><button type="button" onClick={() => copyCode(attempt.certificate_code)} aria-label="Copiar código de validação" className="shrink-0 rounded-lg p-2" style={{ color: "var(--text-3)", background: "var(--bg-surface-2)" }}><Copy className="h-3.5 w-3.5" /></button></div>}</div></div></Card>;
    })}</div>}
    {approved.length > 0 && <p className="text-right text-[11px] font-semibold" style={{ color: "var(--text-4)" }}>{filtered.length} de {approved.length} aprovação{approved.length === 1 ? "" : "ões"}</p>}
  </div>;
}

function Metric({ label, value, icon: Icon, status, sub }: { label: string; value: number; icon: typeof Award; status: MyCertificateStatus; sub: string }) {
  const meta = STATUS_META[status];
  return <Card className="relative overflow-hidden p-4"><div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: meta.color }} /><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-1 text-[10px] font-semibold" style={{ color: meta.color }}>{sub}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: meta.background, border: `1px solid ${meta.color}30` }}><Icon className="h-4 w-4" style={{ color: meta.color }} /></div></div></Card>;
}

function Loading() {
  return <div className="flex flex-col items-center justify-center gap-3 py-20" role="status" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /><p className="text-sm font-semibold" style={{ color: "var(--text-4)" }}>Carregando seus certificados...</p></div>;
}
