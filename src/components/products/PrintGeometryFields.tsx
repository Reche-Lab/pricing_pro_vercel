"use client";

import { useState } from "react";
import type { PrintCornerStyle, PrintShape } from "@/domain/artwork/geometry";

export type PrintGeometryFormValues = {
  shape: PrintShape;
  widthMm: string | number | null;
  heightMm: string | number | null;
  cornerStyle: PrintCornerStyle;
  cornerRadiusMm: string | number | null;
  rotationDegrees: string | number | null;
  allowPrintRotation: boolean;
  bleedMm: string | number | null;
  safeMarginMm: string | number | null;
};

const shapeOptions: Array<{ value: PrintShape; label: string }> = [
  { value: "circle", label: "Circular" },
  { value: "square", label: "Quadrado" },
  { value: "rectangle", label: "Retangular" },
  { value: "triangle", label: "Triangular" },
  { value: "hexagon", label: "Hexagonal" }
];

export function PrintGeometryFields({ defaults }: { defaults?: Partial<PrintGeometryFormValues> }) {
  const [shape, setShape] = useState<PrintShape>(defaults?.shape ?? "circle");
  const [cornerStyle, setCornerStyle] = useState<PrintCornerStyle>(defaults?.cornerStyle ?? "sharp");
  const oneDimension = shape === "circle" || shape === "square";
  const polygon = shape === "triangle" || shape === "hexagon";

  return (
    <div className="mt-4 rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-4">
      <p className="text-sm font-medium text-cyan-100">Geometria de impressão e corte</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">As dimensões definem o corte final. Sangria e margem segura são medidas rigorosamente a partir desse contorno no enquadramento e no PDF A4.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className="mb-1 block text-xs font-medium text-zinc-400">Formato</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" name="printShape" value={shape} onChange={(event) => setShape(event.target.value as PrintShape)}>{shapeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <GeometryInput defaultValue={defaults?.widthMm ?? ""} label={shape === "circle" ? "Diâmetro (mm)" : oneDimension ? "Lado (mm)" : "Largura (mm)"} name="printWidthMm" required />
        {!oneDimension ? <GeometryInput defaultValue={defaults?.heightMm ?? ""} label="Altura (mm)" name="printHeightMm" required /> : <input name="printHeightMm" type="hidden" value={String(defaults?.widthMm ?? "")} />}
        {shape !== "circle" ? <label><span className="mb-1 block text-xs font-medium text-zinc-400">Acabamento dos cantos</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" name="printCornerStyle" value={cornerStyle} onChange={(event) => setCornerStyle(event.target.value as PrintCornerStyle)}><option value="sharp">Pontas / cantos retos</option><option value="rounded">Cantos arredondados</option></select></label> : <input name="printCornerStyle" type="hidden" value="sharp" />}
        {shape !== "circle" && cornerStyle === "rounded" ? <GeometryInput defaultValue={defaults?.cornerRadiusMm ?? 2} label="Raio do canto (mm)" name="printCornerRadiusMm" /> : <input name="printCornerRadiusMm" type="hidden" value="0" />}
        {polygon ? <GeometryInput defaultValue={defaults?.rotationDegrees ?? 0} label="Orientação (graus)" min="-180" name="printShapeRotationDegrees" /> : <input name="printShapeRotationDegrees" type="hidden" value="0" />}
        <GeometryInput defaultValue={defaults?.bleedMm ?? 2} label="Sangria externa (mm)" min="0" name="printBleedMm" />
        <GeometryInput defaultValue={defaults?.safeMarginMm ?? 2} label="Margem interna de segurança (mm)" min="0" name="printSafeMarginMm" />
      </div>
      <div className="mt-3 grid gap-1 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] leading-5 text-zinc-500"><span><strong className="text-amber-300">Sangria:</strong> área impressa além da linha de corte.</span><span><strong className="text-cyan-300">Margem segura:</strong> distância entre o corte e textos ou elementos importantes.</span></div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-300"><input className="h-4 w-4 accent-cyan-400" defaultChecked={defaults?.allowPrintRotation ?? true} name="allowPrintRotation" type="checkbox" />Permitir girar 90° na folha para economizar espaço</label>
    </div>
  );
}

function GeometryInput({ defaultValue, label, min = "5", name, required = false }: { defaultValue: string | number | null; label: string; min?: string; name: string; required?: boolean }) {
  return <label><span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span><input className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" defaultValue={defaultValue ?? ""} min={min} name={name} required={required} step="0.1" type="number" /></label>;
}
