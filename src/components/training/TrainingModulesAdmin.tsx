import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, CircleOff, Layers3, Pencil, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasPermission } from "@/lib/access-control";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  createTrainingModule,
  deleteTrainingModule,
  listTrainingModules,
  updateTrainingModule,
  type TrainingModule,
  type TrainingModuleInput,
} from "@/lib/training-modules";

const TRAINING_SECTORS = ["Todos", "CFTV", "Vigilância", "Portaria", "Ronda", "Administrativo", "Operações"] as const;
const STATUS_FILTERS = ["Todos", "Ativo", "Inativo"] as const;

const EMPTY: TrainingModuleInput = {
  title: "",
  description: "",
  content: "",
  display_order: 1,
  min_score: 7,
  target_sector: "Todos",
  status: "Ativo",
};

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function Metric({ label, value, icon: Icon, accent, sub }: { label: string; value: number; icon: typeof Layers3; accent: string; sub: string }) {
  return <section className="relative overflow-hidden rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}><div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: accent }} /><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>{label}</p><p className="mt-2 text-3xl font-black" style={{ color: "var(--text-1)" }}>{value}</p><p className="mt-1 text-[11px] font-semibold" style={{ color: accent }}>{sub}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}><Icon className="h-4 w-4" style={{ color: accent }} /></div></div></section>;
}

export function TrainingModulesAdmin() {
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canManage = hasPermission(user, "training.manage");
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingModule | null>(null);
  const [toDelete, setToDelete] = useState<TrainingModule | null>(null);
  const [form, setForm] = useState<TrainingModuleInput>(EMPTY);

  const query = useQuery({ queryKey: ["training-modules"], queryFn: listTrainingModules, enabled: canManage });
  const rows = query.data ?? [];

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return rows.filter((row) => {
      if (sector !== "Todos" && row.target_sector !== sector) return false;
      if (status !== "Todos" && row.status !== status) return false;
      return !q || [row.title, row.description, row.target_sector, row.content || ""].some((value) => normalizeText(value || "").includes(q));
    });
  }, [rows, search, sector, status]);

  const filtersActive = Boolean(search.trim() || sector !== "Todos" || status !== "Todos");
  const activeCount = rows.filter((row) => row.status === "Ativo").length;
  const inactiveCount = rows.length - activeCount;
  const sectorCount = new Set(rows.map((row) => row.target_sector).filter(Boolean)).size;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["training-modules"] });

  const clearFilters = () => {
    setSearch("");
    setSector("Todos");
    setStatus("Todos");
  };

  const closeEditor = () => {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error("Você não possui permissão para gerenciar treinamentos");
      const title = form.title.trim();
      const description = form.description.trim();
      const displayOrder = Number(form.display_order);
      const minScore = Number(form.min_score);
      if (!title) throw new Error("Informe o título do módulo");
      if (!description) throw new Error("Informe a descrição do módulo");
      if (!Number.isInteger(displayOrder) || displayOrder < 1 || displayOrder > 9999) throw new Error("A ordem deve ser um número inteiro entre 1 e 9999");
      if (!Number.isFinite(minScore) || minScore < 0 || minScore > 10) throw new Error("A nota mínima deve ficar entre 0 e 10");
      const payload: TrainingModuleInput = {
        ...form,
        title,
        description,
        content: form.content?.trim() || null,
        display_order: displayOrder,
        min_score: minScore,
      };
      if (editing) await updateTrainingModule(editing.id, payload);
      else await createTrainingModule(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Módulo atualizado" : "Módulo criado");
      closeEditor();
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: deleteTrainingModule,
    onSuccess: () => {
      toast.success("Módulo excluído");
      setToDelete(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: "Ativo" | "Inativo" }) => updateTrainingModule(id, { status: nextStatus }),
    onSuccess: (_data, variables) => {
      toast.success(variables.nextStatus === "Ativo" ? "Módulo ativado" : "Módulo desativado");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (userLoading) return <Loading label="Validando acesso à gestão de treinamentos..." />;
  if (!canManage) {
    return <section className="mx-auto max-w-3xl rounded-2xl p-10 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><BookOpen className="mx-auto h-9 w-9 opacity-30" /><p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>Acesso restrito à gestão de treinamentos.</p><p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>Sua conta não possui a permissão necessária para administrar módulos.</p></section>;
  }

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, display_order: rows.length ? Math.max(...rows.map((row) => row.display_order)) + 1 : 1 });
    setOpen(true);
  };

  const openEdit = (row: TrainingModule) => {
    setEditing(row);
    setForm({ title: row.title, description: row.description, content: row.content, display_order: row.display_order, min_score: Number(row.min_score), target_sector: row.target_sector, status: row.status });
    setOpen(true);
  };

  return <div className="mx-auto max-w-7xl space-y-5 pb-10">
    <section className="rounded-[1.5rem] p-5 md:p-6" style={{ background: "linear-gradient(135deg,#171118,#2b0b13 50%,#111216)", border: "1px solid rgba(200,16,46,.26)" }}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-white/40"><BookOpen className="h-4 w-4" /> Trilha de capacitação</div><h1 className="mt-2 text-2xl font-black text-white md:text-3xl">Módulos de Treinamento</h1><p className="mt-1 max-w-2xl text-sm text-white/50">Organize conteúdos, sequência, público-alvo e nota mínima que aparecem na Academia SEGEMPAT.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Link to="/treinamentos" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white/80" style={{ border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.06)" }}><ArrowLeft className="h-4 w-4" /> Academia</Link><Button onClick={openNew} className="bg-[#C8102E] text-white hover:bg-[#A00D24]"><Plus className="mr-2 h-4 w-4" /> Novo módulo</Button></div></div>
    </section>

    {query.isLoading ? <Loading label="Carregando módulos de treinamento..." /> : query.isError ? <section className="rounded-2xl p-8 text-center" style={{background:"var(--bg-surface)",border:"1px solid var(--border)"}}><AlertTriangle className="mx-auto h-8 w-8 text-amber-500"/><p className="mt-3 font-bold" style={{color:"var(--text-1)"}}>Não foi possível carregar os módulos.</p><p className="mt-1 text-sm" style={{color:"var(--text-4)"}}>Tente novamente antes de realizar alterações.</p><Button variant="outline" className="mt-4" onClick={()=>query.refetch()}><RefreshCw className="mr-2 h-4 w-4"/> Tentar novamente</Button></section> : <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo dos módulos"><Metric label="Total" value={rows.length} icon={Layers3} accent="#3b82f6" sub="módulos cadastrados"/><Metric label="Ativos" value={activeCount} icon={ShieldCheck} accent="#10b981" sub="visíveis na Academia"/><Metric label="Inativos" value={inactiveCount} icon={CircleOff} accent="#94a3b8" sub="fora da biblioteca"/><Metric label="Setores" value={sectorCount} icon={SlidersHorizontal} accent="#e11d48" sub="segmentações usadas"/></section>

      <section className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="grid gap-3 lg:grid-cols-[1fr_190px_160px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-4)" }} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título, descrição, conteúdo ou setor..." className="pl-10" aria-label="Buscar módulos" /></div><Select value={sector} onValueChange={setSector}><SelectTrigger aria-label="Filtrar por setor"><SelectValue /></SelectTrigger><SelectContent>{TRAINING_SECTORS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filtrar por situação"><SelectValue /></SelectTrigger><SelectContent>{STATUS_FILTERS.map((value) => <SelectItem key={value} value={value}>{value === "Todos" ? "Todas as situações" : value}</SelectItem>)}</SelectContent></Select></div>
        <div className="mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between"><p style={{ color: "var(--text-4)" }}>{filtersActive ? `Exibindo ${filtered.length} de ${rows.length} módulo(s)` : `${rows.length} módulo(s) cadastrado(s)`}</p>{filtersActive && <Button size="sm" variant="ghost" className="justify-start sm:justify-center" onClick={clearFilters}><X className="mr-2 h-3.5 w-3.5" /> Limpar filtros</Button>}</div>
      </section>

      <div className="space-y-3">{filtered.map((row) => <article key={row.id} className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card, var(--shadow-md))" }}><div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5"><div className="flex min-w-0 gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{row.display_order}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-black" style={{ color: "var(--text-1)" }}>{row.title}</h2><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: row.status === "Ativo" ? "rgba(16,185,129,.1)" : "var(--bg-surface-3)", color: row.status === "Ativo" ? "#10b981" : "var(--text-4)" }}>{row.status}</span></div><p className="mt-1 break-words text-sm" style={{ color: "var(--text-3)" }}>{row.description}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold" style={{ color: "var(--text-4)" }}><span>{row.target_sector}</span><span>·</span><span>Nota mínima {Number(row.min_score).toLocaleString("pt-BR")}/10</span></div>{row.content && <div className="mt-3 max-h-24 overflow-hidden whitespace-pre-wrap break-words text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>{row.content}</div>}</div></div><div className="flex w-full shrink-0 justify-end gap-1 sm:w-auto"><Button size="icon" variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: row.id, nextStatus: row.status === "Ativo" ? "Inativo" : "Ativo" })} title={row.status === "Ativo" ? "Desativar módulo" : "Ativar módulo"} aria-label={row.status === "Ativo" ? `Desativar ${row.title}` : `Ativar ${row.title}`}>{row.status === "Ativo" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CircleOff className="h-4 w-4" />}</Button><Button size="icon" variant="ghost" onClick={() => openEdit(row)} title="Editar módulo" aria-label={`Editar ${row.title}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-red-500" onClick={() => setToDelete(row)} title="Excluir módulo" aria-label={`Excluir ${row.title}`}><Trash2 className="h-4 w-4" /></Button></div></div></article>)}</div>

      {filtered.length === 0 && <section className="rounded-2xl p-10 text-center md:p-12" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}><BookOpen className="mx-auto h-10 w-10 opacity-25" /><p className="mt-3 font-bold" style={{ color: "var(--text-1)" }}>{rows.length === 0 ? "Nenhum módulo cadastrado." : "Nenhum módulo corresponde aos filtros."}</p><p className="mx-auto mt-1 max-w-lg text-sm" style={{ color: "var(--text-4)" }}>{rows.length === 0 ? "Cadastre o primeiro módulo para iniciar a biblioteca da Academia SEGEMPAT." : "Limpe ou ajuste os filtros para voltar a visualizar os módulos cadastrados."}</p>{rows.length === 0 ? <Button className="mt-4 bg-[#C8102E] text-white hover:bg-[#A00D24]" onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Criar primeiro módulo</Button> : <Button variant="outline" className="mt-4" onClick={clearFilters}><X className="mr-2 h-4 w-4" /> Limpar filtros</Button>}</section>}
    </>}

    <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : closeEditor()}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Editar módulo" : "Novo módulo"}</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="training-module-title">Título *</Label><Input id="training-module-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Controle de acesso e identificação" /></div><div className="space-y-1.5"><Label htmlFor="training-module-description">Descrição *</Label><textarea id="training-module-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-20 w-full rounded-xl p-3 text-sm" placeholder="Explique de forma breve o objetivo do módulo." style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }} /></div><div className="space-y-1.5"><Label htmlFor="training-module-content">Conteúdo</Label><textarea id="training-module-content" value={form.content || ""} onChange={(e) => setForm({ ...form, content: e.target.value || null })} className="min-h-48 w-full rounded-xl p-3 text-sm" placeholder="Digite o conteúdo em texto, usando parágrafos e quebras de linha para organizar a leitura." style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-1)" }} /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-1.5"><Label htmlFor="training-module-order">Ordem</Label><Input id="training-module-order" type="number" min={1} max={9999} step={1} value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} /></div><div className="space-y-1.5"><Label htmlFor="training-module-score">Nota mínima</Label><Input id="training-module-score" type="number" min={0} max={10} step="0.5" value={form.min_score} onChange={(e) => setForm({ ...form, min_score: Number(e.target.value) })} /></div><div className="space-y-1.5"><Label>Setor</Label><Select value={form.target_sector} onValueChange={(value) => setForm({ ...form, target_sector: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRAINING_SECTORS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as "Ativo" | "Inativo" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Ativo">Ativo</SelectItem><SelectItem value="Inativo">Inativo</SelectItem></SelectContent></Select></div></div><p className="text-xs" style={{ color: "var(--text-4)" }}>Módulos ativos ficam disponíveis na Academia conforme o setor definido. Módulos inativos permanecem cadastrados, mas não são exibidos aos operadores.</p></div><DialogFooter><Button variant="outline" onClick={closeEditor}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">{save.isPending ? "Salvando..." : editing ? "Salvar alterações" : "Criar módulo"}</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog open={!!toDelete} onOpenChange={(nextOpen) => !nextOpen && setToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir módulo?</AlertDialogTitle><AlertDialogDescription>Você está prestes a excluir “{toDelete?.title}”. Se o objetivo for apenas retirar o conteúdo da Academia, prefira desativar o módulo para preservar o cadastro e facilitar uma reativação futura.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-[#C8102E] hover:bg-[#A00D24]" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)}>{remove.isPending ? "Excluindo..." : "Excluir definitivamente"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Loading({ label }: { label: string }) {
  return <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-16"><div className="h-8 w-8 animate-spin rounded-full border-4" style={{borderColor:"var(--border)",borderTopColor:"#C8102E"}}/><p className="text-xs" style={{ color: "var(--text-4)" }}>{label}</p></div>;
}
