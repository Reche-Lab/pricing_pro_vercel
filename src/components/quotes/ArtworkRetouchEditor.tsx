"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Brush, Check, Eraser, Eye, Grab, Loader2, PaintBucket, Pipette, Redo2,
  RotateCcw, Scan, SlidersHorizontal, Undo2, X, ZoomIn, ZoomOut
} from "lucide-react";
import { createShapePath, geometryLabel, type PrintGeometry } from "@/domain/artwork/geometry";
import {
  createRetouchedArtworkFileName,
  DEFAULT_RETOUCH_ADJUSTMENTS,
  findContiguousColorRegion,
  normalizeSelection,
  sampledRgbToHex,
  type RetouchAdjustments,
  type RetouchDraft,
  type RetouchFill,
  type RetouchOperation,
  type RetouchPoint,
  type RetouchSelection,
  type RetouchStroke
} from "@/domain/artwork/retouch";

type Tool = "brush" | "eyedropper" | "eraser" | "fill" | "select" | "pan";
type Workspace = { width: number; height: number; sourceWidth: number; sourceHeight: number; offsetX: number; offsetY: number };
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const WORKSPACE_PADDING_RATIO = 0.18;
const MAX_WORKSPACE_PIXELS = 30_000_000;

export type RetouchedArtworkFile = { fileName: string; mimeType: "image/webp"; fileSize: number; dataUrl: string };

export function ArtworkRetouchEditor({
  artworkName, fileName, imageUrl, geometry, bleedMm = 2, safeMarginMm = 2, draftUrl, onClose, onSave
}: {
  artworkName: string;
  fileName: string;
  imageUrl: string;
  geometry?: PrintGeometry | null;
  bleedMm?: number;
  safeMarginMm?: number;
  draftUrl?: string;
  onClose: () => void;
  onSave: (file: RetouchedArtworkFile) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<ImageBitmap | null>(null);
  const adjustedSourceRef = useRef<HTMLCanvasElement | null>(null);
  const editLayerRef = useRef<HTMLCanvasElement | null>(null);
  const currentStrokeRef = useRef<RetouchStroke | null>(null);
  const selectionStartRef = useRef<RetouchPoint | null>(null);
  const panRef = useRef<{ clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const toolBeforeSpaceRef = useRef<Tool | null>(null);
  const draftLoadedRef = useRef(false);
  const visibleOperationsRef = useRef<RetouchOperation[]>([]);
  const comparisonRef = useRef<number | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#ffffff");
  const [brushWidth, setBrushWidth] = useState(32);
  const [fillTolerance, setFillTolerance] = useState(18);
  const [zoom, setZoom] = useState(1);
  const [operations, setOperations] = useState<RetouchOperation[]>([]);
  const [redoStack, setRedoStack] = useState<RetouchOperation[]>([]);
  const [pendingFill, setPendingFill] = useState<RetouchFill | null>(null);
  const [selection, setSelection] = useState<RetouchSelection | null>(null);
  const [adjustments, setAdjustments] = useState<RetouchAdjustments>(DEFAULT_RETOUCH_ADJUSTMENTS);
  const [comparison, setComparison] = useState<number | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"loading" | "saved" | "saving" | "error" | "idle">(draftUrl ? "loading" : "idle");
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; size: number } | null>(null);

  const visibleOperations = useMemo(() => pendingFill ? [...operations, pendingFill] : operations, [operations, pendingFill]);
  const hasAdjustments = !sameAdjustments(adjustments, DEFAULT_RETOUCH_ADJUSTMENTS);
  const hasChanges = operations.length > 0 || hasAdjustments;

  useEffect(() => { visibleOperationsRef.current = visibleOperations; }, [visibleOperations]);
  useEffect(() => { comparisonRef.current = comparison; }, [comparison]);

  const redraw = useCallback((entries: RetouchOperation[], comparisonPercent: number | null) => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    const adjusted = adjustedSourceRef.current;
    const editLayer = editLayerRef.current;
    const area = workspace;
    if (!canvas || !source || !adjusted || !editLayer || !area) return;
    const editContext = editLayer.getContext("2d", { willReadFrequently: true });
    const display = canvas.getContext("2d");
    if (!editContext || !display) return;
    rebuildEditLayer(editContext, entries, adjusted);
    display.clearRect(0, 0, canvas.width, canvas.height);
    display.drawImage(adjusted, 0, 0);
    display.drawImage(editLayer, 0, 0);
    if (comparisonPercent !== null) {
      const split = canvas.width * comparisonPercent / 100;
      display.save();
      display.beginPath(); display.rect(0, 0, split, canvas.height); display.clip();
      display.clearRect(0, 0, split, canvas.height);
      display.drawImage(source, area.offsetX, area.offsetY, area.sourceWidth, area.sourceHeight);
      display.restore();
    }
  }, [workspace]);

  useEffect(() => {
    let active = true;
    let bitmap: ImageBitmap | null = null;
    setLoading(true); setError("");
    void fetch(imageUrl, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Não foi possível carregar a imagem para edição."); return response.blob(); })
      .then((blob) => createImageBitmap(blob))
      .then((loaded) => {
        bitmap = loaded;
        if (!active || !canvasRef.current) return;
        const area = createWorkspace(loaded.width, loaded.height);
        canvasRef.current.width = area.width; canvasRef.current.height = area.height;
        const editLayer = document.createElement("canvas"); editLayer.width = area.width; editLayer.height = area.height;
        sourceRef.current = loaded; editLayerRef.current = editLayer;
        setWorkspace(area); setLoading(false);
      })
      .catch((loadError) => { if (active) { setLoading(false); setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a imagem."); } });
    return () => { active = false; bitmap?.close(); sourceRef.current = null; adjustedSourceRef.current = null; editLayerRef.current = null; };
  }, [imageUrl]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source || !workspace) return;
    const adjusted = buildAdjustedSource(source, workspace, adjustments);
    adjustedSourceRef.current = adjusted;
    redraw(visibleOperationsRef.current, comparisonRef.current);
  }, [adjustments, redraw, workspace]);

  useEffect(() => redraw(visibleOperations, comparison), [comparison, redraw, visibleOperations]);

  useEffect(() => {
    if (!draftUrl) { draftLoadedRef.current = true; return; }
    let active = true;
    void fetch(draftUrl, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Não foi possível recuperar o rascunho.");
        if (active && data?.draft) {
          const draft = data.draft as RetouchDraft;
          setOperations(draft.operations ?? []);
          setAdjustments(draft.adjustments ?? DEFAULT_RETOUCH_ADJUSTMENTS);
          setDraftStatus("saved");
        } else if (active) setDraftStatus("idle");
      })
      .catch(() => { if (active) setDraftStatus("error"); })
      .finally(() => { if (active) draftLoadedRef.current = true; });
    return () => { active = false; };
  }, [draftUrl]);

  useEffect(() => {
    if (!draftUrl || !draftLoadedRef.current) return;
    const timeout = window.setTimeout(() => {
      setDraftStatus("saving");
      const draft: RetouchDraft = { version: 1, operations, adjustments };
      void fetch(draftUrl, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft }) })
        .then((response) => { if (!response.ok) throw new Error(); setDraftStatus("saved"); })
        .catch(() => setDraftStatus("error"));
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [adjustments, draftUrl, operations]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select") && event.key !== "Escape") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === " ") { event.preventDefault(); toolBeforeSpaceRef.current = tool; setTool("pan"); }
      else if (key === "b") chooseTool("brush");
      else if (key === "e") chooseTool("eraser");
      else if (key === "i") chooseTool("eyedropper");
      else if (key === "g") chooseTool("fill");
      else if (key === "r") chooseTool("select");
      else if (key === "escape") { setSelection(null); setPendingFill(null); }
    }
    function onKeyUp(event: KeyboardEvent) { if (event.key === " " && toolBeforeSpaceRef.current) { setTool(toolBeforeSpaceRef.current); toolBeforeSpaceRef.current = null; } }
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  });

  function chooseTool(next: Tool) { setPendingFill(null); setTool(next); }
  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>): RetouchPoint {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) * canvas.width / rect.width, 0, canvas.width - 1), y: clamp((event.clientY - rect.top) * canvas.height / rect.height, 0, canvas.height - 1) };
  }
  function updateCursor(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas || !["brush", "eraser"].includes(tool)) { setCursor(null); return; }
    const rect = canvas.getBoundingClientRect();
    setCursor({ x: event.clientX, y: event.clientY, size: Math.max(3, brushWidth * rect.width / canvas.width) });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (loading || saving) return;
    updateCursor(event);
    if (tool === "pan") {
      const viewport = viewportRef.current; if (!viewport) return;
      panRef.current = { clientX: event.clientX, clientY: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
      event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    const point = pointerPosition(event);
    if (tool === "eyedropper") { pickColor(point); return; }
    if (tool === "fill") {
      setPendingFill({ kind: "fill", point, color, tolerance: fillTolerance, selection }); return;
    }
    if (tool === "select") {
      selectionStartRef.current = point; setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    currentStrokeRef.current = { kind: "stroke", tool, color, width: brushWidth, points: [point], selection };
    event.currentTarget.setPointerCapture(event.pointerId);
    redraw([...operations, currentStrokeRef.current], comparison);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    updateCursor(event);
    if (panRef.current && tool === "pan") {
      const viewport = viewportRef.current; if (!viewport) return;
      viewport.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.clientX);
      viewport.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.clientY); return;
    }
    if (selectionStartRef.current && tool === "select") {
      const point = pointerPosition(event); const start = selectionStartRef.current;
      setSelection(normalizeSelection({ x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y })); return;
    }
    const stroke = currentStrokeRef.current; if (!stroke) return;
    const point = pointerPosition(event); const previous = stroke.points[stroke.points.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < Math.max(1, stroke.width / 8)) return;
    stroke.points.push(point); redraw([...operations, stroke], comparison);
  }

  function finishPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    panRef.current = null; selectionStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const stroke = currentStrokeRef.current; if (!stroke) return;
    currentStrokeRef.current = null; setOperations((current) => [...current, stroke]); setRedoStack([]);
  }
  function pickColor(point: RetouchPoint) {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d", { willReadFrequently: true }); if (!context) return;
    const pixel = context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
    setColor(sampledRgbToHex(pixel[0], pixel[1], pixel[2])); setTool("brush");
  }
  function applyPendingFill() { if (!pendingFill) return; setOperations((current) => [...current, pendingFill]); setRedoStack([]); setPendingFill(null); }
  function undo() { setPendingFill(null); setOperations((current) => { const last = current.at(-1); if (!last) return current; setRedoStack((redoEntries) => [...redoEntries, last]); return current.slice(0, -1); }); }
  function redo() { setPendingFill(null); setRedoStack((current) => { const last = current.at(-1); if (!last) return current; setOperations((entries) => [...entries, last]); return current.slice(0, -1); }); }
  function reset() { setOperations([]); setRedoStack([]); setPendingFill(null); setSelection(null); setAdjustments(DEFAULT_RETOUCH_ADJUSTMENTS); setError(""); }

  async function save() {
    const adjusted = adjustedSourceRef.current; const editLayer = editLayerRef.current;
    if (!hasChanges || !adjusted || !editLayer) { setError("Faça ao menos um retoque ou ajuste antes de salvar uma nova versão."); return; }
    setSaving(true); setError("");
    try {
      const output = document.createElement("canvas"); output.width = adjusted.width; output.height = adjusted.height;
      const context = output.getContext("2d"); if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
      context.drawImage(adjusted, 0, 0); context.drawImage(editLayer, 0, 0);
      const blob = await exportWebp(output);
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error("A versão editada excedeu 3 MB. Reduza a imagem original antes de tentar novamente.");
      await onSave({ fileName: createRetouchedArtworkFileName(fileName, Date.now()), mimeType: "image/webp", fileSize: blob.size, dataUrl: await blobToDataUrl(blob) });
      if (draftUrl) void fetch(draftUrl, { method: "DELETE" });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o retoque."); setSaving(false); }
  }

  const guides = useMemo(() => createGuideLayout(workspace, geometry, bleedMm, safeMarginMm), [bleedMm, geometry, safeMarginMm, workspace]);
  const cursorStyle = tool === "eyedropper" || tool === "fill" ? "crosshair" : tool === "pan" ? "grab" : tool === "select" ? "crosshair" : "none";
  const checkerboard = { backgroundColor: "#f4f4f5", backgroundImage: "linear-gradient(45deg,#d4d4d8 25%,transparent 25%),linear-gradient(-45deg,#d4d4d8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d4d4d8 75%),linear-gradient(-45deg,transparent 75%,#d4d4d8 75%)", backgroundSize: "24px 24px", backgroundPosition: "0 0,0 12px,12px -12px,-12px 0" };

  return <div className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-black/85 p-2 backdrop-blur-sm sm:p-5">
    {cursor ? <span className="pointer-events-none fixed z-[100] rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,.75)]" style={{ left: cursor.x, top: cursor.y, width: cursor.size, height: cursor.size, transform: "translate(-50%,-50%)", background: tool === "brush" ? `${color}33` : "transparent" }} /> : null}
    <div className="grid h-[96vh] w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5"><div className="min-w-0"><h2 className="text-base font-semibold text-white">Retocar imagem</h2><p className="mt-0.5 truncate text-xs text-zinc-500">{artworkName} · original preservado · área externa disponível para sangria</p></div><div className="flex items-center gap-3"><DraftStatus status={draftStatus} /><button aria-label="Fechar editor" className="focus-ring rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" disabled={saving} type="button" onClick={onClose}><X size={18} /></button></div></header>
      <div className="grid min-h-0 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="order-2 overflow-y-auto border-t border-zinc-800 p-3 lg:order-1 lg:border-r lg:border-t-0 lg:p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase text-zinc-500">Ferramentas</p>
          <div className="grid grid-cols-3 gap-2"><ToolButton active={tool === "brush"} icon={<Brush size={15} />} label="Pincel" onClick={() => chooseTool("brush")} /><ToolButton active={tool === "eyedropper"} icon={<Pipette size={15} />} label="Capturar" onClick={() => chooseTool("eyedropper")} /><ToolButton active={tool === "eraser"} icon={<Eraser size={15} />} label="Borracha" onClick={() => chooseTool("eraser")} /><ToolButton active={tool === "fill"} icon={<PaintBucket size={15} />} label="Preencher" onClick={() => chooseTool("fill")} /><ToolButton active={tool === "select"} icon={<Scan size={15} />} label="Selecionar" onClick={() => chooseTool("select")} /><ToolButton active={tool === "pan"} icon={<Grab size={15} />} label="Mover" onClick={() => chooseTool("pan")} /></div>
          <div className="mt-5 grid gap-4">
            <label><span className="mb-2 block text-xs font-medium text-zinc-300">Cor ativa</span><span className="flex h-10 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2"><input aria-label="Selecionar cor" className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0" type="color" value={color} onChange={(event) => { setColor(event.target.value); chooseTool("brush"); }} /><span className="font-mono text-xs uppercase text-zinc-300">{color}</span></span></label>
            <label><span className="mb-2 flex justify-between gap-2 text-xs font-medium text-zinc-300"><span>Espessura</span><span className="tabular-nums text-cyan-300">{brushWidth}px</span></span><input className="w-full accent-cyan-400" max="240" min="2" step="2" type="range" value={brushWidth} onChange={(event) => setBrushWidth(Number(event.target.value))} /></label>
            {tool === "fill" || pendingFill ? <label><span className="mb-2 flex justify-between gap-2 text-xs font-medium text-zinc-300"><span>Tolerância da cor</span><span className="tabular-nums text-cyan-300">{fillTolerance}</span></span><input className="w-full accent-cyan-400" max="100" min="0" type="range" value={fillTolerance} onChange={(event) => { setFillTolerance(Number(event.target.value)); setPendingFill(null); }} /><span className="mt-1 block text-[11px] text-zinc-600">Valores maiores incluem variações próximas da cor clicada.</span></label> : null}
            {pendingFill ? <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-3"><p className="text-xs text-amber-200">Prévia do preenchimento</p><div className="mt-2 flex gap-2"><button className="focus-ring flex-1 rounded-md bg-amber-300 px-2 py-1.5 text-xs font-semibold text-amber-950" type="button" onClick={applyPendingFill}>Aplicar</button><button className="focus-ring flex-1 rounded-md border border-amber-800 px-2 py-1.5 text-xs text-amber-200" type="button" onClick={() => setPendingFill(null)}>Cancelar</button></div></div> : null}
            {selection ? <div className="rounded-md border border-cyan-900 bg-cyan-950/20 p-2 text-xs text-cyan-200"><p>Ferramentas limitadas à seleção atual.</p><button className="mt-1 underline" type="button" onClick={() => setSelection(null)}>Remover seleção</button></div> : null}
            <details className="rounded-md border border-zinc-800"><summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-300"><span className="inline-flex items-center gap-2"><SlidersHorizontal size={14} /> Ajustes rápidos</span></summary><div className="grid gap-3 border-t border-zinc-800 p-3"><Adjustment label="Brilho" min={50} max={150} value={adjustments.brightness} onChange={(value) => setAdjustments((current) => ({ ...current, brightness: value }))} /><Adjustment label="Contraste" min={50} max={150} value={adjustments.contrast} onChange={(value) => setAdjustments((current) => ({ ...current, contrast: value }))} /><Adjustment label="Saturação" min={0} max={200} value={adjustments.saturation} onChange={(value) => setAdjustments((current) => ({ ...current, saturation: value }))} /><Adjustment label="Nitidez" min={0} max={100} value={adjustments.sharpness} onChange={(value) => setAdjustments((current) => ({ ...current, sharpness: value }))} /></div></details>
            <div><span className="mb-2 block text-xs font-medium text-zinc-300">Visualização</span><div className="flex items-center gap-2"><button aria-label="Reduzir zoom" className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-zinc-700 text-zinc-300" type="button" onClick={() => setZoom((value) => clamp(value - .25, .5, 4))}><ZoomOut size={15} /></button><span className="min-w-12 text-center text-xs tabular-nums text-cyan-300">{Math.round(zoom * 100)}%</span><button aria-label="Aumentar zoom" className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-zinc-700 text-zinc-300" type="button" onClick={() => setZoom((value) => clamp(value + .25, .5, 4))}><ZoomIn size={15} /></button></div></div>
            <button aria-pressed={showGuides} className={`focus-ring h-9 rounded-md border text-xs ${showGuides ? "border-cyan-700 bg-cyan-950/30 text-cyan-200" : "border-zinc-700 text-zinc-400"}`} type="button" onClick={() => setShowGuides((current) => !current)}>Guias de produção {showGuides ? "visíveis" : "ocultas"}</button>
            <div className="flex gap-2"><button className="focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 text-xs text-zinc-300 disabled:opacity-30" disabled={!operations.length} type="button" onClick={undo}><Undo2 size={14} /> Desfazer</button><button className="focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 text-xs text-zinc-300 disabled:opacity-30" disabled={!redoStack.length} type="button" onClick={redo}><Redo2 size={14} /> Refazer</button></div>
            <button className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-700 text-xs text-zinc-300" type="button" onClick={() => setComparison((current) => current === null ? 50 : null)}><Eye size={14} /> {comparison === null ? "Comparar original" : "Ocultar comparação"}</button>
            {comparison !== null ? <label><span className="mb-1 flex justify-between text-[11px] text-zinc-400"><span>Original</span><span>Editada</span></span><input className="w-full accent-cyan-400" max="100" min="0" type="range" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} /></label> : null}
            <button className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-950 text-xs text-red-300 disabled:opacity-40" disabled={!hasChanges} type="button" onClick={reset}><RotateCcw size={14} /> Restaurar tudo</button>
          </div>
        </aside>
        <main className="relative order-1 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-zinc-900 lg:order-2"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-400"><span>Pinte também na área quadriculada para estender o fundo e criar sangria.</span><span>{workspace ? `${workspace.width} × ${workspace.height}px · ${geometry ? geometryLabel(geometry) : "sem molde"}` : "Carregando..."}</span></div><div ref={viewportRef} className="relative min-h-0 overflow-auto p-4 sm:p-7"><div className="relative mx-auto" style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined, ...checkerboard }}><canvas ref={canvasRef} aria-label={`Editor da arte ${artworkName}`} className="block h-auto w-full touch-none shadow-[0_12px_40px_rgba(0,0,0,.45)]" style={{ cursor: cursorStyle }} onPointerCancel={finishPointer} onPointerDown={onPointerDown} onPointerEnter={updateCursor} onPointerLeave={() => setCursor(null)} onPointerMove={onPointerMove} onPointerUp={finishPointer} />{workspace ? <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${workspace.width} ${workspace.height}`}><rect fill="none" height={workspace.sourceHeight} stroke="rgba(255,255,255,.55)" strokeDasharray="12 8" strokeWidth="2" width={workspace.sourceWidth} x={workspace.offsetX} y={workspace.offsetY} />{showGuides && guides ? <><g transform={`translate(${guides.bleed.x} ${guides.bleed.y})`}><path d={guides.bleed.path} fill="none" stroke="rgba(251,191,36,.95)" strokeDasharray="12 8" strokeWidth="2" /></g><g transform={`translate(${guides.cut.x} ${guides.cut.y})`}><path d={guides.cut.path} fill="none" stroke="rgba(239,68,68,.95)" strokeDasharray="10 7" strokeWidth="2" /></g><g transform={`translate(${guides.safe.x} ${guides.safe.y})`}><path d={guides.safe.path} fill="none" stroke="rgba(103,232,249,.95)" strokeDasharray="10 7" strokeWidth="2" /></g></> : null}{selection ? <rect fill="rgba(34,211,238,.08)" height={selection.height} stroke="rgba(34,211,238,.95)" strokeDasharray="8 6" strokeWidth="2" width={selection.width} x={selection.x} y={selection.y} /> : null}{comparison !== null ? <line stroke="white" strokeWidth="3" x1={workspace.width * comparison / 100} x2={workspace.width * comparison / 100} y1="0" y2={workspace.height} /> : null}</svg> : null}</div>{showGuides && geometry ? <div className="mt-3 flex flex-wrap justify-center gap-4 text-[11px] text-zinc-400"><span className="text-amber-300">--- sangria</span><span className="text-red-300">--- corte</span><span className="text-cyan-300">--- área segura</span><span className="text-zinc-300">--- limite da imagem original</span></div> : null}{loading ? <div className="absolute inset-0 grid place-items-center bg-zinc-900/80 text-sm text-zinc-300"><span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Carregando imagem...</span></div> : null}</div></main>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3 sm:px-5"><div className="min-w-0">{error ? <p className="text-sm text-red-300">{error}</p> : <p className="text-xs text-zinc-500">Atalhos: B pincel · E borracha · I conta-gotas · G preencher · R selecionar · Espaço mover · Ctrl+Z desfazer.</p>}</div><div className="flex gap-2"><button className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300" disabled={saving} type="button" onClick={onClose}>Fechar</button><button className="focus-ring inline-flex items-center gap-2 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-950 disabled:opacity-50" disabled={saving || loading || !hasChanges || Boolean(pendingFill)} type="button" onClick={save}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Salvar nova versão</button></div></footer>
    </div>
  </div>;
}

function ToolButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button aria-pressed={active} className={`focus-ring inline-flex h-10 items-center justify-center gap-1 rounded-md border px-1 text-[11px] ${active ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`} type="button" onClick={onClick}>{icon}{label}</button>; }
function Adjustment({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) { return <label><span className="mb-1 flex justify-between text-[11px] text-zinc-400"><span>{label}</span><span>{value}%</span></span><input className="w-full accent-violet-400" max={max} min={min} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function DraftStatus({ status }: { status: "loading" | "saved" | "saving" | "error" | "idle" }) { if (status === "idle") return null; return <span className={`text-[11px] ${status === "error" ? "text-red-300" : "text-zinc-500"}`}>{status === "loading" ? "Carregando rascunho..." : status === "saving" ? "Salvando rascunho..." : status === "saved" ? "Rascunho salvo" : "Falha no autosave"}</span>; }

function createWorkspace(width: number, height: number): Workspace {
  const maxRatio = Math.max(0, (Math.sqrt(MAX_WORKSPACE_PIXELS / (width * height)) - 1) / 2);
  const ratio = Math.min(WORKSPACE_PADDING_RATIO, maxRatio);
  const offsetX = Math.round(width * ratio); const offsetY = Math.round(height * ratio);
  return { width: width + offsetX * 2, height: height + offsetY * 2, sourceWidth: width, sourceHeight: height, offsetX, offsetY };
}
function buildAdjustedSource(source: ImageBitmap, workspace: Workspace, adjustments: RetouchAdjustments) {
  const canvas = document.createElement("canvas"); canvas.width = workspace.width; canvas.height = workspace.height;
  const context = canvas.getContext("2d", { willReadFrequently: adjustments.sharpness > 0 }); if (!context) return canvas;
  context.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
  context.drawImage(source, workspace.offsetX, workspace.offsetY, workspace.sourceWidth, workspace.sourceHeight); context.filter = "none";
  if (adjustments.sharpness > 0) sharpenRegion(context, workspace, adjustments.sharpness / 100);
  return canvas;
}
function sharpenRegion(context: CanvasRenderingContext2D, workspace: Workspace, amount: number) {
  const image = context.getImageData(workspace.offsetX, workspace.offsetY, workspace.sourceWidth, workspace.sourceHeight);
  const source = new Uint8ClampedArray(image.data); const width = workspace.sourceWidth; const height = workspace.sourceHeight; const strength = amount * .45;
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel += 1) image.data[index + channel] = clamp(source[index + channel] * (1 + 4 * strength) - strength * (source[index - 4 + channel] + source[index + 4 + channel] + source[index - width * 4 + channel] + source[index + width * 4 + channel]), 0, 255);
  }
  context.putImageData(image, workspace.offsetX, workspace.offsetY);
}
function rebuildEditLayer(context: CanvasRenderingContext2D, operations: RetouchOperation[], base: HTMLCanvasElement) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  for (const operation of operations) {
    if (operation.kind === "stroke") drawStroke(context, operation);
    else applyFill(context, base, operation);
  }
}
function drawStroke(context: CanvasRenderingContext2D, stroke: RetouchStroke) {
  if (!stroke.points.length) return; context.save(); clipSelection(context, stroke.selection);
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over"; context.strokeStyle = stroke.color; context.fillStyle = stroke.color; context.lineWidth = stroke.width; context.lineCap = "round"; context.lineJoin = "round";
  if (stroke.points.length === 1) { context.beginPath(); context.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2); context.fill(); }
  else { context.beginPath(); context.moveTo(stroke.points[0].x, stroke.points[0].y); for (let index = 1; index < stroke.points.length; index += 1) context.lineTo(stroke.points[index].x, stroke.points[index].y); context.stroke(); }
  context.restore();
}
function applyFill(editContext: CanvasRenderingContext2D, base: HTMLCanvasElement, fill: RetouchFill) {
  const composite = document.createElement("canvas"); composite.width = base.width; composite.height = base.height; const context = composite.getContext("2d", { willReadFrequently: true }); if (!context) return;
  context.drawImage(base, 0, 0); context.drawImage(editContext.canvas, 0, 0); const image = context.getImageData(0, 0, composite.width, composite.height);
  const mask = findContiguousColorRegion({ pixels: image.data, width: composite.width, height: composite.height, startX: fill.point.x, startY: fill.point.y, tolerance: fill.tolerance, selection: fill.selection });
  const editImage = editContext.getImageData(0, 0, composite.width, composite.height); const [red, green, blue] = hexToRgb(fill.color);
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) { const offset = index * 4; editImage.data[offset] = red; editImage.data[offset + 1] = green; editImage.data[offset + 2] = blue; editImage.data[offset + 3] = 255; }
  editContext.putImageData(editImage, 0, 0);
}
function clipSelection(context: CanvasRenderingContext2D, selection?: RetouchSelection | null) { if (!selection) return; const normalized = normalizeSelection(selection); context.beginPath(); context.rect(normalized.x, normalized.y, normalized.width, normalized.height); context.clip(); }
function createGuideLayout(workspace: Workspace | null, geometry: PrintGeometry | null | undefined, bleedMm: number, safeMarginMm: number) {
  if (!workspace || !geometry) return null; const ratio = geometry.widthMm / geometry.heightMm; let width = workspace.sourceWidth; let height = width / ratio; if (height > workspace.sourceHeight) { height = workspace.sourceHeight; width = height * ratio; }
  const x = workspace.offsetX + (workspace.sourceWidth - width) / 2; const y = workspace.offsetY + (workspace.sourceHeight - height) / 2; const bleed = Math.max(0, width * bleedMm / geometry.widthMm); const safe = Math.max(0, width * safeMarginMm / geometry.widthMm); const radius = geometry.cornerRadiusMm / geometry.widthMm * width;
  const shape = (boxWidth: number, boxHeight: number, cornerRadius: number, inset = 0) => createShapePath({ shape: geometry.shape, width: boxWidth, height: boxHeight, cornerRadius, rotationDegrees: geometry.rotationDegrees, inset });
  return { bleed: { x: x - bleed, y: y - bleed, path: shape(width + bleed * 2, height + bleed * 2, radius + bleed) }, cut: { x, y, path: shape(width, height, radius) }, safe: { x, y, path: shape(width, height, radius, safe) } };
}
async function exportWebp(canvas: HTMLCanvasElement) { for (const quality of [.94, .86, .76]) { const blob = await canvasToBlob(canvas, "image/webp", quality); if (blob.size <= MAX_UPLOAD_BYTES) return blob; } return canvasToBlob(canvas, "image/webp", .68); }
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível exportar a imagem.")), type, quality)); }
function blobToDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a versão editada.")); reader.onerror = () => reject(new Error("Não foi possível ler a versão editada.")); reader.readAsDataURL(blob); }); }
function hexToRgb(value: string) { const normalized = value.replace("#", ""); return [Number.parseInt(normalized.slice(0, 2), 16), Number.parseInt(normalized.slice(2, 4), 16), Number.parseInt(normalized.slice(4, 6), 16)]; }
function sameAdjustments(left: RetouchAdjustments, right: RetouchAdjustments) { return left.brightness === right.brightness && left.contrast === right.contrast && left.saturation === right.saturation && left.sharpness === right.sharpness; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
