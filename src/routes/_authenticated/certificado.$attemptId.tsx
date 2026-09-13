import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileCheck2, Printer, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminExamAttemptEvidence } from "@/lib/exams";
import { listCertificateRecords } from "@/lib/certificate-records";
import { buildAptitudeCertificateHtml, openAptitudeCertificate } from "@/lib/certificate-document";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/certificado/$attemptId")({
  head: () => ({ meta: [{ title: "Certificado de Capacitação · SEGEMPAT" }] }),
  component: CertificateAdminPage,
});

type LayoutStatus = "preparing" | "ready" | "layout-error" | "asset-error";

function fmtDateTime(value?: string | null) {
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

function CertificateAdminPage() {
  const { attemptId } = Route.useParams();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>("preparing");
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canManageCertificates = hasPermission(user, "certificates.manage");

  const evidence = useQuery({
    queryKey: ["admin-certificate-evidence", attemptId],
    queryFn: () => getAdminExamAttemptEvidence(attemptId),
    enabled: canManageCertificates,
  });
  const certificateRecords = useQuery({
    queryKey: ["certificate-validation-records"],
    queryFn: listCertificateRecords,
    enabled: canManageCertificates,
    staleTime: 30_000,
  });

  useEffect(() => {
    setLayoutStatus("preparing");
  }, [attemptId, evidence.dataUpdatedAt]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as { type?: string; status?: LayoutStatus } | null;
      if (payload?.type !== "segempat-certificate-layout") return;
      if (["preparing", "ready", "layout-error", "asset-error"].includes(String(payload.status))) {
        setLayoutStatus(payload.status as LayoutStatus);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (userLoading || (canManageCertificates && (evidence.isLoading || certificateRecords.isLoading))) {
    return <Loading label="Preparando o certificado..." />;
  }

  if (!canManageCertificates) {
    return <StateCard icon={ShieldCheck} title="Acesso restrito" text="A emissão do certificado é exclusiva da Inspetoria e exige a permissão administrativa de certificados no SEGEMPAT." />;
  }

  if (evidence.isError || certificateRecords.isError || !evidence.data) {
    return <StateCard
      icon={AlertTriangle}
      title="Não foi possível carregar o certificado"
      text="A prévia não será montada com dados incompletos. Tente novamente antes de emitir o documento."
      action={<Button variant="outline" onClick={() => { evidence.refetch(); certificateRecords.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button>}
    />;
  }

  const ev = evidence.data;
  const certificateRecord = (certificateRecords.data ?? []).find((row) => row.id === attemptId);
  const revoked = Boolean(certificateRecord?.certificate_revoked);
  const signed = Boolean(ev.signed_at);
  const certificateBlocked = !ev.passed || !signed || !certificateRecord?.formally_issued || revoked;

  if (certificateBlocked) {
    const title = revoked ? "Certificado revogado" : !ev.passed ? "Avaliação sem direito a certificado" : !signed ? "Assinatura eletrônica pendente" : "Registro formal ainda não disponível";
    const text = revoked
      ? `Este certificado foi revogado${certificateRecord?.revoked_at ? ` em ${fmtDateTime(certificateRecord.revoked_at)}` : ""}${certificateRecord?.revoked_reason ? `. Motivo: ${certificateRecord.revoked_reason}` : ""}. O histórico permanece para rastreabilidade, mas a emissão como documento válido está bloqueada.`
      : !ev.passed
        ? "Somente uma avaliação aprovada pode gerar documento denominado CERTIFICADO."
        : !signed
          ? "A aprovação existe, porém a assinatura eletrônica do avaliado ainda não está formalizada."
          : "A aprovação e a assinatura existem, mas o registro formal correspondente ainda não está vigente. Acesso direto a esta página não contorna essa regra.";
    return <StateCard
      icon={revoked ? XCircle : AlertTriangle}
      title={title}
      text={text}
      danger={revoked}
      action={<Button variant="outline" onClick={() => navigate({ to: "/assinaturas-provas" })}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar à gestão de certificados</Button>}
    />;
  }

  const previewHtml = buildAptitudeCertificateHtml(ev, { preview: true });
  const layoutReady = layoutStatus === "ready";
  const layoutFailed = layoutStatus === "layout-error" || layoutStatus === "asset-error";

  const handlePrint = () => {
    if (!layoutReady) {
      toast.error(layoutFailed ? "A impressão está bloqueada porque a prévia não passou na validação de diagramação." : "Aguarde a validação da prévia A4 antes de imprimir.");
      return;
    }
    try {
      openAptitudeCertificate(ev);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o certificado para impressão.");
    }
  };

  return <div className="mx-auto w-full max-w-[1120px] space-y-4 pb-12">
    <section className="sticky top-0 z-20 rounded-2xl p-3 md:p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Button variant="outline" onClick={() => navigate({ to: "/assinaturas-provas" })} className="self-start"><ArrowLeft className="mr-2 h-4 w-4" /> Gestão de certificados</Button>
        <div className="min-w-0 text-left lg:text-center">
          <div className="flex flex-wrap items-center gap-2 lg:justify-center"><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Prévia oficial do certificado</p><LayoutBadge status={layoutStatus} /></div>
          <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>A prévia e a impressão usam o mesmo modelo de duas páginas A4.</p>
        </div>
        <Button onClick={handlePrint} disabled={!layoutReady} className="gap-2 bg-[#C8102E] text-white hover:bg-[#A00D24] disabled:opacity-50"><Printer className="h-4 w-4" /> Imprimir / salvar PDF</Button>
      </div>
    </section>

    {layoutFailed && <section role="alert" className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.25)" }}><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /><div><p className="font-black text-red-500">Emissão bloqueada para proteger a diagramação</p><p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>{layoutStatus === "asset-error" ? "A identidade visual obrigatória não carregou corretamente. Recarregue a página e não emita um certificado sem a marca institucional." : "O conteúdo excedeu a área segura de uma página. O sistema não permitirá gerar um PDF cortado; revise principalmente o título ou o conteúdo programático da atividade."}</p></div></section>}

    <section className="grid gap-3 sm:grid-cols-3">
      <SummaryCard label="Profissional" value={ev.employee_name} />
      <SummaryCard label="Atividade" value={ev.exam_title} />
      <SummaryCard label="Código" value={ev.certificate_code || "—"} mono />
    </section>

    <section className="overflow-hidden rounded-2xl" style={{ background: "#dfe1e5", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-emerald-500" /><p className="text-xs font-black" style={{ color: "var(--text-1)" }}>Documento 1 de 2 + anexo técnico 2 de 2</p></div>
        <p className="hidden text-[11px] sm:block" style={{ color: "var(--text-4)" }}>Role dentro da prévia para conferir ambas as páginas.</p>
      </div>
      <iframe
        ref={iframeRef}
        title={`Prévia do certificado de ${ev.employee_name}`}
        srcDoc={previewHtml}
        className="block w-full bg-[#e4e5e8]"
        style={{ height: "min(78vh, 1050px)", minHeight: 680 }}
      />
    </section>

    <section className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Proteções do documento</p><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>O certificado não reproduz banco de questões, gabarito nem respostas individuais. A emissão continua condicionada à aprovação, assinatura eletrônica, código correspondente, registro formal vigente e ausência de revogação.</p></div></section>
  </div>;
}

function LayoutBadge({ status }: { status: LayoutStatus }) {
  const config = status === "ready"
    ? { label: "A4 VALIDADO", color: "#10b981", bg: "rgba(16,185,129,.09)" }
    : status === "preparing"
      ? { label: "VALIDANDO A4", color: "#f59e0b", bg: "rgba(245,158,11,.09)" }
      : { label: "AJUSTE NECESSÁRIO", color: "#ef4444", bg: "rgba(239,68,68,.09)" };
  return <span className="rounded-full px-2 py-1 text-[9px] font-black tracking-wide" style={{ color: config.color, background: config.bg, border: `1px solid ${config.color}30` }}>{config.label}</span>;
}

function SummaryCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 rounded-2xl p-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><p className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>{label}</p><p className={`mt-1 break-words text-xs font-black ${mono ? "font-mono" : ""}`} style={{ color: "var(--text-1)" }}>{value}</p></div>;
}

function StateCard({ icon: Icon, title, text, action, danger = false }: { icon: typeof ShieldCheck; title: string; text: string; action?: React.ReactNode; danger?: boolean }) {
  return <div className="mx-auto max-w-xl rounded-2xl p-8 text-center" role={danger ? "alert" : undefined} style={{ background: "var(--bg-surface)", border: `1px solid ${danger ? "rgba(239,68,68,.30)" : "var(--border)"}` }}><Icon className={`mx-auto h-10 w-10 ${danger ? "text-red-500" : ""}`} style={danger ? undefined : { color: "var(--accent)" }} /><h1 className="mt-3 text-lg font-black" style={{ color: "var(--text-1)" }}>{title}</h1><p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-4)" }}>{text}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function Loading({ label }: { label: string }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-20" role="status" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "#C8102E" }} /><p className="text-sm font-semibold" style={{ color: "var(--text-4)" }}>{label}</p></div>;
}
