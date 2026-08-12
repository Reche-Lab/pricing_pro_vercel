"use client";

import { useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { createShapePath, geometryLabel, type PrintGeometry } from "@/domain/artwork/geometry";
import type { QuoteItemArtworkRow } from "@/repositories/quotes";

export function ArtworkCropEditor({
  artwork,
  geometry,
  bleedMm,
  safeMarginMm,
  imageUrl,
  itemId,
  quoteId,
  prepareUrl,
  onClose,
  onSaved
}: {
  artwork: QuoteItemArtworkRow;
  geometry: PrintGeometry;
  bleedMm: number;
  safeMarginMm: number;
  imageUrl: string;
  itemId: string;
  quoteId: string;
  prepareUrl?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scale, setScale] = useState(Number(artwork.crop_scale || 1));
  const [offsetX, setOffsetX] = useState(Number(artwork.crop_offset_x || 0));
  const [offsetY, setOffsetY] = useState(Number(artwork.crop_offset_y || 0));
  const [rotation, setRotation] = useState(Number(artwork.rotation_degrees || 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function prepare() {
    setSaving(true);
    setError("");
    const response = await fetch(prepareUrl ?? `/api/quotes/${quoteId}/items/${itemId}/artworks/${artwork.id}/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scale, offsetX, offsetY, rotationDegrees: rotation })
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(data?.error ?? "Não foi possível preparar a arte.");
      return;
    }
    onSaved();
  }

  function reset() {
    setScale(1); setOffsetX(0); setOffsetY(0); setRotation(0);
  }

  const outputWidthMm = geometry.widthMm + bleedMm * 2;
  const outputHeightMm = geometry.heightMm + bleedMm * 2;
  const viewWidth = 1000;
  const viewHeight = Math.max(200, viewWidth * outputHeightMm / outputWidthMm);
  const unitsPerMm = viewWidth / outputWidthMm;
  const bleedInset = bleedMm * unitsPerMm;
  const safeInset = (bleedMm + safeMarginMm) * unitsPerMm;
  const clipPath = createShapePath({ shape: geometry.shape, width: viewWidth, height: viewHeight, cornerRadius: (geometry.cornerRadiusMm + bleedMm) * unitsPerMm, rotationDegrees: geometry.rotationDegrees });
  const cutPath = createShapePath({ shape: geometry.shape, width: viewWidth, height: viewHeight, cornerRadius: geometry.cornerRadiusMm * unitsPerMm, rotationDegrees: geometry.rotationDegrees, inset: bleedInset });
  const safePath = createShapePath({ shape: geometry.shape, width: viewWidth, height: viewHeight, cornerRadius: Math.max(0, geometry.cornerRadiusMm - safeMarginMm) * unitsPerMm, rotationDegrees: geometry.rotationDegrees, inset: safeInset });
  const imageWidth = viewWidth * scale;
  const imageHeight = viewHeight * scale;
  const imageX = (viewWidth - imageWidth) / 2 + offsetX * viewWidth / 2;
  const imageY = (viewHeight - imageHeight) / 2 + offsetY * viewHeight / 2;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="my-auto grid max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl lg:grid-cols-[minmax(320px,1fr)_360px]">
        <div className="grid place-items-center bg-zinc-900 p-5 sm:p-8">
          <div className="w-full max-w-[520px] overflow-hidden bg-zinc-800 shadow-[0_0_0_8px_rgba(34,211,238,0.12)]" style={{ aspectRatio: `${outputWidthMm} / ${outputHeightMm}` }}>
            <svg aria-label={artwork.artwork_name ?? artwork.file_name} className="h-full w-full" viewBox={`0 0 ${viewWidth} ${viewHeight}`}>
              <defs><clipPath id={`artwork-shape-${artwork.id}`}><path d={clipPath} /></clipPath></defs>
              <path d={clipPath} fill="white" />
              <image clipPath={`url(#artwork-shape-${artwork.id})`} height={imageHeight} href={imageUrl} preserveAspectRatio="xMidYMid slice" transform={`rotate(${rotation} ${viewWidth / 2} ${viewHeight / 2})`} width={imageWidth} x={imageX} y={imageY} />
              <path d={cutPath} fill="none" stroke="rgba(239,68,68,0.9)" strokeDasharray="9 7" strokeWidth="2" />
              <path d={safePath} fill="none" stroke="rgba(103,232,249,0.9)" strokeDasharray="9 7" strokeWidth="2" />
            </svg>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-4 text-xs text-zinc-400"><span className="text-amber-300">Área externa · sangria {formatMm(bleedMm)}</span><span><i className="mr-1 inline-block h-2 w-4 border-t border-dashed border-red-500" /> corte {geometryLabel(geometry)}</span><span><i className="mr-1 inline-block h-2 w-4 border-t border-dashed border-cyan-300" /> segurança {formatMm(safeMarginMm)}</span></div>
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="font-semibold text-white">Enquadrar arte</h3><p className="mt-1 text-sm text-zinc-500">As guias usam as medidas do produto. Preencha toda a sangria e mantenha textos dentro da área segura.</p></div>
            <button className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" type="button" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="mt-5 grid gap-5">
            <div>
              <Slider label="Zoom" min={0.1} max={5} step={0.05} value={scale} onChange={setScale} display={`${scale.toFixed(2)}x`} />
              <p className="mt-1 text-[11px] leading-4 text-zinc-600">Abaixo de 1x, a área sem imagem será preenchida em branco.</p>
            </div>
            <Slider label="Posição horizontal" min={-1} max={1} step={0.01} value={offsetX} onChange={setOffsetX} display={`${Math.round(offsetX * 100)}%`} />
            <Slider label="Posição vertical" min={-1} max={1} step={0.01} value={offsetY} onChange={setOffsetY} display={`${Math.round(offsetY * 100)}%`} />
            <p className="-mt-3 text-[11px] leading-4 text-zinc-600">O deslocamento move a imagem em relação ao corte em qualquer nível de zoom, inclusive em 1x.</p>
            <Slider label="Rotação" min={-180} max={180} step={1} value={rotation} onChange={setRotation} display={`${Math.round(rotation)}°`} />
            <button className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900" type="button" onClick={reset}><RotateCcw size={14} /> Restaurar enquadramento</button>
          </div>
          {error ? <p className="mt-4 rounded-md bg-red-400/10 p-3 text-sm text-red-300">{error}</p> : null}
          <div className="mt-6 flex justify-end gap-2 border-t border-zinc-800 pt-4">
            <button className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300" type="button" onClick={onClose}>Cancelar</button>
            <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-950 disabled:opacity-50" disabled={saving} type="button" onClick={prepare}>{saving ? <Loader2 className="animate-spin" size={15} /> : null} Preparar arte</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void }) {
  return <label><span className="mb-2 flex justify-between gap-3 text-xs font-medium text-zinc-300"><span>{label}</span><span className="tabular-nums text-cyan-300">{display}</span></span><input className="w-full accent-cyan-400" max={max} min={min} step={step} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function formatMm(value: number) { return `${Number(value.toFixed(2)).toLocaleString("pt-BR")} mm`; }
