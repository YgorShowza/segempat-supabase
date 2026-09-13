import { useMemo, useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { listEmployees, type Employee } from "@/lib/employees";
import { currentMonthStr } from "@/lib/cronograma";
import { importCronogramaResultsAtomic } from "@/lib/cronograma-import";

const MATRICULA_KEYS = ["matricula", "mat", "registration", "matric"];
const NOME_KEYS = ["nome", "name", "colaborador", "funcionario", "operador", "aluno"];
const TEMA_KEYS = ["tema", "treinamento", "curso", "modulo", "avaliacao", "atividade", "subject", "training"];
const NOTA_KEYS = ["nota", "score", "nota_final", "resultado", "aproveitamento", "grade", "valor", "acerto", "formula", "percent"];
const DATA_KEYS = ["data", "datahora", "dataehora", "datetime", "date", "datahor"];
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;
const MAX_IMPORT_COLUMNS = 64;
const BLOCKED_HEADER_NAMES = new Set(["__proto__", "prototype", "constructor"]);

type ImportRow = {
  matricula: string;
  nome: string;
  tema: string;
  nota: number | null;
  month: string;
  completionDate: string;
  employee?: Employee;
  errors: string[];
};

function norm(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[:;.,()\-_&]/g, "");
}

function pickField(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const normalized = norm(key);
    if (keys.some((candidate) => normalized === candidate)) return value;
  }
  for (const [key, value] of entries) {
    const normalized = norm(key);
    if (keys.some((candidate) => normalized.includes(candidate))) return value;
  }
  return "";
}

function parseScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim().replace(",", ".");
  const isPct = raw.includes("%");
  const numeric = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  let score = numeric;
  if (isPct || score > 10) score /= 10;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function parseDate(value: unknown, fallbackMonth: string) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return { date: `${year}-${month}-${day}`, month: `${year}-${month}` };
  }
  const raw = String(value ?? "").trim();
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, month: `${iso[1]}-${iso[2]}` };
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return { date: `${br[3]}-${br[2]}-${br[1]}`, month: `${br[3]}-${br[2]}` };
  return { date: `${fallbackMonth}-01`, month: fallbackMonth };
}

function findHeaderRow(rows: unknown[][]) {
  const keys = [...MATRICULA_KEYS, ...NOME_KEYS, ...TEMA_KEYS, ...NOTA_KEYS];
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 15).forEach((row, index) => {
    const score = (row ?? []).reduce<number>((total, cell) => {
      const normalized = norm(cell);
      return total + (keys.some((key) => normalized === key || normalized.includes(key)) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function validateSpreadsheetFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "xlsx") {
    if (extension === "xls") {
      throw new Error("O formato .xls legado não é aceito por segurança. Salve o arquivo como .xlsx e tente novamente.");
    }
    throw new Error("Formato inválido. Envie somente arquivo .xlsx.");
  }
  if (file.size <= 0) throw new Error("O arquivo selecionado está vazio.");
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error("A planilha excede o limite de 5 MB para importação.");
  }
}

function validateSpreadsheetSignature(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!isZip) {
    throw new Error("O conteúdo do arquivo não corresponde a uma planilha .xlsx válida.");
  }
}

function sheetRowsToObjects(rows: unknown[][]) {
  if (!rows.length) return [] as Record<string, unknown>[];
  if (rows.length > MAX_IMPORT_ROWS + 16) throw new Error(`A planilha excede o limite de ${MAX_IMPORT_ROWS} linhas de dados.`);

  const columnCount = rows.reduce((largest, row) => Math.max(largest, row?.length ?? 0), 0);
  if (columnCount > MAX_IMPORT_COLUMNS) throw new Error(`A planilha excede o limite de ${MAX_IMPORT_COLUMNS} colunas.`);

  const headerIndex = findHeaderRow(rows);
  const headers = rows[headerIndex] ?? [];
  if (headers.length > MAX_IMPORT_COLUMNS) throw new Error(`A planilha excede o limite de ${MAX_IMPORT_COLUMNS} colunas.`);

  const output: Record<string, unknown>[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (row.every((cell) => cell === "" || cell === null || cell === undefined)) continue;
    const item = Object.create(null) as Record<string, unknown>;
    headers.forEach((header, column) => {
      const label = String(header ?? "").trim();
      if (!label || BLOCKED_HEADER_NAMES.has(label.toLowerCase())) return;
      item[label] = row[column] ?? "";
    });
    output.push(item);
    if (output.length > MAX_IMPORT_ROWS) throw new Error(`A planilha excede o limite de ${MAX_IMPORT_ROWS} linhas de dados.`);
  }
  return output;
}

function sameTheme(a: string, b: string) {
  return norm(a) === norm(b);
}

export function CronogramaImportResults({ open, onOpenChange, onComplete }: { open: boolean; onOpenChange: (open: boolean) => void; onComplete?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [month, setMonth] = useState(currentMonthStr());
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ updated: number; created: number; ignored: number } | null>(null);

  const validRows = useMemo(() => rows.filter((row) => row.errors.length === 0 && row.employee), [rows]);
  const invalidRows = useMemo(() => rows.filter((row) => row.errors.length > 0 || !row.employee), [rows]);

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    setParsing(false);
    setLaunching(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  async function parseFile(file: File) {
    setParsing(true);
    setResult(null);
    try {
      validateSpreadsheetFile(file);
      const buffer = await file.arrayBuffer();
      validateSpreadsheetSignature(buffer);
      const sheetRows = await readSheet(file);
      const rawRows = sheetRowsToObjects(sheetRows as unknown[][]);
      if (!rawRows.length) throw new Error("Nenhuma linha de dados foi reconhecida.");

      const employees = await listEmployees();
      const byMatricula = new Map(employees.map((employee) => [norm(employee.matricula), employee]));
      const parsed = rawRows.map((raw): ImportRow => {
        const matricula = String(pickField(raw, MATRICULA_KEYS) ?? "").trim();
        const nome = String(pickField(raw, NOME_KEYS) ?? "").trim();
        const tema = String(pickField(raw, TEMA_KEYS) ?? "").trim();
        const nota = parseScore(pickField(raw, NOTA_KEYS));
        const date = parseDate(pickField(raw, DATA_KEYS), month);
        const employee = byMatricula.get(norm(matricula));
        const errors: string[] = [];
        if (!matricula) errors.push("Matrícula ausente");
        if (!tema) errors.push("Tema ausente");
        if (nota === null) errors.push("Nota inválida");
        if (matricula && !employee) errors.push("Matrícula não cadastrada");
        return { matricula, nome, tema, nota, month: date.month, completionDate: date.date, employee, errors };
      });

      const dedup = new Map<string, ImportRow>();
      parsed.forEach((row) => {
        const key = `${norm(row.matricula)}|${norm(row.tema)}|${row.month}`;
        const previous = dedup.get(key);
        if (!previous || (previous.nota === null && row.nota !== null)) dedup.set(key, row);
      });

      setRows([...dedup.values()]);
      setFileName(file.name);
      if (!dedup.size) throw new Error("Nenhum registro válido foi encontrado.");
    } catch (error) {
      reset();
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setParsing(false);
    }
  }

  async function launch() {
    if (!validRows.length) return toast.error("Não há registros válidos para importar.");
    setLaunching(true);
    try {
      const response = await importCronogramaResultsAtomic(validRows.map((row) => ({
        matricula: row.matricula,
        tema: row.tema,
        nota: row.nota!,
        month: row.month,
        completion_date: row.completionDate,
      })));
      const finalResult = {
        updated: response.updated,
        created: response.created,
        ignored: response.ignored + invalidRows.length,
      };
      setResult(finalResult);
      toast.success("Resultados importados para o cronograma.");
      onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha durante a importação. Nenhum registro foi alterado.");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-500" /> Importar resultados do Cronograma</DialogTitle>
        </DialogHeader>

        {!rows.length && !result && (
          <div className="space-y-5 py-2">
            <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
              <div className="space-y-1.5"><Label>Mês padrão</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>Se a planilha tiver uma coluna de data, o mês será obtido dela. Caso contrário, será usado o mês padrão selecionado.</p>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) parseFile(file); event.currentTarget.value = ""; }} />
            <button type="button" disabled={parsing} onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed p-10 text-center transition-colors" style={{ borderColor: "var(--border)", background: "var(--bg-surface-2)" }}>
              {parsing ? <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#C8102E]" /> : <Upload className="mx-auto h-9 w-9 text-[#C8102E]" />}
              <p className="mt-3 font-black" style={{ color: "var(--text-1)" }}>{parsing ? "Lendo planilha..." : "Selecionar arquivo Excel"}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-4)" }}>Aceita .xlsx de até 5 MB. Arquivos .xls legados devem ser salvos como .xlsx. Nenhum dado é gravado antes da revisão.</p>
            </button>
          </div>
        )}

        {!!rows.length && !result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Summary label="Reconhecidos" value={rows.length} tone="neutral" />
              <Summary label="Válidos" value={validRows.length} tone="good" />
              <Summary label="Com problema" value={invalidRows.length} tone="bad" />
            </div>
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg-surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>Arquivo: <strong>{fileName}</strong></div>
            <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--border)" }}>
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead style={{ background: "var(--bg-surface-2)", color: "var(--text-3)" }}><tr><th className="p-3">Status</th><th className="p-3">Matrícula</th><th className="p-3">Colaborador</th><th className="p-3">Tema</th><th className="p-3">Nota</th><th className="p-3">Data</th></tr></thead>
                <tbody>{rows.map((row, index) => <tr key={`${row.matricula}-${row.tema}-${index}`} style={{ borderTop: "1px solid var(--border-subtle)" }}><td className="p-3">{row.errors.length ? <span className="inline-flex items-center gap-1 font-bold text-red-500"><XCircle className="h-3.5 w-3.5" /> Revisar</span> : <span className="inline-flex items-center gap-1 font-bold text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>}</td><td className="p-3 font-bold" style={{ color: "var(--text-1)" }}>{row.matricula || "—"}</td><td className="p-3" style={{ color: "var(--text-2)" }}>{row.employee?.full_name || row.nome || "—"}{row.errors.length > 0 && <div className="mt-1 text-[10px] text-red-500">{row.errors.join(" · ")}</div>}</td><td className="p-3" style={{ color: "var(--text-2)" }}>{row.tema || "—"}</td><td className="p-3 font-black" style={{ color: "var(--text-1)" }}>{row.nota === null ? "—" : row.nota.toFixed(1)}</td><td className="p-3" style={{ color: "var(--text-3)" }}>{row.completionDate.split("-").reverse().join("/")}</td></tr>)}</tbody>
              </table>
            </div>
            {invalidRows.length > 0 && <div className="flex gap-2 rounded-xl p-3 text-xs" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", color: "var(--text-2)" }}><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" /><span>Linhas com problema serão ignoradas. Cadastre ou corrija as matrículas antes de importar se quiser incluí-las.</span></div>}
          </div>
        )}

        {result && (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="mt-3 text-lg font-black" style={{ color: "var(--text-1)" }}>Importação concluída</h3>
            <div className="mx-auto mt-5 grid max-w-xl grid-cols-3 gap-3"><Summary label="Atualizados" value={result.updated} tone="good" /><Summary label="Criados" value={result.created} tone="good" /><Summary label="Ignorados" value={result.ignored} tone="neutral" /></div>
          </div>
        )}

        <DialogFooter>
          {!rows.length || result ? <Button variant="outline" onClick={close}>{result ? "Fechar" : "Cancelar"}</Button> : <><Button variant="outline" disabled={launching} onClick={reset}>Escolher outro arquivo</Button><Button disabled={launching || !validRows.length} onClick={launch} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">{launching ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</> : `Importar ${validRows.length} registro(s)`}</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "neutral" | "good" | "bad" }) {
  const color = tone === "good" ? "#10b981" : tone === "bad" ? "#ef4444" : "var(--text-1)";
  return <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}><p className="text-xl font-black" style={{ color }}>{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{label}</p></div>;
}
