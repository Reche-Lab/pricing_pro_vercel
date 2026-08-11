"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Brush,
  Check,
  Eraser,
  Eye,
  EyeOff,
  Grab,
  Loader2,
  Pipette,
  Redo2,
  RotateCcw,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { createRetouchedArtworkFileName, sampledRgbToHex } from "@/domain/artwork/retouch";

type Tool = "brush" | "eyedropper" | "eraser" | "pan";
type Point = { x: number; y: number };
type Stroke = { tool: "brush" | "eraser"; color: string; width: number; points: Point[] };

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export type RetouchedArtworkFile = {
  fileName: string;
  mimeType: "image/webp";
  fileSize: number;
  dataUrl: string;
};

export function ArtworkRetouchEditor({
  artworkName,
  fileName,
  imageUrl,
  onClose,
  onSave
}: {
  artworkName: string;
  fileName: string;
  imageUrl: string;
  onClose: () => void;
  onSave: (file: RetouchedArtworkFile) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<ImageBitmap | null>(null);
  const editLayerRef = useRef<HTMLCanvasElement | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const panRef = useRef<{ clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#ffffff");
  const [brushWidth, setBrushWidth] = useState(32);
  const [zoom, setZoom] = useState(1);
  const [operations, setOperations] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const redraw = useCallback((strokes: Stroke[], originalOnly = false) => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    const editLayer = editLayerRef.current;
    if (!canvas || !source || !editLayer) return;

    const editContext = editLayer.getContext("2d");
    const displayContext = canvas.getContext("2d");
    if (!editContext || !displayContext) return;

    editContext.clearRect(0, 0, editLayer.width, editLayer.height);
    for (const stroke of strokes) drawStroke(editContext, stroke);

    displayContext.clearRect(0, 0, canvas.width, canvas.height);
    displayContext.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (!originalOnly) displayContext.drawImage(editLayer, 0, 0);
  }, []);

  useEffect(() => {
    let active = true;
    let bitmap: ImageBitmap | null = null;
    setLoading(true);
    setError("");

    void fetch(imageUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a imagem para edição.");
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((loaded) => {
        bitmap = loaded;
        if (!active) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = loaded.width;
        canvas.height = loaded.height;
        const editLayer = document.createElement("canvas");
        editLayer.width = loaded.width;
        editLayer.height = loaded.height;
        sourceRef.current = loaded;
        editLayerRef.current = editLayer;
        setDimensions({ width: loaded.width, height: loaded.height });
        setLoading(false);
        redraw([]);
      })
      .catch((loadError) => {
        if (!active) return;
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a imagem.");
      });

    return () => {
      active = false;
      if (bitmap) bitmap.close();
      sourceRef.current = null;
      editLayerRef.current = null;
    };
  }, [imageUrl, redraw]);

  useEffect(() => redraw(operations, showOriginal), [operations, redraw, showOriginal]);

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) * canvas.width / rect.width, 0, canvas.width),
      y: clamp((event.clientY - rect.top) * canvas.height / rect.height, 0, canvas.height)
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (loading || saving) return;
    if (tool === "pan") {
      const viewport = viewportRef.current;
      if (!viewport) return;
      panRef.current = { clientX: event.clientX, clientY: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const point = pointerPosition(event);
    if (tool === "eyedropper") {
      pickColor(point);
      return;
    }

    currentStrokeRef.current = { tool, color, width: brushWidth, points: [point] };
    event.currentTarget.setPointerCapture(event.pointerId);
    redraw([...operations, currentStrokeRef.current]);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (panRef.current && tool === "pan") {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.clientX);
      viewport.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.clientY);
      return;
    }
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    const point = pointerPosition(event);
    const previous = stroke.points[stroke.points.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < Math.max(1, stroke.width / 8)) return;
    stroke.points.push(point);
    redraw([...operations, stroke]);
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    currentStrokeRef.current = null;
    setOperations((current) => [...current, stroke]);
    setRedoStack([]);
  }

  function pickColor(point: Point) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    const pixel = context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
    setColor(sampledRgbToHex(pixel[0], pixel[1], pixel[2]));
    setTool("brush");
  }

  function undo() {
    setOperations((current) => {
      const last = current[current.length - 1];
      if (!last) return current;
      setRedoStack((redo) => [...redo, last]);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((current) => {
      const last = current[current.length - 1];
      if (!last) return current;
      setOperations((strokes) => [...strokes, last]);
      return current.slice(0, -1);
    });
  }

  function reset() {
    setOperations([]);
    setRedoStack([]);
    setError("");
  }

  async function save() {
    if (!operations.length) {
      setError("Faça ao menos um retoque antes de salvar uma nova versão.");
      return;
    }
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    const editLayer = editLayerRef.current;
    if (!canvas || !source || !editLayer) return;
    setSaving(true);
    setError("");
    try {
      const output = document.createElement("canvas");
      output.width = canvas.width;
      output.height = canvas.height;
      const context = output.getContext("2d");
      if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
      context.drawImage(source, 0, 0, output.width, output.height);
      context.drawImage(editLayer, 0, 0);
      const blob = await exportWebp(output);
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error("A versão editada excedeu 3 MB. Reduza a imagem original antes de tentar novamente.");
      const retouchedName = createRetouchedArtworkFileName(fileName, Date.now());
      await onSave({ fileName: retouchedName, mimeType: "image/webp", fileSize: blob.size, dataUrl: await blobToDataUrl(blob) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o retoque.");
      setSaving(false);
    }
  }

  const canvasCursor = tool === "eyedropper" ? "crosshair" : tool === "pan" ? "grab" : "none";

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-black/85 p-2 backdrop-blur-sm sm:p-5">
      <div className="grid h-[96vh] w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
          <div className="min-w-0"><h2 className="text-base font-semibold text-white">Retocar imagem</h2><p className="mt-0.5 truncate text-xs text-zinc-500">{artworkName} · original preservado</p></div>
          <button aria-label="Fechar editor" className="focus-ring rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" disabled={saving} type="button" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="grid min-h-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="order-2 overflow-y-auto border-t border-zinc-800 p-3 lg:order-1 lg:border-r lg:border-t-0 lg:p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase text-zinc-500">Ferramentas</p>
            <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
              <ToolButton active={tool === "brush"} icon={<Brush size={15} />} label="Pincel" onClick={() => setTool("brush")} />
              <ToolButton active={tool === "eyedropper"} icon={<Pipette size={15} />} label="Capturar" onClick={() => setTool("eyedropper")} />
              <ToolButton active={tool === "eraser"} icon={<Eraser size={15} />} label="Borracha" onClick={() => setTool("eraser")} />
              <ToolButton active={tool === "pan"} icon={<Grab size={15} />} label="Mover" onClick={() => setTool("pan")} />
            </div>

            <div className="mt-5 grid gap-4">
              <label><span className="mb-2 block text-xs font-medium text-zinc-300">Cor do pincel</span><span className="flex h-10 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2"><input aria-label="Selecionar cor" className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0" type="color" value={color} onChange={(event) => { setColor(event.target.value); setTool("brush"); }} /><span className="font-mono text-xs uppercase text-zinc-300">{color}</span></span></label>
              <label><span className="mb-2 flex justify-between gap-2 text-xs font-medium text-zinc-300"><span>Espessura</span><span className="tabular-nums text-cyan-300">{brushWidth}px</span></span><input className="w-full accent-cyan-400" max="240" min="2" step="2" type="range" value={brushWidth} onChange={(event) => setBrushWidth(Number(event.target.value))} /></label>
              <div><span className="mb-2 block text-xs font-medium text-zinc-300">Visualização</span><div className="flex items-center gap-2"><button aria-label="Reduzir zoom" className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800" type="button" onClick={() => setZoom((value) => clamp(Number((value - 0.25).toFixed(2)), 0.5, 4))}><ZoomOut size={15} /></button><span className="min-w-12 text-center text-xs tabular-nums text-cyan-300">{Math.round(zoom * 100)}%</span><button aria-label="Aumentar zoom" className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800" type="button" onClick={() => setZoom((value) => clamp(Number((value + 0.25).toFixed(2)), 0.5, 4))}><ZoomIn size={15} /></button></div></div>
              <div className="flex gap-2"><button className="focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 text-xs text-zinc-300 disabled:opacity-30" disabled={!operations.length} type="button" onClick={undo}><Undo2 size={14} /> Desfazer</button><button className="focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 text-xs text-zinc-300 disabled:opacity-30" disabled={!redoStack.length} type="button" onClick={redo}><Redo2 size={14} /> Refazer</button></div>
              <button className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40" disabled={!operations.length} type="button" onClick={() => setShowOriginal((current) => !current)}>{showOriginal ? <Eye size={14} /> : <EyeOff size={14} />}{showOriginal ? "Ver retoques" : "Comparar original"}</button>
              <button className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-950 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-40" disabled={!operations.length} type="button" onClick={reset}><RotateCcw size={14} /> Limpar retoques</button>
            </div>
          </aside>

          <main className="order-1 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-zinc-900 lg:order-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-400"><span>Use o conta-gotas na imagem e depois pinte a área indesejada.</span><span>{dimensions.width ? `${dimensions.width} × ${dimensions.height}px` : "Carregando..."}</span></div>
            <div ref={viewportRef} className="min-h-0 overflow-auto p-4 sm:p-7">
              <div className="mx-auto w-full" style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined }}>
                <canvas
                  ref={canvasRef}
                  aria-label={`Editor da arte ${artworkName}`}
                  className="block h-auto w-full touch-none bg-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                  style={{ cursor: canvasCursor }}
                  onPointerCancel={finishStroke}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={finishStroke}
                />
              </div>
              {loading ? <div className="absolute inset-0 grid place-items-center bg-zinc-900/80 text-sm text-zinc-300"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando imagem...</div> : null}
            </div>
          </main>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3 sm:px-5">
          <div className="min-w-0">{error ? <p className="text-sm text-red-300">{error}</p> : <p className="text-xs text-zinc-500">O salvamento cria uma nova versão e não consome tentativas de IA.</p>}</div>
          <div className="flex gap-2"><button className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300" disabled={saving} type="button" onClick={onClose}>Cancelar</button><button className="focus-ring inline-flex items-center gap-2 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-950 disabled:opacity-50" disabled={saving || loading || !operations.length} type="button" onClick={save}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Salvar nova versão</button></div>
        </footer>
      </div>
    </div>
  );
}

function ToolButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${active ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white"}`} type="button" onClick={onClick}>{icon}{label}</button>;
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let index = 1; index < stroke.points.length; index += 1) context.lineTo(stroke.points[index].x, stroke.points[index].y);
    context.stroke();
  }
  context.restore();
}

async function exportWebp(canvas: HTMLCanvasElement) {
  for (const quality of [0.94, 0.86, 0.76]) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  return canvasToBlob(canvas, "image/webp", 0.68);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível exportar a imagem.")), type, quality));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a versão editada."));
    reader.onerror = () => reject(new Error("Não foi possível ler a versão editada."));
    reader.readAsDataURL(blob);
  });
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
