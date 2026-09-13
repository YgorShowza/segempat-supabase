import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

const SIGNATURE_INK = "#111827";

export function SignaturePad({
  signerName,
  saving = false,
  saved = false,
  onConfirm,
}: {
  signerName: string;
  saving?: boolean;
  saved?: boolean;
  onConfirm: (blob: Blob) => Promise<void> | void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
      const nextHeight = Math.max(1, Math.floor(180 * ratio));
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;

      // Preserva o traço já existente durante mudança de orientação/viewport.
      const snapshot = document.createElement("canvas");
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      const snapshotCtx = snapshot.getContext("2d");
      if (snapshotCtx && canvas.width > 0 && canvas.height > 0) {
        snapshotCtx.drawImage(canvas, 0, 0);
      }

      const previousWidth = canvas.width;
      const previousHeight = canvas.height;
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      // Assinatura é evidência documental: a tinta não pode variar com o tema visual.
      ctx.strokeStyle = SIGNATURE_INK;

      if (snapshotCtx && previousWidth > 0 && previousHeight > 0) {
        ctx.drawImage(snapshot, 0, 0, previousWidth, previousHeight, 0, 0, rect.width, 180);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (saved || saving) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || saved || saving) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.getContext("2d")?.beginPath();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // O navegador pode liberar o pointer capture automaticamente ao encerrar o gesto.
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas || saved || saving) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    setHasDrawn(false);
  };

  const confirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn || !agreed || saved || saving) return;

    // Exporta sempre como documento branco com tinta escura. Assim o arquivo fica
    // legível em certificado, impressão e visualização independente do tema do app.
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;
    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportCtx.drawImage(canvas, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, "image/png", 0.92));
    if (!blob) return;
    await onConfirm(blob);
  };

  return (
    <div className="rounded-2xl p-4 md:p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(200,16,46,.09)", border: "1px solid rgba(200,16,46,.2)" }}>
          <PenLine className="h-4 w-4 text-[#C8102E]" />
        </div>
        <div>
          <h3 className="text-sm font-black" style={{ color: "var(--text-1)" }}>Assinatura eletrônica</h3>
          <p className="text-xs" style={{ color: "var(--text-4)" }}>Assine abaixo para formalizar a conclusão da avaliação.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl" style={{ background: "#ffffff", border: "1px solid var(--border)" }}>
        <canvas
          ref={canvasRef}
          className="block h-[180px] w-full touch-none bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={(event) => drawingRef.current && end(event)}
        />
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-start gap-2 text-xs" style={{ color: "var(--text-3)" }}>
          <input type="checkbox" className="mt-0.5" checked={agreed} disabled={saved || saving} onChange={(event) => setAgreed(event.target.checked)} />
          <span>Declaro que esta assinatura pertence a <strong>{signerName}</strong> e confirma a realização desta avaliação.</span>
        </label>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" disabled={!hasDrawn || saved || saving} onClick={clear}><Eraser className="mr-2 h-4 w-4" /> Limpar</Button>
          <Button type="button" disabled={!hasDrawn || !agreed || saved || saving} onClick={confirm} className="bg-[#C8102E] text-white hover:bg-[#A00D24]">
            {saved ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Assinada</> : saving ? "Salvando..." : "Confirmar assinatura"}
          </Button>
        </div>
      </div>
    </div>
  );
}
