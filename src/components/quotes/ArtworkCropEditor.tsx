"use client";

import React, { useEffect, useRef, useState } from "react";
import { LocateFixed, Loader2, Paintbrush, RotateCcw, X } from "lucide-react";
import { useArtworkExitGuard } from "./useArtworkExitGuard";
import { createPrintGuideLayout, type PrintGeometry } from "@/domain/artwork/geometry";
import type { QuoteItemArtworkRow } from "@/repositories/quotes";
import { artworkFramePlacement, type ArtworkFrame } from "@/domain/artwork/framing";
import { drawArtworkFrame } from "./artwork-frame-canvas";
import { sampledRgbToHex } from "@/domain/artwork/retouch";
import { ArtworkBackgroundControls } from "./ArtworkBackgroundControls";
import { useArtworkViewport } from "./useArtworkViewport";

export function ArtworkCropEditor({
  artwork,
  geometry,
  bleedMm,
  safeMarginMm,
  imageUrl,
  itemId,
  quoteId,
  prepareUrl,
  onPrepare,
  navigation,
  onRetouch,
  renderPreview,
  onClose,
  onSaved,
  focusBackground = false
}: {
  artwork: Pick<QuoteItemArtworkRow, "id" | "artwork_name" | "file_name" | "crop_scale" | "crop_offset_x" | "crop_offset_y" | "rotation_degrees"> & { crop_background_color?: string | null };
  geometry: PrintGeometry;
  bleedMm: number;
  safeMarginMm: number;
  imageUrl: string;
  itemId: string;
  quoteId: string;
  prepareUrl?: string;
  onPrepare?: (crop: ArtworkFrame) => Promise<void>;
  navigation?: React.ReactNode;
  onRetouch?: () => void;
  renderPreview?: (frame: ArtworkFrame) => React.ReactNode;
  onClose: () => void;
  onSaved: () => void;
  focusBackground?: boolean;
}) {
  const [scale, setScale] = useState(Number(artwork.crop_scale || 1));
  const [offsetX, setOffsetX] = useState(Number(artwork.crop_offset_x || 0));
  const [offsetY, setOffsetY] = useState(Number(artwork.crop_offset_y || 0));
  const [rotation, setRotation] = useState(Number(artwork.rotation_degrees || 0));
  const [backgroundColor, setBackgroundColor] = useState<string | null | undefined>(artwork.crop_background_color);
  const [sampling, setSampling] = useState(false);
  const captureGeneration = useRef(0);
  const sampleSource = useRef<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => () => { captureGeneration.current++; }, [imageUrl]);
  const backgroundPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusBackground) return;
    backgroundPanel.current?.scrollIntoView?.({ block: "nearest" });
    backgroundPanel.current?.querySelector<HTMLInputElement>('input[type="color"]')?.focus({ preventScroll: true });
  }, [focusBackground]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function prepare() {
    captureGeneration.current++;
    setSaving(true);
    setError("");
    try {
      const crop = { scale, offsetX, offsetY, rotationDegrees: rotation, ...(backgroundColor !== undefined ? { backgroundColor } : {}) };
      if (onPrepare) await onPrepare(crop);
      else {
        const response = await fetch(prepareUrl ?? `/api/quotes/${quoteId}/items/${itemId}/artworks/${artwork.id}/prepare`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(crop)
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setError(data?.error ?? "Não foi possível preparar a arte.");
          return false;
        }
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a arte.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const dirty = scale !== Number(artwork.crop_scale || 1) || offsetX !== Number(artwork.crop_offset_x || 0) || offsetY !== Number(artwork.crop_offset_y || 0) || rotation !== Number(artwork.rotation_degrees || 0) || (backgroundColor ?? null) !== (artwork.crop_background_color ?? null);
  const exit = useArtworkExitGuard({ dirty, busy: saving, save: prepare });

  function reset() {
    captureGeneration.current++;
    setScale(1); setOffsetX(0); setOffsetY(0); setRotation(0);
    setBackgroundColor(null); setSampling(false);
  }

  function centerArtwork() {
    setOffsetX(0); setOffsetY(0);
  }

  const viewWidth = 1000;
  const physicalDimensions = createPrintGuideLayout({ geometry, margins: { bleedMm, safeMarginMm }, viewportWidth: viewWidth, viewportHeight: viewWidth });
  const outputWidthMm = physicalDimensions.outputWidthMm;
  const outputHeightMm = physicalDimensions.outputHeightMm;
  const viewHeight = viewWidth * outputHeightMm / outputWidthMm;
  const guides = createPrintGuideLayout({ geometry, margins: { bleedMm, safeMarginMm }, viewportWidth: viewWidth, viewportHeight: viewHeight });
  const clipPath = guides.outer.path;
  const cutPath = guides.cut.path;
  const bleedPath = guides.bleed.path;
  const safePath = guides.safe.path;
  const image = artworkFramePlacement(viewWidth, viewHeight, { scale, offsetX, offsetY, rotationDegrees: rotation });
  const previewRef = useRef<HTMLDivElement>(null);
  const { fitted } = useArtworkViewport(previewRef, viewWidth, viewHeight);
  const oneDimension = geometry.shape === "circle" || geometry.shape === "square";
  const safeAbsolute = formatAbsoluteSize(guides.safeWidthMm, guides.safeHeightMm, oneDimension);
  const sangriaAbsolute = formatAbsoluteSize(guides.sangriaWidthMm, guides.sangriaHeightMm, oneDimension);
  const cutAbsolute = formatAbsoluteSize(guides.outputWidthMm, guides.outputHeightMm, oneDimension);

  async function captureBackground(event: React.MouseEvent<SVGSVGElement>) {
    if (!sampling || saving) return;
    const generation = ++captureGeneration.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(viewWidth - 1, Math.floor((event.clientX - bounds.left) / bounds.width * viewWidth)));
    const y = Math.max(0, Math.min(Math.round(viewHeight) - 1, Math.floor((event.clientY - bounds.top) / bounds.height * viewHeight)));
    try {
      const loaded = sampleSource.current?.url === imageUrl ? sampleSource.current.image : await new Promise<HTMLImageElement>((resolve, reject) => {
        const source = new Image(); source.crossOrigin = "anonymous";
        source.onload = () => resolve(source); source.onerror = () => reject(new Error("Não foi possível capturar a cor. Use o seletor de cores.")); source.src = imageUrl;
      });
      if (generation !== captureGeneration.current) return;
      sampleSource.current = { url: imageUrl, image: loaded };
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Use o seletor de cores para completar o fundo.");
      // Sample one transformed pixel without allocating a full-size canvas for tall products.
      context.translate(-x, -y);
      drawArtworkFrame(context, loaded, loaded.naturalWidth, loaded.naturalHeight, viewWidth, viewHeight, { scale, offsetX, offsetY, rotationDegrees: rotation });
      const pixel = context.getImageData(0, 0, 1, 1).data;
      if (!pixel[3]) { setError("Esta região está transparente. Selecione uma cor dentro da imagem."); return; }
      setBackgroundColor(sampledRgbToHex(pixel[0], pixel[1], pixel[2])); setSampling(false); setError("");
    } catch { if (generation === captureGeneration.current) setError("Não foi possível capturar esta cor. Use o seletor de cores para completar o fundo."); }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-hidden bg-black/80 p-0 backdrop-blur-sm sm:p-3 lg:p-6">
      <div className="grid h-dvh w-full min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(210px,42dvh)_minmax(0,1fr)] overflow-hidden border border-zinc-700 bg-zinc-950 shadow-2xl sm:h-[94dvh] sm:rounded-lg lg:max-w-4xl lg:grid-cols-[minmax(320px,1fr)_360px] lg:grid-rows-1">
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-zinc-900 p-3 sm:p-5 lg:p-8">
          <div ref={previewRef} className="grid min-h-0 min-w-0 place-items-center">
          <div className="max-h-full max-w-full overflow-hidden bg-zinc-800 shadow-[0_0_0_5px_rgba(34,211,238,0.12)] sm:shadow-[0_0_0_8px_rgba(34,211,238,0.12)]" style={{ width: fitted.width, height: fitted.height }}>
            <svg aria-label={artwork.artwork_name ?? artwork.file_name} className={`h-full w-full ${sampling ? "cursor-crosshair" : ""}`} viewBox={`0 0 ${viewWidth} ${viewHeight}`} onClick={event => void captureBackground(event)}>
              <defs><clipPath id={`artwork-shape-${artwork.id}`}><path d={clipPath} /></clipPath></defs>
              <path data-artwork-background d={clipPath} fill={backgroundColor ?? "white"} />
              <g clipPath={`url(#artwork-shape-${artwork.id})`}>
                <image height={image.height} href={imageUrl} preserveAspectRatio="xMidYMid slice" transform={`rotate(${rotation} ${viewWidth / 2} ${viewHeight / 2})`} width={image.width} x={image.x} y={image.y} />
              </g>
              <GuidePath d={cutPath} color="rgba(244,63,94,1)" dash="14 9" haloWidth={9} width={4.5} />
              <GuidePath d={bleedPath} color="rgba(251,191,36,1)" dash="12 7" haloWidth={8} width={4} />
              <GuidePath d={safePath} color="rgba(103,232,249,1)" dash="10 6" haloWidth={7} width={3.5} />
            </svg>
          </div>
          </div>
          <div className="mt-3 flex max-w-full gap-3 overflow-x-auto pb-1 text-[11px] text-zinc-400 sm:mt-5 sm:flex-wrap sm:justify-center sm:gap-4 sm:text-xs"><span className="shrink-0 text-cyan-300">Segurança: {safeAbsolute}</span><span className="shrink-0 text-amber-300">Sangria: {sangriaAbsolute}</span><span className="shrink-0 text-rose-300">Corte: {cutAbsolute}</span></div>
        </div>

        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="font-semibold text-white">Centralizar e enquadrar arte</h3><p className="mt-1 text-sm text-zinc-500">Posicione a composição usando as três guias de produção abaixo.</p></div>
            <button aria-label="Fechar enquadramento" disabled={saving} className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" type="button" onClick={() => exit.request(onClose)}><X size={18} /></button>
          </div>
          {navigation}
          <section aria-label="Prévia do produto e zoom" className="mt-4 min-w-0 space-y-3 rounded-md border border-zinc-700 p-3 text-zinc-200">
            {renderPreview ? <details open className="min-w-0"><summary className="cursor-pointer text-sm font-semibold">Seu produto em tempo real · frente e verso</summary><p className="my-2 text-xs leading-5 text-zinc-400">A linha amarela coincide com a borda da frente. A faixa até o corte continua no verso.</p>{renderPreview({ scale, offsetX, offsetY, rotationDegrees: rotation, ...(backgroundColor !== undefined ? { backgroundColor } : {}) })}</details> : null}
            <div className={renderPreview ? "border-t border-zinc-800 pt-3" : ""}>
              <Slider label="Zoom" min={0.1} max={5} step={0.05} value={scale} onChange={setScale} display={`${scale.toFixed(2)}x`} />
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">Áreas sem imagem recebem {backgroundColor ? "a cor de fundo escolhida" : "branco, a menos que você escolha uma cor de fundo"}.</p>
            </div>
          </section>
          <div ref={backgroundPanel} className="mt-4"><ArtworkBackgroundControls value={backgroundColor} disabled={saving} sampling={sampling} onChange={value => { captureGeneration.current++; setBackgroundColor(value); setSampling(false); setError(""); }} onSample={() => { captureGeneration.current++; setSampling(!sampling); setError(""); }}/></div>
          {onRetouch ? <button className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-40" disabled={saving} type="button" onClick={() => exit.request(onRetouch)}><Paintbrush size={15} /> Retocar arte</button> : null}
          <div className="mt-4 grid gap-2 rounded-md border border-zinc-800 bg-zinc-900/55 p-3 text-xs leading-5">
            <p className="mb-1 font-semibold text-zinc-200">Geometria de impressão e corte</p>
            <GuideHelp color="cyan" title={`1. Segurança · ${safeAbsolute}`}>Mantenha textos, logos, rostos e outros elementos importantes dentro desta área.</GuideHelp>
            <GuideHelp color="amber" title={`2. Sangria / limite visível · ${sangriaAbsolute}`}>Esta linha indica até onde a arte ficará visível no produto. O fundo e as cores não devem terminar aqui: precisam continuar até o corte.</GuideHelp>
            <GuideHelp color="rose" title={`3. Corte efetivo · ${cutAbsolute}`}>É o limite físico de corte. Continue o mesmo fundo por toda a faixa entre a sangria e esta linha para evitar bordas brancas e compensar pequenas variações do corte. Não coloque elementos importantes nessa faixa, pois ela ficará oculta.</GuideHelp>
          </div>
          <div className="mt-5 grid gap-5">
            <Slider label="Posição horizontal" min={-1} max={1} step={0.01} value={offsetX} onChange={setOffsetX} display={`${Math.round(offsetX * 100)}%`} />
            <Slider label="Posição vertical" min={-1} max={1} step={0.01} value={offsetY} onChange={setOffsetY} display={`${Math.round(offsetY * 100)}%`} />
            <p className="-mt-3 text-[11px] leading-4 text-zinc-600">O deslocamento move a imagem em relação ao corte em qualquer nível de zoom, inclusive em 1x.</p>
            <Slider label="Rotação" min={-180} max={180} step={1} value={rotation} onChange={setRotation} display={`${Math.round(rotation)}°`} />
            <div className="flex flex-wrap gap-2"><button className="focus-ring inline-flex items-center gap-2 rounded-md border border-cyan-800/80 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-950/40" type="button" onClick={centerArtwork}><LocateFixed size={14} /> Centralizar arte</button><button className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900" type="button" onClick={reset}><RotateCcw size={14} /> Restaurar tudo</button></div>
          </div>
          {error ? <p className="mt-4 rounded-md bg-red-400/10 p-3 text-sm text-red-300">{error}</p> : null}
          <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-2 border-t border-zinc-800 bg-zinc-950/95 pt-4 backdrop-blur sm:flex sm:justify-end">
            <button className="focus-ring min-h-10 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 sm:px-4" disabled={saving} type="button" onClick={() => exit.request(onClose)}>Fechar</button>
            <button className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-center text-sm font-semibold text-cyan-950 disabled:opacity-50 sm:px-4" disabled={saving} type="button" onClick={async () => { if (await prepare()) onSaved(); }}>{saving ? <Loader2 className="animate-spin" size={15} /> : null} {navigation ? "Revisar e aprovar" : "Preparar arte"}</button>
          </div>
        </div>
      </div>
      {exit.prompt}
    </div>
  );
}

function Slider({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void }) {
  return <label><span className="mb-2 flex justify-between gap-3 text-xs font-medium text-zinc-300"><span>{label}</span><span className="tabular-nums text-cyan-300">{display}</span></span><input className="w-full accent-cyan-400" max={max} min={min} step={step} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function GuideHelp({ color, title, children }: { color: "cyan" | "amber" | "rose"; title: string; children: React.ReactNode }) {
  const colorClass = color === "cyan" ? "bg-cyan-300" : color === "amber" ? "bg-amber-300" : "bg-rose-400";
  return <div className="flex items-start gap-2 text-zinc-400"><span className={`mt-2 h-0.5 w-5 shrink-0 ${colorClass}`} /><span><strong className="block font-medium text-zinc-200">{title}</strong>{children}</span></div>;
}

function GuidePath({ d, color, dash, haloWidth, width }: { d: string; color: string; dash: string; haloWidth: number; width: number }) {
  return <><path d={d} fill="none" stroke="rgba(0,0,0,.88)" strokeWidth={haloWidth} /><path d={d} fill="none" stroke={color} strokeDasharray={dash} strokeLinecap="round" strokeWidth={width} /></>;
}

function formatMm(value: number) { return `${Number(value.toFixed(2)).toLocaleString("pt-BR")} mm`; }
function formatAbsoluteSize(width: number, height: number, oneDimension: boolean) {
  return oneDimension ? formatMm(width) : `${formatMm(width)} × ${formatMm(height)}`;
}
