import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  Camera,
  CheckCircle2,
  CircleDot,
  Clock3,
  Eye,
  FileImage,
  ImagePlus,
  Info,
  LockKeyhole,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { listEmployees, type Employee } from "@/lib/employees";
import { getCurrentEmployeeByAuth } from "@/lib/insights";
import {
  addOccurrenceAttachment,
  addOccurrenceUpdate,
  createOccurrence,
  deleteOccurrence,
  getOccurrenceDetails,
  listOccurrences,
  occurrenceAttachmentUrl,
  updateOccurrence,
  type Occurrence,
  type OccurrencePerson,
} from "@/lib/occurrences";

function Surface({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-2xl ${className}`}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card, var(--shadow-md))",
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}

const MACEIO_TIME_ZONE = "America/Maceio";
const MAX_EVIDENCE_BYTES = 1_250_000;
const MAX_EVIDENCES = 5;
const CATEGORIES = [
  "Operacional",
  "Controle de Acesso",
  "Segurança Patrimonial",
  "CFTV / Videomonitoramento",
  "Comunicação / Rádio",
  "Perímetro / Intrusão",
  "Conduta / Procedimento",
  "Ameaça / Situação Suspeita",
  "Comportamento Inseguro",
  "Condição Insegura",
  "Quase Acidente",
  "Acidente Sem Afastamento",
  "Acidente Com Afastamento",
  "Outro",
];

const SEVERITY_META: Record<Occurrence["severity"], { color: string; description: string; rank: number }> = {
  Baixa: { color: "#60a5fa", description: "Sem impacto imediato relevante; registrar e acompanhar.", rank: 1 },
  Média: { color: "#f59e0b", description: "Exige atenção operacional e acompanhamento do cenário.", rank: 2 },
  Alta: { color: "#f97316", description: "Há impacto ou risco operacional relevante; priorizar tratamento.", rank: 3 },
  Crítica: { color: "#ef4444", description: "Ameaça, exposição ou impacto grave em curso ou iminente.", rank: 4 },
};

const STATUS_META: Record<Occurrence["status"], { color: string; label: string }> = {
  Aberta: { color: "#ef4444", label: "Aberta" },
  "Em análise": { color: "#f59e0b", label: "Em análise" },
  Concluída: { color: "#10b981", label: "Concluída" },
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function maceioDateTimeLocal(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: MACEIO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function maceioLocalToIso(value: string) {
  if (!value) return new Date().toISOString();
  const normalized = value.length === 16 ? `${value}:00` : value;
  return new Date(`${normalized}-03:00`).toISOString();
}

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return date.toLocaleString("pt-BR", { timeZone: MACEIO_TIME_ZONE });
}

function displayUpdatedAt(timestamp: number) {
  if (!timestamp) return "Aguardando atualização";
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    timeZone: MACEIO_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function elapsedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days === 1 ? "" : "s"}`;
}

function shortReference(id: string) {
  return String(id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "REGISTRO";
}

function isOperationalPriority(occurrence: Occurrence) {
  return occurrence.status !== "Concluída" && (occurrence.severity === "Alta" || occurrence.severity === "Crítica");
}

interface PendingEvidence {
  id: string;
  name: string;
  data_url: string;
  size: number;
  caption: string;
}

interface OccurrenceForm {
  employee_id: string;
  title: string;
  category: string;
  severity: Occurrence["severity"];
  description: string;
  current_situation: string;
  immediate_risk: string;
  information_source: string;
  actions_taken: string;
  support_required: string;
  people_involved: OccurrencePerson[];
  location: string;
  occurred_at: string;
  status: Occurrence["status"];
  resolution_notes: string;
}

function emptyForm(): OccurrenceForm {
  return {
    employee_id: "",
    title: "",
    category: "Operacional",
    severity: "Baixa",
    description: "",
    current_situation: "",
    immediate_risk: "",
    information_source: "",
    actions_taken: "",
    support_required: "",
    people_involved: [],
    location: "",
    occurred_at: maceioDateTimeLocal(),
    status: "Aberta",
    resolution_notes: "",
  };
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}`));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function prepareEvidenceFiles(files: FileList | null, available: number) {
  if (!files?.length || available <= 0) return [] as PendingEvidence[];
  const selected = Array.from(files).slice(0, available);
  if (files.length > available) toast.warning(`Somente ${available} evidência(s) cabem no limite deste registro.`);
  const accepted: PendingEvidence[] = [];

  for (const file of selected) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error(`${file.name}: use imagem PNG ou JPEG`);
      continue;
    }
    if (file.size < 100) {
      toast.error(`${file.name}: arquivo de imagem inválido ou vazio`);
      continue;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error(`${file.name}: máximo de 1,25 MB por evidência`);
      continue;
    }
    const dataUrl = await fileAsDataUrl(file);
    accepted.push({ id: crypto.randomUUID(), name: file.name, data_url: dataUrl, size: file.size, caption: "" });
  }
  return accepted;
}

function SectionHeading({ number, title, description, icon: Icon }: { number: string; title: string; description: string; icon?: LucideIcon }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#C8102E]/10 text-xs font-black text-[#C8102E]">
        {Icon ? <Icon className="h-4 w-4" /> : number}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[.14em] text-[#C8102E]">{number} · {title}</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>{description}</p>
      </div>
    </div>
  );
}

export function OccurrencesWorkspace({ operatorTitle = false }: { operatorTitle?: boolean }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManageOccurrences = hasPermission(user, "occurrences.manage");
  const managementMode = Boolean(user?.isAdmin && canManageOccurrences);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const [severity, setSeverity] = useState("Todas");
  const [category, setCategory] = useState("Todas");
  const [period, setPeriod] = useState("Todos");
  const [sort, setSort] = useState("priority");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Occurrence | null>(null);
  const [form, setForm] = useState<OccurrenceForm>(emptyForm);
  const [pendingEvidence, setPendingEvidence] = useState<PendingEvidence[]>([]);
  const [personEmployeeId, setPersonEmployeeId] = useState("");
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("Envolvido");
  const [personNotes, setPersonNotes] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [updateNote, setUpdateNote] = useState("");
  const [detailEvidence, setDetailEvidence] = useState<PendingEvidence[]>([]);

  const occurrences = useQuery({ queryKey: ["occurrences"], queryFn: listOccurrences });
  const employees = useQuery({ queryKey: ["employees"], queryFn: listEmployees, enabled: managementMode });
  const currentEmployee = useQuery({
    queryKey: ["current-employee"],
    queryFn: getCurrentEmployeeByAuth,
    enabled: !managementMode,
  });
  const details = useQuery({
    queryKey: ["occurrence-details", detailsId],
    queryFn: () => getOccurrenceDetails(detailsId as string),
    enabled: Boolean(detailsId),
  });

  const rows = occurrences.data ?? [];
  const categoryOptions = useMemo(() => {
    const values = new Set(CATEGORIES);
    rows.forEach((row) => { if (row.category) values.add(row.category); });
    return [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    const cutoff = period === "Todos" ? null : Date.now() - Number(period) * 86_400_000;
    const selected = rows.filter((occurrence) => {
      if (status !== "Todos" && occurrence.status !== status) return false;
      if (severity !== "Todas" && occurrence.severity !== severity) return false;
      if (category !== "Todas" && occurrence.category !== category) return false;
      if (priorityOnly && !isOperationalPriority(occurrence)) return false;
      if (cutoff !== null) {
        const occurredAt = new Date(occurrence.occurred_at).getTime();
        if (Number.isFinite(occurredAt) && occurredAt < cutoff) return false;
      }
      if (!q) return true;
      return [
        occurrence.title,
        occurrence.category,
        occurrence.description,
        occurrence.location,
        occurrence.employee_name,
        occurrence.employee_matricula,
        occurrence.current_situation,
        occurrence.information_source,
        occurrence.created_by_name,
        occurrence.severity,
        occurrence.status,
      ].some((value) => normalizeText(value).includes(q));
    });

    return selected.sort((a, b) => {
      if (sort === "oldest") return a.occurred_at.localeCompare(b.occurred_at);
      if (sort === "recent") return b.occurred_at.localeCompare(a.occurred_at);
      const aActive = a.status === "Concluída" ? 0 : 1;
      const bActive = b.status === "Concluída" ? 0 : 1;
      if (aActive !== bActive) return bActive - aActive;
      const severityDiff = SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank;
      if (severityDiff !== 0) return severityDiff;
      const aStatus = a.status === "Aberta" ? 2 : a.status === "Em análise" ? 1 : 0;
      const bStatus = b.status === "Aberta" ? 2 : b.status === "Em análise" ? 1 : 0;
      if (aStatus !== bStatus) return bStatus - aStatus;
      return b.occurred_at.localeCompare(a.occurred_at);
    });
  }, [rows, search, status, severity, category, period, priorityOnly, sort]);

  const counts = useMemo(() => ({
    total: rows.length,
    open: rows.filter((row) => row.status === "Aberta").length,
    analysis: rows.filter((row) => row.status === "Em análise").length,
    active: rows.filter((row) => row.status !== "Concluída").length,
    priority: rows.filter(isOperationalPriority).length,
    done: rows.filter((row) => row.status === "Concluída").length,
  }), [rows]);

  const summaryCards: Array<{ label: string; value: number; icon: LucideIcon; color: string; hint: string }> = [
    { label: "Total", value: counts.total, icon: CircleDot, color: "var(--text-3)", hint: "Registros disponíveis" },
    { label: "Ativas", value: counts.active, icon: AlertTriangle, color: "#ef4444", hint: "Abertas + em análise" },
    { label: "Prioritárias", value: counts.priority, icon: ShieldAlert, color: "#f97316", hint: "Alta/Crítica ativas" },
    { label: "Em análise", value: counts.analysis, icon: Clock3, color: "#f59e0b", hint: "Em tratamento" },
    { label: "Concluídas", value: counts.done, icon: CheckCircle2, color: "#10b981", hint: "Histórico protegido" },
  ];

  const hasFilters = Boolean(
    search.trim() || status !== "Todos" || severity !== "Todas" || category !== "Todas" || period !== "Todos" || priorityOnly,
  );
  const operatorIdentityUnavailable = !managementMode && !currentEmployee.isLoading && !currentEmployee.data;

  const invalidate = async (id?: string) => {
    await qc.invalidateQueries({ queryKey: ["occurrences"] });
    if (id) await qc.invalidateQueries({ queryKey: ["occurrence-details", id] });
  };

  const resetForm = () => {
    setForm(emptyForm());
    setPendingEvidence([]);
    setPersonEmployeeId("");
    setPersonName("");
    setPersonRole("Envolvido");
    setPersonNotes("");
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("Todos");
    setSeverity("Todas");
    setCategory("Todas");
    setPeriod("Todos");
    setPriorityOnly(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe a natureza/título da ocorrência");
      if (!form.description.trim()) throw new Error("Descreva o que ocorreu");
      if (!form.location.trim()) throw new Error("Informe o local exato da ocorrência");
      if (!form.current_situation.trim()) throw new Error("Informe a situação atual");
      if (editing && form.status === "Concluída" && !form.resolution_notes.trim()) {
        throw new Error("Informe as notas de conclusão antes de concluir a ocorrência");
      }

      const employee = managementMode
        ? (employees.data ?? []).find((item) => item.id === form.employee_id)
        : currentEmployee.data;
      if (!managementMode && !employee) {
        throw new Error("Não foi possível vincular sua matrícula ao cadastro operacional. Atualize a página ou informe a Inspetoria.");
      }

      const payload = {
        employee_id: managementMode ? form.employee_id || null : employee?.id || null,
        employee_name: employee?.full_name || user?.nome || null,
        employee_matricula: employee?.matricula || user?.matricula || null,
        title: form.title.trim(),
        category: form.category,
        severity: form.severity,
        description: form.description.trim(),
        current_situation: form.current_situation.trim(),
        immediate_risk: form.immediate_risk.trim() || null,
        information_source: form.information_source.trim() || null,
        actions_taken: form.actions_taken.trim() || null,
        support_required: form.support_required.trim() || null,
        people_involved: form.people_involved,
        location: form.location.trim(),
        occurred_at: maceioLocalToIso(form.occurred_at),
      };

      let targetId = editing?.id;
      if (editing && managementMode) {
        await updateOccurrence(editing.id, {
          ...payload,
          status: form.status,
          resolution_notes: form.resolution_notes.trim() || null,
        });
      } else {
        const created = await createOccurrence(payload);
        targetId = created.id;
      }

      if (!targetId) throw new Error("Não foi possível identificar a ocorrência registrada");
      const uploadFailures: string[] = [];
      for (const evidence of pendingEvidence) {
        try {
          await addOccurrenceAttachment(targetId, {
            data_url: evidence.data_url,
            original_name: evidence.name,
            caption: evidence.caption.trim() || null,
          });
        } catch (error) {
          uploadFailures.push(error instanceof Error ? error.message : evidence.name);
        }
      }
      return { targetId, uploadFailures };
    },
    onSuccess: async ({ targetId, uploadFailures }) => {
      if (uploadFailures.length) {
        toast.warning(`Ocorrência salva, mas ${uploadFailures.length} evidência(s) não foram anexadas.`);
      } else {
        toast.success(editing ? "Ocorrência atualizada" : "Ocorrência registrada");
      }
      setOpen(false);
      setEditing(null);
      resetForm();
      await invalidate(targetId);
      setDetailsId(targetId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: deleteOccurrence,
    onSuccess: async () => {
      toast.success("Ocorrência excluída");
      setDeleteTarget(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addUpdate = useMutation({
    mutationFn: async () => {
      if (!detailsId || !updateNote.trim()) throw new Error("Escreva a atualização da ocorrência");
      await addOccurrenceUpdate(detailsId, updateNote.trim());
      return detailsId;
    },
    onSuccess: async (id) => {
      setUpdateNote("");
      toast.success("Atualização registrada no histórico");
      await invalidate(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadDetailEvidence = useMutation({
    mutationFn: async () => {
      if (!detailsId || detailEvidence.length === 0) throw new Error("Selecione ao menos uma evidência");
      const failures: string[] = [];
      let uploaded = 0;
      for (const evidence of detailEvidence) {
        try {
          await addOccurrenceAttachment(detailsId, {
            data_url: evidence.data_url,
            original_name: evidence.name,
            caption: evidence.caption.trim() || null,
          });
          uploaded += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : evidence.name);
        }
      }
      if (!uploaded && failures.length) throw new Error(failures[0]);
      return { id: detailsId, uploaded, failures };
    },
    onSuccess: async ({ id, uploaded, failures }) => {
      setDetailEvidence([]);
      if (failures.length) toast.warning(`${uploaded} evidência(s) anexada(s); ${failures.length} falharam.`);
      else toast.success(`${uploaded} evidência(s) anexada(s) ao registro.`);
      await invalidate(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openNew = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (occurrence: Occurrence) => {
    if (!managementMode) return;
    if (occurrence.status === "Concluída") {
      toast.error("Ocorrência concluída pertence ao histórico e não pode ser alterada");
      return;
    }
    const occurredAt = new Date(occurrence.occurred_at);
    setEditing(occurrence);
    setPendingEvidence([]);
    setForm({
      employee_id: occurrence.employee_id || "",
      title: occurrence.title,
      category: occurrence.category,
      severity: occurrence.severity,
      description: occurrence.description,
      current_situation: occurrence.current_situation || "",
      immediate_risk: occurrence.immediate_risk || "",
      information_source: occurrence.information_source || "",
      actions_taken: occurrence.actions_taken || "",
      support_required: occurrence.support_required || "",
      people_involved: occurrence.people_involved || [],
      location: occurrence.location || "",
      occurred_at: Number.isNaN(occurredAt.getTime()) ? "" : maceioDateTimeLocal(occurredAt),
      status: occurrence.status,
      resolution_notes: occurrence.resolution_notes || "",
    });
    setOpen(true);
  };

  const addPerson = () => {
    let employee: Employee | undefined;
    if (managementMode && personEmployeeId) employee = (employees.data ?? []).find((item) => item.id === personEmployeeId);
    const name = employee?.full_name || personName.trim();
    if (!name) {
      toast.error("Informe ou selecione a pessoa envolvida");
      return;
    }
    const duplicate = form.people_involved.some((person) =>
      employee?.id ? person.employee_id === employee.id : normalizeText(person.name) === normalizeText(name),
    );
    if (duplicate) {
      toast.error("Essa pessoa já está relacionada à ocorrência");
      return;
    }
    const person: OccurrencePerson = {
      employee_id: employee?.id || null,
      name,
      matricula: employee?.matricula || null,
      role: personRole.trim() || "Envolvido",
      notes: personNotes.trim() || null,
    };
    setForm((current) => ({ ...current, people_involved: [...current.people_involved, person] }));
    setPersonEmployeeId("");
    setPersonName("");
    setPersonRole("Envolvido");
    setPersonNotes("");
  };

  const onEvidenceFiles = async (files: FileList | null) => {
    const existing = editing?.attachment_count ?? 0;
    const available = Math.max(0, MAX_EVIDENCES - existing - pendingEvidence.length);
    if (available === 0) {
      toast.error("Limite de 5 evidências por ocorrência atingido");
      return;
    }
    const accepted = await prepareEvidenceFiles(files, available);
    setPendingEvidence((current) => [...current, ...accepted]);
  };

  const onDetailEvidenceFiles = async (files: FileList | null) => {
    const existing = details.data?.attachment_count ?? 0;
    const available = Math.max(0, MAX_EVIDENCES - existing - detailEvidence.length);
    if (available === 0) {
      toast.error("Limite de 5 evidências por ocorrência atingido");
      return;
    }
    const accepted = await prepareEvidenceFiles(files, available);
    setDetailEvidence((current) => [...current, ...accepted]);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <div
        className="overflow-hidden rounded-[1.65rem]"
        style={{ background: "linear-gradient(135deg,#171118,#2b0b13 52%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}
      >
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:p-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/45">
              <ShieldAlert className="h-4 w-4" /> Central operacional de ocorrências
              {managementMode && <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] tracking-[.12em] text-white/55">Gestão da Inspetoria</span>}
            </div>
            <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">{operatorTitle ? "Minhas Ocorrências" : "Ocorrências"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Registre o fato, contexto, pessoas, providências, evidências e evolução do atendimento em um histórico operacional único.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold text-white/55">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.06] px-2.5 py-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Histórico auditável</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.06] px-2.5 py-1.5"><Camera className="h-3.5 w-3.5" /> Evidências preservadas</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.06] px-2.5 py-1.5"><Activity className="h-3.5 w-3.5" /> Linha do tempo do tratamento</span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <Button
              variant="outline"
              onClick={() => occurrences.refetch()}
              disabled={occurrences.isFetching}
              className="border-white/15 bg-white/[.04] text-white hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${occurrences.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button
              onClick={openNew}
              disabled={!managementMode && (currentEmployee.isLoading || operatorIdentityUnavailable)}
              className="bg-[#C8102E] text-white hover:bg-[#A00D24]"
            >
              <Plus className="mr-2 h-4 w-4" /> Nova ocorrência
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-[10px] font-semibold text-white/40 md:px-7">
          <span>{occurrences.isFetching ? "Atualizando registros..." : `Última atualização: ${displayUpdatedAt(occurrences.dataUpdatedAt)}`}</span>
          <span>{managementMode ? "Ações de gestão exigem permissão occurrences.manage" : "Você visualiza apenas os registros permitidos para sua conta"}</span>
        </div>
      </div>

      {operatorIdentityUnavailable && (
        <Surface className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-bold" style={{ color: "var(--text-1)" }}>Cadastro operacional não localizado</p>
              <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>
                O registro de nova ocorrência fica bloqueado até sua matrícula estar vinculada a um colaborador ativo. Seus registros existentes continuam disponíveis.
              </p>
            </div>
          </div>
        </Surface>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {summaryCards.map(({ label, value, icon: Icon, color, hint }) => (
          <Surface key={label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.08em]" style={{ color: "var(--text-4)" }}>{label}</p>
                <p className="mt-2 text-2xl font-black" style={{ color: "var(--text-1)" }}>{occurrences.isLoading ? "—" : value}</p>
              </div>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <p className="mt-2 text-[10px]" style={{ color: "var(--text-4)" }}>{hint}</p>
          </Surface>
        ))}
      </div>

      {!occurrences.isLoading && counts.priority > 0 && (
        <Surface className="overflow-hidden">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-orange-500/10 p-2.5"><ShieldAlert className="h-5 w-5 text-orange-500" /></div>
              <div>
                <p className="font-black" style={{ color: "var(--text-1)" }}>Prioridade operacional</p>
                <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>
                  {counts.priority} ocorrência(s) de severidade Alta ou Crítica ainda estão abertas ou em análise. A ordenação por prioridade não altera a classificação do registro; apenas facilita o atendimento.
                </p>
              </div>
            </div>
            <Button
              variant={priorityOnly ? "default" : "outline"}
              className={priorityOnly ? "bg-[#C8102E] text-white hover:bg-[#A00D24]" : ""}
              onClick={() => setPriorityOnly((current) => !current)}
            >
              {priorityOnly ? "Mostrar todas" : "Ver prioritárias"}
            </Button>
          </div>
        </Surface>
      )}

      <Surface className="p-4 md:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_150px_150px_190px_150px_170px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por natureza, local, matrícula, pessoa, fonte..."
              className="pl-10"
              aria-label="Buscar ocorrências"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
            <SelectContent>{["Todos", "Aberta", "Em análise", "Concluída"].map((item) => <SelectItem key={item} value={item}>{item === "Todos" ? "Todas situações" : item}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger aria-label="Filtrar por severidade"><SelectValue /></SelectTrigger>
            <SelectContent>{["Todas", "Baixa", "Média", "Alta", "Crítica"].map((item) => <SelectItem key={item} value={item}>{item === "Todas" ? "Todas severidades" : item}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Filtrar por categoria"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Todas">Todas categorias</SelectItem>{categoryOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger aria-label="Filtrar por período"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todo período</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger aria-label="Ordenar ocorrências"><ArrowUpDown className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Prioridade operacional</SelectItem>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)", color: "var(--text-4)" }}>
          <span>{occurrences.isLoading ? "Carregando registros..." : `${filtered.length} de ${rows.length} ocorrência(s) exibida(s)`}</span>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>}
        </div>
      </Surface>

      {occurrences.isLoading ? (
        <Surface className="p-10 text-center" role="status" aria-live="polite">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-[#C8102E]" />
          <p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>Carregando ocorrências...</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Consultando o registro operacional.</p>
        </Surface>
      ) : occurrences.isError ? (
        <Surface className="p-8 text-center" role="alert">
          <AlertTriangle className="mx-auto h-9 w-9 text-red-500" />
          <p className="mt-3 font-black text-red-500">Não foi possível carregar as ocorrências.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-4)" }}>
            A tela não apresenta números zerados como se não houvesse registros. Tente consultar novamente.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => occurrences.refetch()} disabled={occurrences.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${occurrences.isFetching ? "animate-spin" : ""}`} /> Tentar novamente
          </Button>
        </Surface>
      ) : (
        <div className="space-y-3">
          {filtered.map((occurrence) => {
            const severityMeta = SEVERITY_META[occurrence.severity];
            const statusMeta = STATUS_META[occurrence.status];
            const elapsed = occurrence.status === "Concluída" ? null : elapsedLabel(occurrence.occurred_at);
            return (
              <Surface key={occurrence.id} className="overflow-hidden">
                <div className="h-[3px]" style={{ background: severityMeta.color }} />
                <div className="p-4 md:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[.1em]" style={{ color: "var(--text-4)" }}>Ref. {shortReference(occurrence.id)}</span>
                        {isOperationalPriority(occurrence) && <span className="rounded-full bg-orange-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-orange-500">Prioritária</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="break-words text-base font-black" style={{ color: "var(--text-1)" }}>{occurrence.title}</p>
                        <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ color: severityMeta.color, background: `${severityMeta.color}16` }}>{occurrence.severity}</span>
                        <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ color: statusMeta.color, background: `${statusMeta.color}12` }}>{statusMeta.label}</span>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{occurrence.category} · {displayDate(occurrence.occurred_at)}</p>
                      <p className="mt-3 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>{occurrence.description}</p>
                      {occurrence.current_situation && occurrence.status !== "Concluída" && (
                        <div className="mt-3 rounded-xl p-3 text-xs leading-5" style={{ background: "var(--bg-surface-2)", color: "var(--text-3)" }}>
                          <span className="font-black" style={{ color: "var(--text-2)" }}>Situação atual: </span>{occurrence.current_situation}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: "var(--text-4)" }}>
                        {occurrence.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{occurrence.location}</span>}
                        {occurrence.employee_name && <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{occurrence.employee_name}{occurrence.employee_matricula ? ` · ${occurrence.employee_matricula}` : ""}</span>}
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{occurrence.people_involved.length} pessoa(s)</span>
                        <span className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" />{occurrence.attachment_count} evidência(s)</span>
                        <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" />{occurrence.update_count} atualização(ões)</span>
                        {elapsed && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Em aberto há {elapsed}</span>}
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap justify-end gap-2 md:w-auto md:max-w-[280px]">
                      <Button size="sm" variant="outline" className="flex-1 md:flex-none" onClick={() => { setDetailsId(occurrence.id); setDetailEvidence([]); }}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> Ver registro
                      </Button>
                      {managementMode && occurrence.status !== "Concluída" && (
                        <Button size="sm" variant="outline" className="flex-1 md:flex-none" onClick={() => openEdit(occurrence)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Tratar
                        </Button>
                      )}
                      {managementMode && occurrence.status === "Aberta" && occurrence.attachment_count === 0 && (
                        <Button size="icon" variant="outline" className="text-red-500" onClick={() => setDeleteTarget(occurrence)} aria-label={`Excluir ocorrência ${occurrence.title}`} title="Excluir registro ainda sem histórico/evidências">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {occurrence.status === "Concluída" && (
                        <span className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
                          <LockKeyhole className="h-3.5 w-3.5" /> Histórico protegido
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Surface>
            );
          })}
          {!filtered.length && (
            <Surface className="p-10 text-center">
              <Search className="mx-auto h-10 w-10 opacity-30" style={{ color: "var(--text-4)" }} />
              <p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>{rows.length ? "Nenhuma ocorrência corresponde aos filtros." : "Nenhuma ocorrência registrada."}</p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6" style={{ color: "var(--text-4)" }}>
                {rows.length ? "Ajuste a busca, situação, severidade, categoria ou período para ampliar os resultados." : "Quando houver um registro operacional, ele aparecerá aqui com seu histórico de tratamento e evidências."}
              </p>
              {rows.length > 0 && <Button variant="outline" className="mt-4" onClick={clearFilters}>Limpar filtros</Button>}
            </Surface>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => {
        if (save.isPending) return;
        setOpen(next);
        if (!next) {
          setEditing(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Tratamento da ocorrência" : "Registrar nova ocorrência"}</DialogTitle>
            <p className="text-sm leading-6" style={{ color: "var(--text-4)" }}>
              {editing ? "Atualize o cenário, providências e situação. Registros concluídos tornam-se histórico protegido." : "Preencha o que é conhecido agora. O registro poderá receber atualizações e novas evidências durante o atendimento."}
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <section className="space-y-4 rounded-2xl border p-4 md:p-5" style={{ borderColor: "var(--border)" }}>
              <SectionHeading number="1" title="Identificação" description="Natureza, classificação, horário, local e vínculo principal do registro." />
              {managementMode && (
                <div className="space-y-1.5">
                  <Label htmlFor="occurrence-main-employee">Colaborador principal relacionado</Label>
                  {employees.isError ? (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-600">Não foi possível carregar a equipe. O registro pode ser salvo sem colaborador principal.</div>
                  ) : (
                    <Select value={form.employee_id || "none"} onValueChange={(value) => setForm({ ...form, employee_id: value === "none" ? "" : value })}>
                      <SelectTrigger id="occurrence-main-employee"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum colaborador específico</SelectItem>
                        {(employees.data ?? []).filter((employee) => employee.status === "Ativo").map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.full_name} · {employee.matricula}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {!managementMode && currentEmployee.data && (
                <div className="rounded-xl p-3 text-xs" style={{ background: "var(--bg-surface-2)", color: "var(--text-3)" }}>
                  <span className="font-black" style={{ color: "var(--text-1)" }}>Registro vinculado a: </span>{currentEmployee.data.full_name} · {currentEmployee.data.matricula}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="occurrence-title">Natureza / título *</Label><Input id="occurrence-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Tentativa de acesso não autorizado" /></div>
                <div className="space-y-1.5"><Label>Categoria</Label><Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}><SelectTrigger aria-label="Categoria da ocorrência"><SelectValue /></SelectTrigger><SelectContent>{categoryOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Severidade</Label>
                  <Select value={form.severity} onValueChange={(value) => setForm({ ...form, severity: value as Occurrence["severity"] })}>
                    <SelectTrigger aria-label="Severidade da ocorrência"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["Baixa", "Média", "Alta", "Crítica"] as Occurrence["severity"][]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-[10px] leading-4" style={{ color: SEVERITY_META[form.severity].color }}>{SEVERITY_META[form.severity].description}</p>
                </div>
                <div className="space-y-1.5"><Label htmlFor="occurrence-date">Data e hora *</Label><Input id="occurrence-date" type="datetime-local" value={form.occurred_at} onChange={(event) => setForm({ ...form, occurred_at: event.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="occurrence-location">Local exato *</Label><Input id="occurrence-location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Portaria, área, ponto..." /></div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border p-4 md:p-5" style={{ borderColor: "var(--border)" }}>
              <SectionHeading number="2" title="Situação encontrada" description="Registre o fato com objetividade, o cenário atual e qualquer risco imediato identificado." />
              <div className="space-y-1.5"><Label htmlFor="occurrence-description">Descrição do fato *</Label><Textarea id="occurrence-description" rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descreva o que foi observado, informado ou constatado, sem conclusões que ainda não foram verificadas." /></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="occurrence-current">Situação atual *</Label><Textarea id="occurrence-current" rows={3} value={form.current_situation} onChange={(event) => setForm({ ...form, current_situation: event.target.value })} placeholder="O que está acontecendo neste momento? O cenário foi contido, permanece ativo ou está sendo verificado?" /></div>
                <div className="space-y-1.5"><Label htmlFor="occurrence-risk">Risco imediato</Label><Textarea id="occurrence-risk" rows={3} value={form.immediate_risk} onChange={(event) => setForm({ ...form, immediate_risk: event.target.value })} placeholder="Há risco de agravamento, exposição de pessoas, acesso indevido, perda operacional ou outro impacto?" /></div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border p-4 md:p-5" style={{ borderColor: "var(--border)" }}>
              <SectionHeading number="3" title="Pessoas envolvidas" description="Relacione comunicantes, envolvidos, testemunhas ou apoios relevantes para o registro." icon={Users} />
              {form.people_involved.length > 0 && (
                <div className="space-y-2">
                  {form.people_involved.map((person, index) => (
                    <div key={`${person.employee_id || person.name}-${index}`} className="flex items-start justify-between gap-3 rounded-xl p-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
                      <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{person.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-4)" }}>{person.role}{person.matricula ? ` · Mat. ${person.matricula}` : ""}</p>
                        {person.notes && <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>{person.notes}</p>}
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setForm((current) => ({ ...current, people_involved: current.people_involved.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remover ${person.name}`}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-xl p-3 md:p-4" style={{ border: "1px dashed var(--border)" }}>
                <div className="grid gap-3 md:grid-cols-2">
                  {managementMode && (
                    <div className="space-y-1.5"><Label>Selecionar colaborador</Label><Select value={personEmployeeId || "manual"} onValueChange={(value) => { setPersonEmployeeId(value === "manual" ? "" : value); if (value !== "manual") setPersonName(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Pessoa não vinculada ao cadastro</SelectItem>{(employees.data ?? []).map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.full_name} · {employee.matricula}</SelectItem>)}</SelectContent></Select></div>
                  )}
                  <div className="space-y-1.5"><Label htmlFor="occurrence-person-name">{managementMode ? "Nome/identificação, se externa" : "Nome/identificação"}</Label><Input id="occurrence-person-name" value={personName} disabled={Boolean(personEmployeeId)} onChange={(event) => setPersonName(event.target.value)} placeholder="Nome completo ou identificação disponível" /></div>
                  <div className="space-y-1.5"><Label htmlFor="occurrence-person-role">Relação com a ocorrência</Label><Input id="occurrence-person-role" value={personRole} onChange={(event) => setPersonRole(event.target.value)} placeholder="Ex.: Comunicante, envolvido, testemunha, apoio" /></div>
                  <div className="space-y-1.5"><Label htmlFor="occurrence-person-notes">Observação</Label><Input id="occurrence-person-notes" value={personNotes} onChange={(event) => setPersonNotes(event.target.value)} placeholder="Informação complementar, se necessária" /></div>
                </div>
                <Button type="button" variant="outline" className="mt-3" onClick={addPerson}><Plus className="mr-2 h-4 w-4" />Adicionar pessoa</Button>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border p-4 md:p-5" style={{ borderColor: "var(--border)" }}>
              <SectionHeading number="4" title="Fonte e providências" description="Deixe claro de onde veio a informação, o que já foi feito e o que ainda precisa de apoio." />
              <div className="space-y-1.5"><Label htmlFor="occurrence-source">Fonte da informação</Label><Input id="occurrence-source" value={form.information_source} onChange={(event) => setForm({ ...form, information_source: event.target.value })} placeholder="Ex.: Vigilante da Portaria 01, CFTV, motorista, terceiro, inspeção..." /></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="occurrence-actions">Providências já adotadas</Label><Textarea id="occurrence-actions" rows={3} value={form.actions_taken} onChange={(event) => setForm({ ...form, actions_taken: event.target.value })} placeholder="Contenção, comunicação, isolamento, conferência, acionamento, preservação de evidência..." /></div>
                <div className="space-y-1.5"><Label htmlFor="occurrence-support">Apoio / providência necessária</Label><Textarea id="occurrence-support" rows={3} value={form.support_required} onChange={(event) => setForm({ ...form, support_required: event.target.value })} placeholder="Informe o apoio, decisão ou acompanhamento ainda necessário." /></div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border p-4 md:p-5" style={{ borderColor: "var(--border)" }}>
              <SectionHeading number="5" title="Registro fotográfico" description="PNG/JPEG · máximo 5 evidências por ocorrência · 1,25 MB cada. Após anexada, a evidência fica preservada." icon={Camera} />
              {editing && editing.attachment_count > 0 && <p className="rounded-xl p-3 text-xs" style={{ background: "var(--bg-surface-2)", color: "var(--text-3)" }}><LockKeyhole className="mr-1.5 inline h-3.5 w-3.5" />{editing.attachment_count} evidência(s) já preservada(s). Você pode adicionar novas até o limite.</p>}
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]" style={{ borderColor: "var(--border)" }}>
                <ImagePlus className="h-6 w-6 text-[#C8102E]" />
                <span className="mt-2 text-sm font-bold" style={{ color: "var(--text-1)" }}>Selecionar imagens</span>
                <span className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Você poderá revisar e adicionar uma legenda antes de salvar.</span>
                <Input className="sr-only" type="file" accept="image/png,image/jpeg" multiple onChange={(event) => { void onEvidenceFiles(event.target.files); event.target.value = ""; }} />
              </label>
              {pendingEvidence.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pendingEvidence.map((evidence) => (
                    <div key={evidence.id} className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
                      <img src={evidence.data_url} alt="Prévia da evidência" className="h-36 w-full object-cover" />
                      <div className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><p className="truncate text-xs font-bold" style={{ color: "var(--text-1)" }}>{evidence.name}</p><p className="text-[10px]" style={{ color: "var(--text-4)" }}>{Math.round(evidence.size / 1024)} KB</p></div>
                          <Button type="button" size="icon" variant="ghost" onClick={() => setPendingEvidence((current) => current.filter((item) => item.id !== evidence.id))} aria-label={`Remover evidência ${evidence.name}`}><X className="h-4 w-4" /></Button>
                        </div>
                        <Input value={evidence.caption} onChange={(event) => setPendingEvidence((current) => current.map((item) => item.id === evidence.id ? { ...item, caption: event.target.value } : item))} placeholder="Legenda da evidência (opcional)" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {editing && managementMode && (
              <section className="space-y-4 rounded-2xl border p-4 md:p-5" style={{ borderColor: "var(--border)" }}>
                <SectionHeading number="6" title="Tratamento" description="Atualize a situação do atendimento. Para concluir, registre obrigatoriamente a solução ou encerramento adotado." />
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5"><Label>Situação</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as Occurrence["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Aberta", "Em análise", "Concluída"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label htmlFor="occurrence-resolution">Conclusão / solução</Label><Textarea id="occurrence-resolution" rows={3} value={form.resolution_notes} onChange={(event) => setForm({ ...form, resolution_notes: event.target.value })} placeholder={form.status === "Concluída" ? "Obrigatório: descreva a solução, decisão ou condição de encerramento" : "Pode ser preenchido durante o tratamento e será obrigatório para concluir"} /></div>
                </div>
                {form.status === "Concluída" && <div className="flex items-start gap-2 rounded-xl bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-600"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />Ao concluir, este registro passa a integrar o histórico operacional protegido e não poderá ser alterado.</div>}
              </section>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-[#C8102E] font-bold text-white hover:bg-[#A00D24]">
              {save.isPending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : editing ? "Salvar tratamento" : "Registrar ocorrência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(next) => { if (!remove.isPending && !next) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Excluir ocorrência?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl bg-red-500/5 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div><p className="font-bold" style={{ color: "var(--text-1)" }}>{deleteTarget?.title}</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>A exclusão só é permitida enquanto o registro estiver Aberto e ainda não possuir evidências preservadas. Ocorrências em análise ou concluídas permanecem no histórico.</p></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={remove.isPending || !deleteTarget} onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>{remove.isPending ? "Excluindo..." : "Excluir registro"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsId)} onOpenChange={(next) => {
        if (!next) {
          setDetailsId(null);
          setUpdateNote("");
          setDetailEvidence([]);
        }
      }}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Registro completo da ocorrência</DialogTitle>
            <p className="text-sm" style={{ color: "var(--text-4)" }}>Fato registrado, tratamento, evidências e evolução em ordem cronológica.</p>
          </DialogHeader>

          {details.isLoading ? (
            <div className="py-14 text-center" role="status" aria-live="polite"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-[#C8102E]" /><p className="mt-3 text-sm font-bold" style={{ color: "var(--text-2)" }}>Abrindo registro completo...</p></div>
          ) : details.isError || !details.data ? (
            <div className="py-10 text-center" role="alert">
              <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
              <p className="mt-3 font-bold text-red-500">Não foi possível abrir o registro completo.</p>
              <Button variant="outline" className="mt-4" onClick={() => details.refetch()}>Tentar novamente</Button>
            </div>
          ) : (() => {
            const record = details.data;
            const severityMeta = SEVERITY_META[record.severity];
            const statusMeta = STATUS_META[record.status];
            const remainingEvidence = Math.max(0, MAX_EVIDENCES - record.attachment_count - detailEvidence.length);
            return (
              <div className="space-y-5">
                <Surface className="overflow-hidden">
                  <div className="h-[4px]" style={{ background: severityMeta.color }} />
                  <div className="p-4 md:p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: "var(--text-4)" }}>Ref. {shortReference(record.id)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black md:text-xl" style={{ color: "var(--text-1)" }}>{record.title}</h3>
                          <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ color: severityMeta.color, background: `${severityMeta.color}16` }}>{record.severity}</span>
                          <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ color: statusMeta.color, background: `${statusMeta.color}12` }}>{statusMeta.label}</span>
                        </div>
                        <p className="mt-2 text-xs" style={{ color: "var(--text-4)" }}>{record.category} · fato ocorrido em {displayDate(record.occurred_at)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {managementMode && record.status !== "Concluída" && <Button variant="outline" size="sm" onClick={() => { setDetailsId(null); setDetailEvidence([]); openEdit(record); }}><Pencil className="mr-2 h-3.5 w-3.5" />Abrir tratamento</Button>}
                        {record.status === "Concluída" && <span className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-4)" }}><LockKeyhole className="h-3.5 w-3.5" />Histórico protegido</span>}
                      </div>
                    </div>
                  </div>
                </Surface>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Surface className="p-4"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Local exato</p><p className="mt-2 text-sm font-bold" style={{ color: "var(--text-1)" }}>{record.location || "—"}</p></Surface>
                  <Surface className="p-4"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Colaborador principal</p><p className="mt-2 text-sm font-bold" style={{ color: "var(--text-1)" }}>{record.employee_name || "Sem vínculo específico"}</p>{record.employee_matricula && <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Mat. {record.employee_matricula}</p>}</Surface>
                  <Surface className="p-4"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Fonte da informação</p><p className="mt-2 text-sm font-bold" style={{ color: "var(--text-1)" }}>{record.information_source || "Não informada"}</p></Surface>
                  <Surface className="p-4"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Registrado por</p><p className="mt-2 text-sm font-bold" style={{ color: "var(--text-1)" }}>{record.created_by_name || "Usuário"}</p><p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>{displayDate(record.created_at)}</p></Surface>
                </div>

                <Surface className="p-4 md:p-5">
                  <div className="mb-3 flex items-center gap-2"><Info className="h-4 w-4 text-[#C8102E]" /><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Descrição do fato</p></div>
                  <p className="whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text-2)" }}>{record.description}</p>
                </Surface>

                <div className="grid gap-3 md:grid-cols-2">
                  <Surface className="p-4 md:p-5"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Situação atual</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text-2)" }}>{record.current_situation || "Não informada"}</p></Surface>
                  <Surface className="p-4 md:p-5"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Risco imediato</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text-2)" }}>{record.immediate_risk || "Não informado"}</p></Surface>
                  <Surface className="p-4 md:p-5"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Providências adotadas</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text-2)" }}>{record.actions_taken || "Não informadas"}</p></Surface>
                  <Surface className="p-4 md:p-5"><p className="text-[10px] font-black uppercase" style={{ color: "var(--text-4)" }}>Apoio / providência necessária</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text-2)" }}>{record.support_required || "Nenhum apoio registrado"}</p></Surface>
                </div>

                <Surface className="p-4 md:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#C8102E]" /><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Pessoas envolvidas</p></div><span className="text-xs" style={{ color: "var(--text-4)" }}>{record.people_involved.length} registro(s)</span></div>
                  {record.people_involved.length ? <div className="grid gap-2 sm:grid-cols-2">{record.people_involved.map((person, index) => <div key={`${person.name}-${index}`} className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)" }}><p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{person.name}</p><p className="mt-0.5 text-xs" style={{ color: "var(--text-4)" }}>{person.role}{person.matricula ? ` · Mat. ${person.matricula}` : ""}</p>{person.notes && <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-3)" }}>{person.notes}</p>}</div>)}</div> : <p className="text-sm" style={{ color: "var(--text-4)" }}>Nenhuma pessoa adicional registrada.</p>}
                </Surface>

                <Surface className="p-4 md:p-5">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2"><FileImage className="h-4 w-4 text-[#C8102E]" /><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Registros fotográficos e documentais</p><p className="mt-0.5 text-xs" style={{ color: "var(--text-4)" }}>{record.attachment_count} de {MAX_EVIDENCES} evidência(s) preservada(s)</p></div></div>
                  </div>
                  {record.attachments.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {record.attachments.map((attachment) => {
                        const imageUrl = occurrenceAttachmentUrl(record.id, attachment);
                        return <div key={attachment.id} className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}><a href={imageUrl} target="_blank" rel="noreferrer" title="Abrir evidência em tamanho original"><img src={imageUrl} alt={attachment.caption || "Evidência da ocorrência"} className="h-40 w-full object-cover transition-opacity hover:opacity-90" /></a><div className="p-3"><p className="truncate text-xs font-bold" style={{ color: "var(--text-1)" }}>{attachment.original_name}</p>{attachment.caption && <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-3)" }}>{attachment.caption}</p>}<p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>Evidência preservada · {Math.round(attachment.size_bytes / 1024)} KB · {displayDate(attachment.created_at)}</p></div></div>;
                      })}
                    </div>
                  ) : <p className="text-sm" style={{ color: "var(--text-4)" }}>Nenhuma evidência fotográfica anexada.</p>}

                  {record.status !== "Concluída" && record.attachment_count < MAX_EVIDENCES && (
                    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-start gap-2"><ImagePlus className="mt-0.5 h-4 w-4 text-[#C8102E]" /><div><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Adicionar evidências</p><p className="mt-1 text-xs leading-5" style={{ color: "var(--text-4)" }}>Enquanto a ocorrência estiver ativa, usuários com acesso ao registro podem complementar as evidências sem alterar o relato original.</p></div></div>
                      <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed p-4 text-sm font-bold" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}><Camera className="mr-2 h-4 w-4" />Selecionar novas imagens<Input className="sr-only" type="file" accept="image/png,image/jpeg" multiple onChange={(event) => { void onDetailEvidenceFiles(event.target.files); event.target.value = ""; }} /></label>
                      {detailEvidence.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{detailEvidence.map((evidence) => <div key={evidence.id} className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}><img src={evidence.data_url} alt="Prévia da nova evidência" className="h-28 w-full object-cover" /><div className="space-y-2 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold" style={{ color: "var(--text-1)" }}>{evidence.name}</p><Button size="icon" variant="ghost" onClick={() => setDetailEvidence((current) => current.filter((item) => item.id !== evidence.id))} aria-label={`Remover ${evidence.name}`}><X className="h-4 w-4" /></Button></div><Input value={evidence.caption} onChange={(event) => setDetailEvidence((current) => current.map((item) => item.id === evidence.id ? { ...item, caption: event.target.value } : item))} placeholder="Legenda da evidência (opcional)" /></div></div>)}</div>}
                      {detailEvidence.length > 0 && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs" style={{ color: "var(--text-4)" }}>Após a seleção atual, ainda cabem {remainingEvidence} evidência(s).</p><Button className="bg-[#C8102E] text-white hover:bg-[#A00D24]" disabled={uploadDetailEvidence.isPending} onClick={() => uploadDetailEvidence.mutate()}>{uploadDetailEvidence.isPending ? "Anexando..." : `Anexar ${detailEvidence.length} evidência(s)`}</Button></div>}
                    </div>
                  )}
                </Surface>

                <Surface className="p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-[#C8102E]" /><p className="text-sm font-black" style={{ color: "var(--text-1)" }}>Evolução da ocorrência</p></div><span className="text-xs" style={{ color: "var(--text-4)" }}>{record.update_count} atualização(ões)</span></div>
                  <div className="space-y-4">
                    <div className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#C8102E]" /><div><p className="text-xs font-bold" style={{ color: "var(--text-1)" }}>Ocorrência registrada</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>{displayDate(record.created_at)} · {record.created_by_name || "Usuário"}</p></div></div>
                    {record.updates.map((entry) => <div key={entry.id} className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" /><div><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-[.08em] text-amber-600">Atualização operacional</p><span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-600">{entry.status_snapshot}</span></div><p className="mt-1 whitespace-pre-wrap text-xs leading-5" style={{ color: "var(--text-2)" }}>{entry.note}</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>{displayDate(entry.created_at)} · {entry.created_by_name || "Inspetoria"}</p></div></div>)}
                    {record.resolved_at && <div className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" /><div><p className="text-xs font-black text-emerald-600">Ocorrência concluída</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5" style={{ color: "var(--text-2)" }}>{record.resolution_notes}</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>{displayDate(record.resolved_at)}</p></div></div>}
                  </div>
                  {managementMode && record.status !== "Concluída" && (
                    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                      <Label htmlFor="occurrence-update-note">Nova atualização de atendimento</Label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <Textarea id="occurrence-update-note" value={updateNote} onChange={(event) => setUpdateNote(event.target.value)} placeholder="Registre decisão, acionamento, deslocamento, checagem, mudança de cenário ou outra evolução relevante..." rows={2} />
                        <Button className="bg-[#C8102E] text-white hover:bg-[#A00D24] sm:self-end" disabled={addUpdate.isPending || !updateNote.trim()} onClick={() => addUpdate.mutate()}>{addUpdate.isPending ? "Registrando..." : "Adicionar atualização"}</Button>
                      </div>
                    </div>
                  )}
                </Surface>

                {record.status === "Concluída" && (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div><p className="font-black text-emerald-700 dark:text-emerald-400">Registro concluído e protegido</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-4)" }}>A ocorrência permanece disponível para consulta histórica, mas não aceita alterações, novas atualizações ou novas evidências.</p></div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter><Button variant="outline" onClick={() => { setDetailsId(null); setDetailEvidence([]); }}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
