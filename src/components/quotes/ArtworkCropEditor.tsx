"use client";

import { useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import type { QuoteItemArtworkRow } from "@/repositories/quotes";

export function ArtworkCropEditor({
  artwork,
  diameterMm,
  imageUrl,
  itemId,
  quoteId,
  onClose,
  onSaved
}: {
  artwork: QuoteItemArtworkRow;
  diameterMm: number;
  imageUrl: string;
  itemId: string;
  quoteId: string;
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
    const response = await fetch(`/api/quotes/${quoteId}/items/${itemId}/artworks/${artwork.id}/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diameterMm, scale, offsetX, offsetY, rotationDegrees: rotation })
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

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="my-auto grid max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl lg:grid-cols-[minmax(320px,1fr)_360px]">
        <div className="grid place-items-center bg-zinc-900 p-5 sm:p-8">
          <div className="relative aspect-square w-full max-w-[520px] overflow-hidden rounded-full bg-white shadow-[0_0_0_8px_rgba(34,211,238,0.12)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={artwork.artwork_name ?? artwork.file_name}
              className="absolute inset-0 h-full w-full select-none object-cover"
              draggable={false}
              src={imageUrl}
              style={{ transform: `translate(${offsetX * -18}%, ${offsetY * -18}%) scale(${scale}) rotate(${rotation}deg)` }}
            />
            <div className="pointer-events-none absolute inset-[4.1%] rounded-full border border-dashed border-red-500/90" />
            <div className="pointer-events-none absolute inset-[9%] rounded-full border border-dashed border-cyan-300/90" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,transparent_69%,rgba(0,0,0,0.18)_70%)]" />
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-4 text-xs text-zinc-400"><span><i className="mr-1 inline-block h-2 w-4 border-t border-dashed border-red-500" /> corte</span><span><i className="mr-1 inline-block h-2 w-4 border-t border-dashed border-cyan-300" /> área segura</span><span>{diameterMm} mm finais</span></div>
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="font-semibold text-white">Enquadrar arte</h3><p className="mt-1 text-sm text-zinc-500">Posicione textos e elementos importantes dentro da área segura.</p></div>
            <button className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" type="button" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="mt-5 grid gap-5">
            <Slider label="Zoom" min={1} max={5} step={0.05} value={scale} onChange={setScale} display={`${scale.toFixed(2)}x`} />
            <Slider label="Posição horizontal" min={-1} max={1} step={0.01} value={offsetX} onChange={setOffsetX} display={`${Math.round(offsetX * 100)}%`} />
            <Slider label="Posição vertical" min={-1} max={1} step={0.01} value={offsetY} onChange={setOffsetY} display={`${Math.round(offsetY * 100)}%`} />
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
