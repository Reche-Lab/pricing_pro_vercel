"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Brush, Check, Circle, Eraser, Eye, EyeOff, Grab, Layers3, Loader2, MousePointer2, PaintBucket, Pipette,
  RectangleHorizontal, Redo2, RotateCcw, Save, Shapes, SlidersHorizontal, Square, Trash2, Triangle,
  Undo2, X, ZoomIn, ZoomOut
} from "lucide-react";
import { createPrintGuideLayout, geometryLabel, type PrintGeometry } from "@/domain/artwork/geometry";
import {
  calculateCenteredLayerBounds,
  createRetouchedArtworkFileName,
  createRetouchShape,
  DEFAULT_RETOUCH_ADJUSTMENTS,
  DEFAULT_RETOUCH_COMPOSITION,
  findContiguousColorRegion,
  moveRetouchShape,
  normalizeSelection,
  resizeRetouchShape,
  sampledRgbToHex,
  type RetouchAdjustments,
  type RetouchComposition,
  type RetouchDraft,
  type RetouchFill,
  type RetouchOperation,
  type RetouchPoint,
  type RetouchSelection,
  type RetouchShape,
  type RetouchShapeHandle,
  type RetouchShapeType,
  type RetouchStroke
} from "@/domain/artwork/retouch";

type Tool = "brush" | "eyedropper" | "eraser" | "fill" | "shape" | "select" | "compose" | "pan";
type Workspace = { width: number; height: number; sourceWidth: number; sourceHeight: number; offsetX: number; offsetY: number };
type ShapeInteraction = { index: number; mode: "move" | RetouchShapeHandle; start: RetouchPoint; original: RetouchShape };
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
  const currentShapeRef = useRef<RetouchShape | null>(null);
  const shapeStartRef = useRef<RetouchPoint | null>(null);
  const shapeInteractionRef = useRef<ShapeInteraction | null>(null);
  const selectionStartRef = useRef<RetouchPoint | null>(null);
  const panRef = useRef<{ clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const toolBeforeSpaceRef = useRef<Tool | null>(null);
  const toolBeforeEyedropperRef = useRef<Tool>("brush");
  const draftLoadedRef = useRef(false);
  const visibleOperationsRef = useRef<RetouchOperation[]>([]);
  const comparisonRef = useRef<number | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#ffffff");
  const [brushWidth, setBrushWidth] = useState(32);
  const [fillTolerance, setFillTolerance] = useState(18);
  const [shapeType, setShapeType] = useState<RetouchShapeType>("circle");
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [operations, setOperations] = useState<RetouchOperation[]>([]);
  const [redoStack, setRedoStack] = useState<RetouchOperation[]>([]);
  const [pendingFill, setPendingFill] = useState<RetouchFill | null>(null);
  const [selection, setSelection] = useState<RetouchSelection | null>(null);
  const [adjustments, setAdjustments] = useState<RetouchAdjustments>(DEFAULT_RETOUCH_ADJUSTMENTS);
  const [composition, setComposition] = useState<RetouchComposition>(DEFAULT_RETOUCH_COMPOSITION);
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
  const hasCompositionChanges = !sameComposition(composition, DEFAULT_RETOUCH_COMPOSITION);
  const hasChanges = operations.length > 0 || hasAdjustments || hasCompositionChanges;
  const selectedShape = selectedShapeIndex === null ? null : operations[selectedShapeIndex]?.kind === "shape" ? operations[selectedShapeIndex] as RetouchShape : null;

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
    const adjusted = buildAdjustedSource(source, workspace, adjustments, composition, geometry);
    adjustedSourceRef.current = adjusted;
    redraw(visibleOperationsRef.current, comparisonRef.current);
  }, [adjustments, composition, geometry, redraw, workspace]);

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
          setComposition(draft.composition ?? DEFAULT_RETOUCH_COMPOSITION);
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
      const draft: RetouchDraft = { version: 1, operations, adjustments, composition };
      void fetch(draftUrl, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft }) })
        .then((response) => { if (!response.ok) throw new Error(); setDraftStatus("saved"); })
        .catch(() => setDraftStatus("error"));
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [adjustments, composition, draftUrl, operations]);

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
      else if (key === "i") activateEyedropper();
      else if (key === "g") chooseTool("fill");
      else if (key === "s") chooseTool("shape");
      else if (key === "r") chooseTool("select");
      else if (key === "t") chooseTool("compose");
      else if ((key === "delete" || key === "backspace") && selectedShapeIndex !== null) { event.preventDefault(); deleteSelectedShape(); }
      else if (key === "escape") { setSelection(null); setPendingFill(null); setSelectedShapeIndex(null); }
    }
    function onKeyUp(event: KeyboardEvent) { if (event.key === " " && toolBeforeSpaceRef.current) { setTool(toolBeforeSpaceRef.current); toolBeforeSpaceRef.current = null; } }
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  });

  function chooseTool(next: Tool) { setPendingFill(null); if (next !== "shape" && next !== "eyedropper") setSelectedShapeIndex(null); setTool(next); }
  function activateEyedropper() { if (tool !== "eyedropper") toolBeforeEyedropperRef.current = tool; chooseTool("eyedropper"); }
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
    if (tool === "shape") {
      const interaction = findShapeInteraction(point, operations, selectedShapeIndex, canvasScale(event.currentTarget));
      if (interaction) {
        setSelectedShapeIndex(interaction.index); setShapeControls(interaction.original); shapeInteractionRef.current = { ...interaction, start: point };
        event.currentTarget.setPointerCapture(event.pointerId); return;
      }
      setSelectedShapeIndex(null);
      shapeStartRef.current = point;
      currentShapeRef.current = createRetouchShape({ shapeType, start: point, end: point, color, width: brushWidth, selection });
      event.currentTarget.setPointerCapture(event.pointerId);
      redraw([...operations, currentShapeRef.current], comparison); return;
    }
    if (tool === "compose") return;
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
    if (shapeStartRef.current && tool === "shape") {
      const point = pointerPosition(event);
      currentShapeRef.current = createRetouchShape({ shapeType, start: shapeStartRef.current, end: point, color, width: brushWidth, selection });
      redraw([...operations, currentShapeRef.current], comparison); return;
    }
    if (shapeInteractionRef.current && tool === "shape") {
      const point = pointerPosition(event); const interaction = shapeInteractionRef.current;
      const updated = interaction.mode === "move"
        ? moveRetouchShape(interaction.original, point.x - interaction.start.x, point.y - interaction.start.y)
        : resizeRetouchShape(interaction.original, interaction.mode, point);
      currentShapeRef.current = updated;
      redraw(replaceOperation(operations, interaction.index, updated), comparison); return;
    }
    const stroke = currentStrokeRef.current; if (!stroke) return;
    const point = pointerPosition(event); const previous = stroke.points[stroke.points.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < Math.max(1, stroke.width / 8)) return;
    stroke.points.push(point); redraw([...operations, stroke], comparison);
  }

  function finishPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    panRef.current = null; selectionStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const shape = currentShapeRef.current;
    shapeStartRef.current = null; currentShapeRef.current = null;
    const interaction = shapeInteractionRef.current; shapeInteractionRef.current = null;
    if (shape) {
      if (interaction) {
        setOperations((current) => replaceOperation(current, interaction.index, shape)); setSelectedShapeIndex(interaction.index); setShapeControls(shape); setRedoStack([]);
      } else if (shape.bounds.width >= 2 && shape.bounds.height >= 2) {
        setOperations((current) => { setSelectedShapeIndex(current.length); return [...current, shape]; }); setShapeControls(shape); setRedoStack([]);
      }
      else redraw(operations, comparison);
      return;
    }
    const stroke = currentStrokeRef.current; if (!stroke) return;
    currentStrokeRef.current = null; setOperations((current) => [...current, stroke]); setRedoStack([]);
  }
  function pickColor(point: RetouchPoint) {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d", { willReadFrequently: true }); if (!context) return;
    const pixel = context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
    const sampled = sampledRgbToHex(pixel[0], pixel[1], pixel[2]); setColor(sampled); updateSelectedShape({ color: sampled }); setTool(toolBeforeEyedropperRef.current);
  }
  function applyPendingFill() { if (!pendingFill) return; setOperations((current) => [...current, pendingFill]); setRedoStack([]); setPendingFill(null); }
  function undo() { setPendingFill(null); setSelectedShapeIndex(null); setOperations((current) => { const last = current.at(-1); if (!last) return current; setRedoStack((redoEntries) => [...redoEntries, last]); return current.slice(0, -1); }); }
  function redo() { setPendingFill(null); setRedoStack((current) => { const last = current.at(-1); if (!last) return current; setOperations((entries) => [...entries, last]); return current.slice(0, -1); }); }
  function reset() { setOperations([]); setRedoStack([]); setPendingFill(null); setSelection(null); setSelectedShapeIndex(null); setAdjustments(DEFAULT_RETOUCH_ADJUSTMENTS); setComposition(DEFAULT_RETOUCH_COMPOSITION); setError(""); }

  function setShapeControls(shape: RetouchShape) { setShapeType(shape.shapeType); setColor(shape.color); setBrushWidth(shape.width); }
  function updateSelectedShape(patch: Partial<Pick<RetouchShape, "shapeType" | "color" | "width" | "bounds">>) {
    if (selectedShapeIndex === null) return;
    setOperations((current) => {
      const operation = current[selectedShapeIndex]; if (operation?.kind !== "shape") return current;
      return replaceOperation(current, selectedShapeIndex, { ...operation, ...patch });
    });
    setRedoStack([]);
  }
  function updateSelectedDimension(key: "width" | "height", value: number) {
    if (!selectedShape) return; const bounded = clamp(Math.round(value) || 2, 2, workspace?.[key] ?? 20_000);
    const proportional = selectedShape.shapeType === "circle" || selectedShape.shapeType === "square";
    updateSelectedShape({ bounds: { ...selectedShape.bounds, [key]: bounded, ...(proportional ? { [key === "width" ? "height" : "width"]: bounded } : {}) } });
  }
  function changeShapeType(next: RetouchShapeType) {
    setShapeType(next);
    if (!selectedShape) return;
    const proportional = next === "circle" || next === "square";
    const size = Math.max(selectedShape.bounds.width, selectedShape.bounds.height);
    updateSelectedShape({ shapeType: next, bounds: proportional ? { ...selectedShape.bounds, width: size, height: size } : selectedShape.bounds });
  }
  function deleteSelectedShape() {
    if (selectedShapeIndex === null) return;
    setOperations((current) => current.filter((_, index) => index !== selectedShapeIndex)); setSelectedShapeIndex(null); setRedoStack([]);
  }

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

  const guides = useMemo(() => {
    if (!workspace || !geometry) return null;
    const layout = createPrintGuideLayout({
      geometry,
      margins: { bleedMm, safeMarginMm },
      viewportWidth: workspace.width,
      viewportHeight: workspace.height,
      paddingRatio: 0.04
    });
    return { ...layout, bleed: layout.outer };
  }, [bleedMm, geometry, safeMarginMm, workspace]);
  const foregroundBounds = useMemo(() => workspace ? calculateCenteredLayerBounds({
    canvasWidth: workspace.width,
    canvasHeight: workspace.height,
    sourceWidth: workspace.sourceWidth,
    sourceHeight: workspace.sourceHeight,
    scalePercent: composition.foregroundScalePercent
  }) : null, [composition.foregroundScalePercent, workspace]);
  const cursorStyle = tool === "eyedropper" || tool === "fill" || tool === "shape" ? "crosshair" : tool === "pan" ? "grab" : tool === "select" ? "crosshair" : "none";
  const checkerboard = { backgroundColor: "#f4f4f5", backgroundImage: "linear-gradient(45deg,#d4d4d8 25%,transparent 25%),linear-gradient(-45deg,#d4d4d8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d4d4d8 75%),linear-gradient(-45deg,transparent 75%,#d4d4d8 75%)", backgroundSize: "24px 24px", backgroundPosition: "0 0,0 12px,12px -12px,-12px 0" };

  return <div className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-black/85 p-0 backdrop-blur-sm sm:p-5">
    {cursor ? <span className="pointer-events-none fixed z-[100] rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,.75)]" style={{ left: cursor.x, top: cursor.y, width: cursor.size, height: cursor.size, transform: "translate(-50%,-50%)", background: tool === "brush" ? `${color}33` : "transparent" }} /> : null}
    <div className="grid h-dvh w-full max-w-7xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden border border-zinc-700 bg-zinc-950 shadow-2xl sm:h-[96dvh] sm:rounded-lg">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3"><div className="min-w-0"><h2 className="text-base font-semibold text-white">Retocar imagem</h2><p className="mt-0.5 max-w-full truncate text-xs text-zinc-500">{artworkName} · original preservado · área externa disponível para sangria</p></div><div className="flex shrink-0 items-center gap-2 sm:gap-3"><DraftStatus status={draftStatus} /><button aria-label="Fechar editor" className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white" disabled={saving} title="Fechar editor" type="button" onClick={onClose}><X size={18} /></button></div></header>
      {geometry && guides ? <PrintGuideMeasurements geometry={geometry} bleedMm={bleedMm} guides={guides} safeMarginMm={safeMarginMm} /> : <div className="border-b border-zinc-800 bg-amber-950/20 px-4 py-2 text-xs text-amber-200">Configure as medidas de impressão do produto para visualizar as linhas de produção.</div>}
      <div className="grid min-h-0 grid-rows-[minmax(230px,1fr)_minmax(190px,42dvh)] lg:grid-cols-[272px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="order-2 min-h-0 overflow-y-auto overscroll-contain border-t border-zinc-800 p-3 lg:order-1 lg:border-r lg:border-t-0 lg:p-4">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/45 p-2.5 shadow-inner shadow-black/20"><div className="mb-2 flex items-center justify-between px-0.5"><p className="text-[11px] font-semibold uppercase text-zinc-400">Ferramentas</p><span className="text-[10px] text-zinc-600">Escolha uma ação</span></div><div className="grid grid-cols-4 gap-1.5"><ToolButton active={tool === "brush"} description="Pintar livremente sobre a imagem" icon={<Brush size={18} strokeWidth={1.8} />} label="Pincel" shortcut="B" onClick={() => chooseTool("brush")} /><ToolButton active={tool === "eyedropper"} description="Capturar uma cor da imagem" icon={<Pipette size={18} strokeWidth={1.8} />} label="Cor" shortcut="I" onClick={activateEyedropper} /><ToolButton active={tool === "eraser"} description="Apagar partes do retoque" icon={<Eraser size={18} strokeWidth={1.8} />} label="Apagar" shortcut="E" onClick={() => chooseTool("eraser")} /><ToolButton active={tool === "fill"} description="Preencher uma área de cor contínua" icon={<PaintBucket size={18} strokeWidth={1.8} />} label="Preencher" shortcut="G" onClick={() => chooseTool("fill")} /><ToolButton active={tool === "shape"} description="Inserir e editar formatos vazados" icon={<Shapes size={18} strokeWidth={1.8} />} label="Formato" shortcut="S" onClick={() => chooseTool("shape")} /><ToolButton active={tool === "select"} description="Limitar os retoques a uma área" icon={<MousePointer2 size={18} strokeWidth={1.8} />} label="Selecionar" shortcut="R" onClick={() => chooseTool("select")} /><ToolButton active={tool === "compose"} description="Redimensionar a arte e estender seu fundo" icon={<Layers3 size={18} strokeWidth={1.8} />} label="Expandir" shortcut="T" onClick={() => chooseTool("compose")} /><ToolButton active={tool === "pan"} description="Mover a área de trabalho" icon={<Grab size={18} strokeWidth={1.8} />} label="Navegar" shortcut="Espaço" onClick={() => chooseTool("pan")} /></div></div>
          <div className="mt-5 grid gap-4">
            <label><span className="mb-2 block text-xs font-medium text-zinc-300">Cor ativa</span><span className="flex h-11 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 shadow-inner shadow-black/20 transition focus-within:border-cyan-500/70"><input aria-label="Selecionar cor" className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" title="Abrir seletor de cores" type="color" value={color} onChange={(event) => { setColor(event.target.value); updateSelectedShape({ color: event.target.value }); }} /><span className="font-mono text-xs uppercase text-zinc-300">{color}</span><button aria-label="Capturar cor da imagem" className="focus-ring ml-auto grid h-8 w-8 place-items-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-400 transition hover:border-cyan-500/50 hover:bg-cyan-950/35 hover:text-cyan-200" title="Capturar cor diretamente da imagem" type="button" onClick={activateEyedropper}><Pipette size={15} /></button></span></label>
            {tool === "compose" ? <div className="grid gap-4 rounded-md border border-cyan-900/70 bg-cyan-950/15 p-3"><div><p className="text-xs font-semibold text-cyan-100">Tamanho e continuidade</p><p className="mt-1 text-[11px] leading-4 text-zinc-500">A arte principal permanece acima. A cópia ampliada preenche o fundo sem substituir o original.</p></div><RangeControl label="Tamanho da arte principal" min={25} max={250} step={1} suffix="%" value={composition.foregroundScalePercent} onChange={(value) => setComposition((current) => ({ ...current, foregroundScalePercent: value }))} /><button aria-pressed={composition.backgroundEnabled} className={`focus-ring flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-left transition ${composition.backgroundEnabled ? "border-cyan-600/60 bg-cyan-950/40 text-cyan-100" : "border-zinc-700 bg-zinc-950/50 text-zinc-300 hover:border-zinc-600"}`} type="button" onClick={() => setComposition((current) => ({ ...current, backgroundEnabled: !current.backgroundEnabled }))}><span><strong className="block text-xs">Duplicar atrás da arte</strong><span className="mt-0.5 block text-[10px] text-zinc-500">Útil para fundos, texturas e degradês</span></span><span className={`h-5 w-9 rounded-full p-0.5 transition ${composition.backgroundEnabled ? "bg-cyan-400" : "bg-zinc-700"}`}><span className={`block h-4 w-4 rounded-full bg-zinc-950 transition-transform ${composition.backgroundEnabled ? "translate-x-4" : "translate-x-0"}`} /></span></button>{composition.backgroundEnabled ? <div className="grid gap-3 border-l-2 border-cyan-800/60 pl-3"><RangeControl label="Expansão ao redor" min={0} max={20} step={0.5} suffix=" mm" value={composition.backgroundExpansionMm} onChange={(value) => setComposition((current) => ({ ...current, backgroundExpansionMm: value }))} /><RangeControl label="Tamanho da cópia" min={50} max={250} step={1} suffix="%" value={composition.backgroundScalePercent} onChange={(value) => setComposition((current) => ({ ...current, backgroundScalePercent: value }))} /><RangeControl label="Suavização do fundo" min={0} max={40} step={1} suffix=" px" value={composition.backgroundBlurPx} onChange={(value) => setComposition((current) => ({ ...current, backgroundBlurPx: value }))} /></div> : null}</div> : null}
            {tool === "shape" ? <div className="rounded-md border border-zinc-800 bg-zinc-900/35 p-2.5"><span className="mb-2 block text-xs font-medium text-zinc-300">Formato vazado</span><div className="grid grid-cols-4 gap-1.5"><ShapeButton active={shapeType === "circle"} icon={<Circle size={18} strokeWidth={1.8} />} label="Círculo" onClick={() => changeShapeType("circle")} /><ShapeButton active={shapeType === "square"} icon={<Square size={18} strokeWidth={1.8} />} label="Quadrado" onClick={() => changeShapeType("square")} /><ShapeButton active={shapeType === "rectangle"} icon={<RectangleHorizontal size={19} strokeWidth={1.8} />} label="Retângulo" onClick={() => changeShapeType("rectangle")} /><ShapeButton active={shapeType === "triangle"} icon={<Triangle size={18} strokeWidth={1.8} />} label="Triângulo" onClick={() => changeShapeType("triangle")} /></div><span className="mt-2 block text-[11px] leading-4 text-zinc-500">Arraste para criar. Depois, mova pelo centro ou redimensione pelos cantos.</span></div> : null}
            {tool === "shape" && selectedShape ? <div className="grid gap-3 rounded-md border border-cyan-800/70 bg-cyan-950/20 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-cyan-100">Formato selecionado</span><button className="focus-ring grid h-7 w-7 place-items-center rounded-md text-red-300 hover:bg-red-950/50" title="Excluir formato" type="button" onClick={deleteSelectedShape}><Trash2 size={14} /></button></div><div className="grid grid-cols-2 gap-2"><DimensionInput label="Largura" max={workspace?.width ?? 20_000} value={Math.round(selectedShape.bounds.width)} onChange={(value) => updateSelectedDimension("width", value)} /><DimensionInput label="Altura" max={workspace?.height ?? 20_000} value={Math.round(selectedShape.bounds.height)} onChange={(value) => updateSelectedDimension("height", value)} /></div><p className="text-[11px] leading-4 text-cyan-200/65">As alterações permanecem editáveis até salvar a nova versão.</p></div> : null}
            <label><span className="mb-2 flex justify-between gap-2 text-xs font-medium text-zinc-300"><span>{tool === "shape" ? "Espessura do contorno" : "Espessura"}</span><span className="tabular-nums text-cyan-300">{brushWidth}px</span></span><input className="w-full accent-cyan-400" max="240" min="2" step="2" type="range" value={brushWidth} onChange={(event) => { const value = Number(event.target.value); setBrushWidth(value); updateSelectedShape({ width: value }); }} /></label>
            {tool === "fill" || pendingFill ? <label><span className="mb-2 flex justify-between gap-2 text-xs font-medium text-zinc-300"><span>Tolerância da cor</span><span className="tabular-nums text-cyan-300">{fillTolerance}</span></span><input className="w-full accent-cyan-400" max="100" min="0" type="range" value={fillTolerance} onChange={(event) => { setFillTolerance(Number(event.target.value)); setPendingFill(null); }} /><span className="mt-1 block text-[11px] text-zinc-600">Valores maiores incluem variações próximas da cor clicada.</span></label> : null}
            {pendingFill ? <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-3"><p className="text-xs text-amber-200">Prévia do preenchimento</p><div className="mt-2 flex gap-2"><button className="focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-300 px-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-200" type="button" onClick={applyPendingFill}><Check size={14} /> Aplicar</button><button className="focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-amber-800 px-2 text-xs text-amber-200 transition hover:bg-amber-950/60" type="button" onClick={() => setPendingFill(null)}><X size={14} /> Cancelar</button></div></div> : null}
            {selection ? <div className="rounded-md border border-cyan-900 bg-cyan-950/20 p-2 text-xs text-cyan-200"><p>Ferramentas limitadas à seleção atual.</p><button className="mt-1 underline" type="button" onClick={() => setSelection(null)}>Remover seleção</button></div> : null}
            <details className="rounded-md border border-zinc-800"><summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-300"><span className="inline-flex items-center gap-2"><SlidersHorizontal size={14} /> Ajustes rápidos</span></summary><div className="grid gap-3 border-t border-zinc-800 p-3"><Adjustment label="Brilho" min={50} max={150} value={adjustments.brightness} onChange={(value) => setAdjustments((current) => ({ ...current, brightness: value }))} /><Adjustment label="Contraste" min={50} max={150} value={adjustments.contrast} onChange={(value) => setAdjustments((current) => ({ ...current, contrast: value }))} /><Adjustment label="Saturação" min={0} max={200} value={adjustments.saturation} onChange={(value) => setAdjustments((current) => ({ ...current, saturation: value }))} /><Adjustment label="Nitidez" min={0} max={100} value={adjustments.sharpness} onChange={(value) => setAdjustments((current) => ({ ...current, sharpness: value }))} /></div></details>
            <div><span className="mb-2 block text-xs font-medium text-zinc-300">Visualização</span><div className="flex w-fit items-center rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-inner shadow-black/20"><IconButton icon={<ZoomOut size={16} />} label="Reduzir zoom" onClick={() => setZoom((value) => clamp(value - .25, .5, 4))} /><span className="min-w-14 text-center text-xs font-medium tabular-nums text-cyan-300">{Math.round(zoom * 100)}%</span><IconButton icon={<ZoomIn size={16} />} label="Aumentar zoom" onClick={() => setZoom((value) => clamp(value + .25, .5, 4))} /></div></div>
            <button aria-pressed={showGuides} className={`focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border text-xs font-medium transition ${showGuides ? "border-cyan-600/60 bg-cyan-950/35 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,.08)]" : "border-zinc-700 text-zinc-400 hover:bg-zinc-900"}`} title={showGuides ? "Ocultar guias de produção" : "Mostrar guias de produção"} type="button" onClick={() => setShowGuides((current) => !current)}>{showGuides ? <Eye size={15} /> : <EyeOff size={15} />} Guias {showGuides ? "visíveis" : "ocultas"}</button>
            <div className="grid grid-cols-2 gap-2"><ActionButton disabled={!operations.length} icon={<Undo2 size={15} />} label="Desfazer" title="Desfazer última alteração (Ctrl+Z)" onClick={undo} /><ActionButton disabled={!redoStack.length} icon={<Redo2 size={15} />} label="Refazer" title="Refazer alteração (Ctrl+Shift+Z)" onClick={redo} /></div>
            <button className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900" type="button" onClick={() => setComparison((current) => current === null ? 50 : null)}>{comparison === null ? <Eye size={15} /> : <EyeOff size={15} />} {comparison === null ? "Comparar com original" : "Encerrar comparação"}</button>
            {comparison !== null ? <label><span className="mb-1 flex justify-between text-[11px] text-zinc-400"><span>Original</span><span>Editada</span></span><input className="w-full accent-cyan-400" max="100" min="0" type="range" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} /></label> : null}
            <button className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-950/80 text-xs font-medium text-red-300 transition hover:border-red-900 hover:bg-red-950/35 disabled:cursor-not-allowed disabled:opacity-35" disabled={!hasChanges} title="Descartar todos os retoques desta sessão" type="button" onClick={reset}><RotateCcw size={15} /> Restaurar original</button>
          </div>
        </aside>
        <main className="relative order-1 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-zinc-900 lg:order-2"><div className="flex min-w-0 flex-wrap items-center justify-between gap-1 border-b border-zinc-800 px-2.5 py-1.5 text-[10px] text-zinc-400 sm:gap-2 sm:px-3 sm:py-2 sm:text-[11px]"><span className="min-w-0 break-words">Use Expandir para continuar fundos e degradês até a sangria.</span><span className="shrink-0">{workspace ? `${workspace.width} × ${workspace.height}px · ${geometry ? geometryLabel(geometry) : "sem molde"}` : "Carregando..."}</span></div><div ref={viewportRef} className="relative min-h-0 overflow-auto overscroll-contain p-2 sm:p-7"><div className="relative mx-auto" style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined, ...checkerboard }}><canvas ref={canvasRef} aria-label={`Editor da arte ${artworkName}`} className="block h-auto w-full touch-none shadow-[0_12px_40px_rgba(0,0,0,.45)]" style={{ cursor: cursorStyle }} onPointerCancel={finishPointer} onPointerDown={onPointerDown} onPointerEnter={updateCursor} onPointerLeave={() => setCursor(null)} onPointerMove={onPointerMove} onPointerUp={finishPointer} />{workspace ? <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${workspace.width} ${workspace.height}`}>{foregroundBounds ? <rect fill="none" height={foregroundBounds.height} stroke="rgba(255,255,255,.55)" strokeDasharray="12 8" strokeWidth="2" width={foregroundBounds.width} x={foregroundBounds.x} y={foregroundBounds.y} /> : null}{showGuides && guides ? <><g transform={`translate(${guides.bleed.x} ${guides.bleed.y})`}><path d={guides.bleed.path} fill="none" stroke="rgba(251,191,36,.95)" strokeDasharray="12 8" strokeWidth="2" /></g><g transform={`translate(${guides.cut.x} ${guides.cut.y})`}><path d={guides.cut.path} fill="none" stroke="rgba(239,68,68,.95)" strokeDasharray="10 7" strokeWidth="2" /></g><g transform={`translate(${guides.safe.x} ${guides.safe.y})`}><path d={guides.safe.path} fill="none" stroke="rgba(103,232,249,.95)" strokeDasharray="10 7" strokeWidth="2" /></g></> : null}{selection ? <rect fill="rgba(34,211,238,.08)" height={selection.height} stroke="rgba(34,211,238,.95)" strokeDasharray="8 6" strokeWidth="2" width={selection.width} x={selection.x} y={selection.y} /> : null}{tool === "shape" && selectedShape ? <ShapeSelectionOverlay shape={selectedShape} workspace={workspace} /> : null}{comparison !== null ? <line stroke="white" strokeWidth="3" x1={workspace.width * comparison / 100} x2={workspace.width * comparison / 100} y1="0" y2={workspace.height} /> : null}</svg> : null}</div>{showGuides && geometry ? <div className="mt-2 flex gap-3 overflow-x-auto pb-1 text-[10px] text-zinc-400 sm:mt-3 sm:flex-wrap sm:justify-center sm:gap-4 sm:text-[11px]"><span className="shrink-0 text-amber-300">--- sangria</span><span className="shrink-0 text-red-300">--- corte</span><span className="shrink-0 text-cyan-300">--- área segura</span><span className="shrink-0 text-zinc-300">--- limite da arte principal</span></div> : null}{loading ? <div className="absolute inset-0 grid place-items-center bg-zinc-900/80 text-sm text-zinc-300"><span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Carregando imagem...</span></div> : null}</div></main>
      </div>
      <footer className="grid shrink-0 gap-2 border-t border-zinc-800 bg-zinc-950/95 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-3"><div className="min-w-0">{error ? <p className="text-xs text-red-300 sm:text-sm">{error}</p> : <p className="hidden text-xs text-zinc-500 sm:block">Os retoques só substituem a versão ativa depois de salvar.</p>}</div><div className="grid grid-cols-2 gap-2 sm:flex"><button className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50 sm:px-4" disabled={saving} type="button" onClick={onClose}><X size={15} /> Fechar</button><button className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-center text-sm font-semibold text-cyan-950 shadow-[0_0_24px_rgba(34,211,238,.16)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none sm:px-4" disabled={saving || loading || !hasChanges || Boolean(pendingFill)} type="button" onClick={save}>{saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Salvar versão</button></div></footer>
    </div>
  </div>;
}

function ToolButton({ active, description, icon, label, shortcut, onClick }: { active: boolean; description: string; icon: ReactNode; label: string; shortcut: string; onClick: () => void }) {
  return <button aria-label={`${label}: ${description}`} aria-pressed={active} className={`focus-ring group relative grid h-14 min-w-0 place-items-center content-center gap-1 overflow-hidden rounded-md border px-1 transition ${active ? "border-cyan-500/70 bg-cyan-400/10 text-cyan-100 shadow-[inset_0_0_18px_rgba(34,211,238,.07)]" : "border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:-translate-y-px hover:border-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-200"}`} title={`${description} (${shortcut})`} type="button" onClick={onClick}>{active ? <span className="absolute inset-x-2 top-0 h-0.5 rounded-b bg-cyan-400" /> : null}<span className="transition-transform group-hover:scale-105">{icon}</span><span className="max-w-full truncate text-[10px] font-medium">{label}</span></button>;
}
function ShapeButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button aria-label={label} aria-pressed={active} className={`focus-ring group grid h-11 place-items-center rounded-md border transition ${active ? "border-cyan-500/70 bg-cyan-400/10 text-cyan-100 shadow-[inset_0_0_14px_rgba(34,211,238,.06)]" : "border-zinc-700 bg-zinc-950/40 text-zinc-500 hover:-translate-y-px hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"}`} title={`Usar ${label.toLowerCase()}`} type="button" onClick={onClick}><span className="transition-transform group-hover:scale-110">{icon}</span></button>; }
function IconButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) { return <button aria-label={label} className="focus-ring grid h-8 w-8 place-items-center rounded text-zinc-400 transition hover:bg-zinc-700 hover:text-white" title={label} type="button" onClick={onClick}>{icon}</button>; }
function ActionButton({ disabled, icon, label, title, onClick }: { disabled: boolean; icon: ReactNode; label: string; title: string; onClick: () => void }) { return <button aria-label={title} className="focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/30 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30" disabled={disabled} title={title} type="button" onClick={onClick}>{icon}{label}</button>; }
function DimensionInput({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (value: number) => void }) { return <label><span className="mb-1 block text-[11px] text-zinc-400">{label} (px)</span><input className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs tabular-nums text-zinc-200" max={max} min="2" step="1" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function ShapeSelectionOverlay({ shape, workspace }: { shape: RetouchShape; workspace: Workspace }) {
  const bounds = normalizeSelection(shape.bounds);
  const handleSize = Math.max(10, Math.min(workspace.width, workspace.height) * .012);
  const corners = [
    { key: "nw", x: bounds.x, y: bounds.y }, { key: "ne", x: bounds.x + bounds.width, y: bounds.y },
    { key: "se", x: bounds.x + bounds.width, y: bounds.y + bounds.height }, { key: "sw", x: bounds.x, y: bounds.y + bounds.height }
  ];
  return <g><rect fill="rgba(34,211,238,.04)" height={bounds.height} stroke="rgba(34,211,238,.95)" strokeDasharray={`${handleSize} ${handleSize * .65}`} strokeWidth={Math.max(2, handleSize * .15)} width={bounds.width} x={bounds.x} y={bounds.y} />{corners.map((corner) => <rect key={corner.key} fill="#22d3ee" height={handleSize} rx={handleSize * .16} stroke="#083344" strokeWidth={Math.max(1, handleSize * .12)} width={handleSize} x={corner.x - handleSize / 2} y={corner.y - handleSize / 2} />)}</g>;
}
function Adjustment({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) { return <label><span className="mb-1 flex justify-between text-[11px] text-zinc-400"><span>{label}</span><span>{value}%</span></span><input className="w-full accent-violet-400" max={max} min={min} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function RangeControl({ label, min, max, step, suffix, value, onChange }: { label: string; min: number; max: number; step: number; suffix: string; value: number; onChange: (value: number) => void }) { return <label><span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-400"><span>{label}</span><span className="tabular-nums text-cyan-300">{value}{suffix}</span></span><input className="w-full accent-cyan-400" max={max} min={min} step={step} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function PrintGuideMeasurements({ geometry, bleedMm, safeMarginMm, guides }: { geometry: PrintGeometry; bleedMm: number; safeMarginMm: number; guides: { outputWidthMm: number; outputHeightMm: number; safeWidthMm: number; safeHeightMm: number } }) {
  return <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 sm:grid sm:grid-cols-3 sm:px-5"><GuideMeasurement color="amber" label="Limite da sangria" measure={`${formatMeasurement(guides.outputWidthMm)} × ${formatMeasurement(guides.outputHeightMm)}`} detail={`${formatMeasurement(bleedMm)} além do corte`} /><GuideMeasurement color="red" label="Linha de corte" measure={`${formatMeasurement(geometry.widthMm)} × ${formatMeasurement(geometry.heightMm)}`} detail={geometryLabel(geometry).replace(/\s[\d,.]+\s×.*$/, "")} /><GuideMeasurement color="cyan" label="Área segura" measure={`${formatMeasurement(guides.safeWidthMm)} × ${formatMeasurement(guides.safeHeightMm)}`} detail={`${formatMeasurement(safeMarginMm)} para dentro do corte`} /></div>;
}
function GuideMeasurement({ color, label, measure, detail }: { color: "amber" | "red" | "cyan"; label: string; measure: string; detail: string }) {
  const styles = { amber: "border-amber-400 text-amber-300", red: "border-red-500 text-red-300", cyan: "border-cyan-300 text-cyan-200" }[color];
  return <div className="flex min-w-[180px] items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/55 px-2.5 py-2 sm:min-w-0"><span className={`h-7 shrink-0 border-l-2 ${styles}`} /><span className="min-w-0"><span className="block text-[10px] uppercase text-zinc-500">{label}</span><strong className={`block text-xs tabular-nums ${styles.split(" ")[1]}`}>{measure} mm</strong><span className="block truncate text-[10px] text-zinc-600">{detail}</span></span></div>;
}
function DraftStatus({ status }: { status: "loading" | "saved" | "saving" | "error" | "idle" }) { if (status === "idle") return null; return <span className={`text-[11px] ${status === "error" ? "text-red-300" : "text-zinc-500"}`}>{status === "loading" ? "Carregando rascunho..." : status === "saving" ? "Salvando rascunho..." : status === "saved" ? "Rascunho salvo" : "Falha no autosave"}</span>; }

function replaceOperation(operations: RetouchOperation[], index: number, operation: RetouchOperation) {
  return operations.map((current, currentIndex) => currentIndex === index ? operation : current);
}

function canvasScale(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return rect.width > 0 ? canvas.width / rect.width : 1;
}

function findShapeInteraction(
  point: RetouchPoint,
  operations: RetouchOperation[],
  selectedIndex: number | null,
  scale: number
): Omit<ShapeInteraction, "start"> | null {
  const handleRadius = Math.max(8, 12 * scale);
  if (selectedIndex !== null) {
    const selected = operations[selectedIndex];
    if (selected?.kind === "shape") {
      for (const handle of shapeHandles(selected)) {
        if (Math.hypot(point.x - handle.point.x, point.y - handle.point.y) <= handleRadius) {
          return { index: selectedIndex, mode: handle.handle, original: selected };
        }
      }
    }
  }
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    if (operation.kind !== "shape") continue;
    const bounds = normalizeSelection(operation.bounds);
    const padding = Math.max(operation.width / 2, 5 * scale);
    if (
      point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding
      && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding
    ) return { index, mode: "move", original: operation };
  }
  return null;
}

function shapeHandles(shape: RetouchShape): Array<{ handle: RetouchShapeHandle; point: RetouchPoint }> {
  const bounds = normalizeSelection(shape.bounds);
  return [
    { handle: "nw", point: { x: bounds.x, y: bounds.y } },
    { handle: "ne", point: { x: bounds.x + bounds.width, y: bounds.y } },
    { handle: "se", point: { x: bounds.x + bounds.width, y: bounds.y + bounds.height } },
    { handle: "sw", point: { x: bounds.x, y: bounds.y + bounds.height } }
  ];
}

function createWorkspace(width: number, height: number): Workspace {
  const maxRatio = Math.max(0, (Math.sqrt(MAX_WORKSPACE_PIXELS / (width * height)) - 1) / 2);
  const ratio = Math.min(WORKSPACE_PADDING_RATIO, maxRatio);
  const offsetX = Math.round(width * ratio); const offsetY = Math.round(height * ratio);
  return { width: width + offsetX * 2, height: height + offsetY * 2, sourceWidth: width, sourceHeight: height, offsetX, offsetY };
}
function buildAdjustedSource(source: ImageBitmap, workspace: Workspace, adjustments: RetouchAdjustments, composition: RetouchComposition, geometry?: PrintGeometry | null) {
  const canvas = document.createElement("canvas"); canvas.width = workspace.width; canvas.height = workspace.height;
  const context = canvas.getContext("2d", { willReadFrequently: adjustments.sharpness > 0 }); if (!context) return canvas;
  const colorFilter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  if (composition.backgroundEnabled) {
    const expansionPx = millimetersToWorkspacePixels(workspace, geometry, composition.backgroundExpansionMm);
    const background = calculateCenteredLayerBounds({ canvasWidth: workspace.width, canvasHeight: workspace.height, sourceWidth: workspace.sourceWidth, sourceHeight: workspace.sourceHeight, scalePercent: composition.backgroundScalePercent, expansionPx });
    context.filter = `${colorFilter} blur(${composition.backgroundBlurPx}px)`;
    context.drawImage(source, background.x, background.y, background.width, background.height);
  }
  const foreground = calculateCenteredLayerBounds({ canvasWidth: workspace.width, canvasHeight: workspace.height, sourceWidth: workspace.sourceWidth, sourceHeight: workspace.sourceHeight, scalePercent: composition.foregroundScalePercent });
  context.filter = colorFilter;
  context.drawImage(source, foreground.x, foreground.y, foreground.width, foreground.height); context.filter = "none";
  if (adjustments.sharpness > 0) sharpenRegion(context, foreground, adjustments.sharpness / 100);
  return canvas;
}
function sharpenRegion(context: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }, amount: number) {
  const x = Math.max(0, Math.floor(bounds.x)); const y = Math.max(0, Math.floor(bounds.y));
  const width = Math.min(context.canvas.width - x, Math.ceil(bounds.width)); const height = Math.min(context.canvas.height - y, Math.ceil(bounds.height));
  if (width < 3 || height < 3) return;
  const image = context.getImageData(x, y, width, height);
  const source = new Uint8ClampedArray(image.data); const strength = amount * .45;
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel += 1) image.data[index + channel] = clamp(source[index + channel] * (1 + 4 * strength) - strength * (source[index - 4 + channel] + source[index + 4 + channel] + source[index - width * 4 + channel] + source[index + width * 4 + channel]), 0, 255);
  }
  context.putImageData(image, x, y);
}
function rebuildEditLayer(context: CanvasRenderingContext2D, operations: RetouchOperation[], base: HTMLCanvasElement) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  for (const operation of operations) {
    if (operation.kind === "stroke") drawStroke(context, operation);
    else if (operation.kind === "fill") applyFill(context, base, operation);
    else drawOutlineShape(context, operation);
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
function drawOutlineShape(context: CanvasRenderingContext2D, shape: RetouchShape) {
  const bounds = normalizeSelection(shape.bounds);
  if (bounds.width <= 0 || bounds.height <= 0) return;
  context.save(); clipSelection(context, shape.selection);
  context.globalCompositeOperation = "source-over"; context.strokeStyle = shape.color; context.lineWidth = shape.width; context.lineJoin = "round"; context.lineCap = "round";
  context.beginPath();
  if (shape.shapeType === "circle") context.ellipse(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width / 2, bounds.height / 2, 0, 0, Math.PI * 2);
  else if (shape.shapeType === "triangle") { context.moveTo(bounds.x + bounds.width / 2, bounds.y); context.lineTo(bounds.x + bounds.width, bounds.y + bounds.height); context.lineTo(bounds.x, bounds.y + bounds.height); context.closePath(); }
  else context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.stroke(); context.restore();
}
function clipSelection(context: CanvasRenderingContext2D, selection?: RetouchSelection | null) { if (!selection) return; const normalized = normalizeSelection(selection); context.beginPath(); context.rect(normalized.x, normalized.y, normalized.width, normalized.height); context.clip(); }
function millimetersToWorkspacePixels(workspace: Workspace, geometry: PrintGeometry | null | undefined, millimeters: number) {
  if (!geometry || geometry.widthMm <= 0 || geometry.heightMm <= 0) return workspace.sourceWidth / 50 * millimeters;
  const fittedWidth = Math.min(workspace.sourceWidth, workspace.sourceHeight * geometry.widthMm / geometry.heightMm);
  return fittedWidth / geometry.widthMm * millimeters;
}
async function exportWebp(canvas: HTMLCanvasElement) { for (const quality of [.94, .86, .76]) { const blob = await canvasToBlob(canvas, "image/webp", quality); if (blob.size <= MAX_UPLOAD_BYTES) return blob; } return canvasToBlob(canvas, "image/webp", .68); }
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível exportar a imagem.")), type, quality)); }
function blobToDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a versão editada.")); reader.onerror = () => reject(new Error("Não foi possível ler a versão editada.")); reader.readAsDataURL(blob); }); }
function hexToRgb(value: string) { const normalized = value.replace("#", ""); return [Number.parseInt(normalized.slice(0, 2), 16), Number.parseInt(normalized.slice(2, 4), 16), Number.parseInt(normalized.slice(4, 6), 16)]; }
function sameAdjustments(left: RetouchAdjustments, right: RetouchAdjustments) { return left.brightness === right.brightness && left.contrast === right.contrast && left.saturation === right.saturation && left.sharpness === right.sharpness; }
function sameComposition(left: RetouchComposition, right: RetouchComposition) { return left.foregroundScalePercent === right.foregroundScalePercent && left.backgroundEnabled === right.backgroundEnabled && left.backgroundExpansionMm === right.backgroundExpansionMm && left.backgroundScalePercent === right.backgroundScalePercent && left.backgroundBlurPx === right.backgroundBlurPx; }
function formatMeasurement(value: number) { return Number(value.toFixed(2)).toLocaleString("pt-BR"); }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
