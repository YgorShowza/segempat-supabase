import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Clock3, Copy, FileCheck2, FilterX, RefreshCw, Search, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { listCertificateRecords, type CertificateRecord } from "@/lib/certificate-records";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function fmtDate(value?: string | null) {
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

type CertificateState = "valid" | "signature-pending" | "formalization-pending" | "revoked";
type StateFilter = "all" | CertificateState;

function recordState(row: CertificateRecord): CertificateState {
  if (row.certificate_revoked) return "revoked";
  const signed = Boolean(row.signature_agreed && row.signature_path && row.signed_at);
  if (!signed) return "signature-pending";
  if (row.formally_issued) return "valid";
  return "formalization-pending";
}

const STATE_META: Record<CertificateState, { label: string; short: string; color: string; background: string }> = {
  valid: { label: "Certificado formal válido", short: "VÁLIDO", color: "#10b981", background: "rgba(16,185,129,.09)" },
  "signature-pending": { label: "Assinatura eletrônica pendente", short: "ASSINATURA PENDENTE", color: "#f59e0b", background: "rgba(245,158,11,.09)" },
  "formalization-pending": { label: "Formalização administrativa pendente", short: "FORMALIZAÇÃO PENDENTE", color: "#3b82f6", background: "rgba(59,130,246,.09)" },
  revoked: { label: "Certificado revogado", short: "REVOGADO", color: "#ef4444", background: "rgba(239,68,68,.09)" },
};

export function CertificateValidationWorkspace() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canManageCertificates = hasPermission(user, "certificates.manage");
  const [code, setCode] = useState("");
  const [searchedCode, setSearchedCode] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [yearFilter, setYearFilter] = useState("all");

  const recordsQuery = useQuery({
    queryKey: ["certificate-validation-records"],
    queryFn: listCertificateRecords,
    enabled: canManageCertificates,
    staleTime: 30_000,
  });

  const candidates = useMemo(
    () => (recordsQuery.data ?? []).filter((row) => row.passed || Boolean(row.certificate_code) || row.formally_issued || row.certificate_revoked),
    [recordsQuery.data],
  );

  const years = useMemo(() => Array.from(new Set(candidates.map((row) => new Date(row.finished_at || row.created_at).getFullYear()).filter(Number.isFinite))).sort((a, b) => b - a), [candidates]);

  const counts = useMemo(() => ({
    valid: candidates.filter((row) => recordState(row) === "valid").length,
    signature: candidates.filter((row) => recordState(row) === "signature-pending").length,
    formalization: candidates.filter((row) => recordState(row) === "formalization-pending").length,
    revoked: candidates.filter((row) => recordState(row) === "revoked").length,
  }), [candidates]);

  const result = useMemo(() => {
    if (!searchedCode) return null;
    return candidates.find((row) => normalizeCode(row.certificate_code ?? "") === searchedCode) ?? "not-found";
  }, [candidates, searchedCode]);

  const filtered = useMemo(() => {
    const query = normalizeSearch(listSearch);
    return candidates.filter((row) => {
      const state = recordState(row);
      if (stateFilter !== "all" && state !== stateFilter) return false;
      if (yearFilter !== "all" && String(new Date(row.finished_at || row.created_at).getFullYear()) !== yearFilter) return false;
      if (!query) return true;
      const haystack = normalizeSearch([row.certificate_code, row.employee_name, row.matricula, row.employee_sector, row.exam_title, row.exam_type, STATE_META[state].label].filter(Boolean).join(" "));
      return haystack.includes(query);
    });
  }, [candidates, listSearch, stateFilter, yearFilter]);

  if (userLoading) return <Loading />;
  if (!canManageCertificates) return <Restricted />;

  const handleValidate = (event?: React.FormEvent) => {
    event?.preventDefault();
    setSearchedCode(normalizeCode(code));
  };

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar automaticamente");
    }
  };

  const clearFilters = () => {
    setListSearch("");
    setStateFilter("all");
    setYearFilter("all");
  };
  const filtersActive = Boolean(listSearch || stateFilter !== "all" || yearFilter !== "all");

  return <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.7rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171117 0%,#2f0a13 52%,#111216 100%)", border: "1px solid rgba(200,16,46,.26)", boxShadow: "0 12px 34px rgba(80,0,18,.14)" }}>
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle,rgba(200,16,46,.24),transparent 70%)" }} />
      <div className="relative"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-white/40"><FileCheck2 className="h-4 w-4" /> Autenticidade documental</div><h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Validação de Certificados</h1><p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/55">Confirme o código e acompanhe separadamente aprovação, assinatura eletrônica, formalização do registro e eventual revogação. Um código existente não significa, sozinho, que o certificado esteja vigente.</p></div>
    </section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Válidos" value={counts.valid} state="valid" /><Metric label="Assinatura pendente" value={counts.signature} state="signature-pending" /><Metric label="Formalização" value={counts.formalization} state="formalization-pending" /><Metric label="Revogados" value={counts.revoked} state="revoked" /></div>

    <form onSubmit={handleValidate} className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="mb-3"><label htmlFor="certificate-code" className="block text-xs font-black uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Validar código do certificado</label><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>A consulta é interna e verifica o registro disponível no SEGEMPAT.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row"><Input id="certificate-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Informe o código de validação" className="font-mono" autoComplete="off" /><Button type="submit" disabled={!normalizeCode(code)} className="gap-2 bg-[#C8102E] text-white hover:bg-[#A00D24]"><Search className="h-4 w-4" /> Validar código</Button></div>
      {searchedCode && result === "not-found" && <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl p-4" style={{ background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.25)" }}><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /><div><p className="text-sm font-black text-red-500">Código não encontrado</p><p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>O código informado não corresponde a um certificado ou aprovação formalizável presente nesta base.</p></div></div>}
      {result && result !== "not-found" && <CertificateResult record={result} onCopy={copyCode} />}
    </form>

    <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex flex-col gap-3"><div><h2 className="text-sm font-black" style={{ color: "var(--text-1)" }}>Registros com potencial documental</h2><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>A lista não chama toda pendência de “assinatura”: cada etapa do ciclo documental aparece com sua situação real.</p></div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px_150px_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder="Código, colaborador, matrícula, setor ou atividade" className="pl-9" /></div><select aria-label="Filtrar por situação" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as StateFilter)} className="h-10 rounded-md border bg-transparent px-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--bg-surface)" }}><option value="all">Todas as situações</option><option value="valid">Válidos</option><option value="signature-pending">Assinatura pendente</option><option value="formalization-pending">Formalização pendente</option><option value="revoked">Revogados</option></select><select aria-label="Filtrar por ano" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="h-10 rounded-md border bg-transparent px-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--bg-surface)" }}><option value="all">Todos os anos</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select><Button variant="outline" disabled={!filtersActive} onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" /> Limpar</Button></div>
      </div>

      {recordsQuery.isLoading ? <Loading /> : recordsQuery.isError ? <div role="alert" className="py-9 text-center"><p className="text-sm font-bold text-red-500">Não foi possível carregar os registros. Nenhum total ou situação deve ser interpretado enquanto a consulta estiver indisponível.</p><Button variant="outline" className="mt-3" onClick={() => recordsQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></div> : filtered.length === 0 ? <div className="py-10 text-center"><FileCheck2 className="mx-auto h-9 w-9 opacity-25" /><p className="mt-3 text-sm font-bold" style={{ color: "var(--text-1)" }}>{candidates.length === 0 ? "Nenhum registro documental disponível." : "Nenhum registro corresponde aos filtros."}</p>{filtersActive && <Button variant="ghost" className="mt-2" onClick={clearFilters}>Limpar filtros</Button>}</div> : <div className="mt-4 space-y-2">{filtered.map((row) => <RecordRow key={row.id} row={row} onSelect={() => { setCode(row.certificate_code ?? ""); setSearchedCode(normalizeCode(row.certificate_code ?? "")); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div>}
      {!recordsQuery.isLoading && !recordsQuery.isError && <p className="mt-3 text-right text-[11px] font-semibold" style={{ color: "var(--text-4)" }}>{filtered.length} de {candidates.length} registro{candidates.length === 1 ? "" : "s"}</p>}
    </section>
  </div>;
}

function CertificateResult({ record, onCopy }: { record: CertificateRecord; onCopy: (code: string) => void }) {
  const state = recordState(record);
  const meta = STATE_META[state];
  const signed = Boolean(record.signature_agreed && record.signature_path && record.signed_at);
  const formal = Boolean(record.formally_issued);
  const detail = state === "valid"
    ? `Assinatura registrada em ${fmtDate(record.signed_at)} e registro formal vigente.`
    : state === "revoked"
      ? `Revogado em ${fmtDate(record.revoked_at)}.${record.revoked_reason ? ` Motivo: ${record.revoked_reason}` : ""}`
      : state === "signature-pending"
        ? "A aprovação foi identificada, mas a assinatura eletrônica ainda não foi concluída."
        : "A aprovação e a assinatura existem, porém o certificado ainda não possui registro formal vigente para emissão.";

  return <div className="mt-4 rounded-2xl p-5" style={{ background: meta.background, border: `1px solid ${meta.color}45` }}>
    <div className="mb-4 flex items-start gap-3">{state === "valid" ? <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-500" /> : state === "revoked" ? <XCircle className="mt-0.5 h-7 w-7 shrink-0 text-red-500" /> : <Clock3 className="mt-0.5 h-7 w-7 shrink-0" style={{ color: meta.color }} />}<div><p className="text-sm font-black uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</p><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{detail}</p></div></div>
    <div className="grid gap-3 md:grid-cols-2"><InfoCard icon={UserRound} label="Colaborador" value={record.employee_name} detail={`Mat. ${record.matricula ?? "—"} · ${record.employee_sector}`} /><InfoCard icon={FileCheck2} label="Atividade" value={record.exam_title} detail={record.exam_type} /></div>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Step label="Aprovação" value={record.passed ? "Confirmada" : "Não aprovada"} ok={record.passed} /><Step label="Assinatura" value={signed ? "Registrada" : "Pendente"} ok={signed} /><Step label="Registro formal" value={formal ? "Vigente" : "Pendente"} ok={formal} /><Step label="Revogação" value={record.certificate_revoked ? "Revogado" : "Sem revogação"} ok={!record.certificate_revoked} /></div>
    {record.certificate_code && <div className="mt-3 flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--bg-surface)", border: `1px dashed ${meta.color}70` }}><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>Código consultado</p><p className="break-all font-mono text-sm font-black" style={{ color: meta.color }}>{record.certificate_code}</p></div><Button type="button" variant="outline" className="gap-2" onClick={() => record.certificate_code && onCopy(record.certificate_code)}><Copy className="h-4 w-4" /> Copiar código</Button></div>}
  </div>;
}

function RecordRow({ row, onSelect }: { row: CertificateRecord; onSelect: () => void }) {
  const state = recordState(row);
  const meta = STATE_META[state];
  return <button type="button" onClick={onSelect} disabled={!row.certificate_code} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-60" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: meta.background }}>{state === "valid" ? <Award className="h-4 w-4" style={{ color: meta.color }} /> : state === "revoked" ? <XCircle className="h-4 w-4" style={{ color: meta.color }} /> : <Clock3 className="h-4 w-4" style={{ color: meta.color }} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 truncate text-sm font-bold" style={{ color: "var(--text-1)" }}>{row.employee_name}</p><span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ color: meta.color, background: meta.background }}>{meta.short}</span></div><p className="truncate text-xs" style={{ color: "var(--text-4)" }}>Mat. {row.matricula ?? "—"} · {row.exam_title} · {fmtDate(row.finished_at || row.created_at)}</p></div><span className="hidden max-w-52 truncate font-mono text-[10px] font-black lg:block" style={{ color: meta.color }}>{row.certificate_code || "SEM CÓDIGO"}</span></button>;
}

function Metric({ label, value, state }: { label: string; value: number; state: CertificateState }) {
  const meta = STATE_META[state];
  return <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{value}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: meta.background, color: meta.color }}>{state === "valid" ? <CheckCircle2 className="h-4 w-4" /> : state === "revoked" ? <XCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</div></div></section>;
}

function InfoCard({ icon: Icon, label, value, detail }: { icon: typeof UserRound; label: string; value: string; detail: string }) {
  return <div className="rounded-xl p-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}><Icon className="h-3 w-3" /> {label}</p><p className="break-words text-sm font-black" style={{ color: "var(--text-1)" }}>{value}</p><p className="text-xs" style={{ color: "var(--text-4)" }}>{detail}</p></div>;
}

function Step({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><p className="text-[9px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{label}</p><p className={`mt-1 text-xs font-black ${ok ? "text-emerald-500" : "text-amber-500"}`}>{value}</p></div>;
}

function Restricted() {
  return <div className="mx-auto max-w-xl rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><ShieldCheck className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--accent)" }} /><h1 className="text-lg font-black" style={{ color: "var(--text-1)" }}>Acesso restrito</h1><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Seu nível de acesso não possui permissão para validar ou gerenciar certificados.</p></div>;
}

function Loading() {
  return <div className="flex flex-col items-center justify-center gap-3 py-14" role="status" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /><p className="text-xs font-semibold" style={{ color: "var(--text-4)" }}>Carregando registros de certificados...</p></div>;
}
