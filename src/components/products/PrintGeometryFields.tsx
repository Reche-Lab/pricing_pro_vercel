"use client";

import React, { useState } from "react";
import { calculatePrintGuideDimensions, type PrintCornerStyle, type PrintShape } from "@/domain/artwork/geometry";

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
  const defaultSangriaIncrement = numeric(defaults?.safeMarginMm) ?? 2;
  const defaultVisibleWidth = numeric(defaults?.widthMm);
  const defaultVisibleHeight = numeric(defaults?.heightMm) ?? defaultVisibleWidth;
  const [safeWidth, setSafeWidth] = useState(valueText(defaultVisibleWidth === null ? null : Math.max(0, defaultVisibleWidth - defaultSangriaIncrement * 2)));
  const [safeHeight, setSafeHeight] = useState(valueText(defaultVisibleHeight === null ? null : Math.max(0, defaultVisibleHeight - defaultSangriaIncrement * 2)));
  const [sangriaIncrement, setSangriaIncrement] = useState(valueText(defaultSangriaIncrement));
  const [cutIncrement, setCutIncrement] = useState(valueText(numeric(defaults?.bleedMm) ?? 2));
  const oneDimension = shape === "circle" || shape === "square";
  const polygon = shape === "triangle" || shape === "hexagon";
  const values = [numeric(safeWidth), numeric(oneDimension ? safeWidth : safeHeight), numeric(sangriaIncrement), numeric(cutIncrement)];
  const dimensions = values.every((value) => value !== null)
    ? calculatePrintGuideDimensions({ safeWidthMm: values[0]!, safeHeightMm: values[1]!, sangriaIncrementMm: values[2]!, cutIncrementMm: values[3]! })
    : null;

  return (
    <div className="mt-4 rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-4">
      <p className="text-sm font-medium text-cyan-100">Geometria de impressão e corte</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">Informe somente a Segurança como tamanho absoluto. Sangria e Corte são acréscimos por lado em relação à linha imediatamente anterior.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className="mb-1 block text-xs font-medium text-zinc-400">Formato</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" name="printShape" value={shape} onChange={(event) => setShape(event.target.value as PrintShape)}>{shapeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {shape !== "circle" ? <label><span className="mb-1 block text-xs font-medium text-zinc-400">Acabamento dos cantos</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" name="printCornerStyle" value={cornerStyle} onChange={(event) => setCornerStyle(event.target.value as PrintCornerStyle)}><option value="sharp">Pontas / cantos retos</option><option value="rounded">Cantos arredondados</option></select></label> : <input name="printCornerStyle" type="hidden" value="sharp" />}
        {shape !== "circle" && cornerStyle === "rounded" ? <GeometryInput defaultValue={defaults?.cornerRadiusMm ?? 2} label="Raio do canto (mm)" name="printCornerRadiusMm" /> : <input name="printCornerRadiusMm" type="hidden" value="0" />}
        {polygon ? <GeometryInput defaultValue={defaults?.rotationDegrees ?? 0} label="Orientação (graus)" min="-180" name="printShapeRotationDegrees" /> : <input name="printShapeRotationDegrees" type="hidden" value="0" />}
      </div>
      <div className="mt-4 grid gap-3 rounded-md border border-zinc-800 bg-zinc-950/45 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <GuideNumberInput hint={dimensions ? `Valor absoluto: ${formatMmValue(dimensions.safeWidthMm)} mm` : "Esta é a única medida absoluta."} label={shape === "circle" ? "Segurança · diâmetro absoluto" : oneDimension ? "Segurança · lado absoluto" : "Segurança · largura absoluta"} min="1" value={safeWidth} onChange={setSafeWidth} />
        {!oneDimension ? <GuideNumberInput hint={dimensions ? `Valor absoluto: ${formatMmValue(dimensions.safeHeightMm)} mm` : "Esta é a única medida absoluta."} label="Segurança · altura absoluta" min="1" value={safeHeight} onChange={setSafeHeight} /> : null}
        <GuideNumberInput hint={dimensions ? `Valor absoluto calculado: ${sizeLabel(dimensions.sangriaWidthMm, dimensions.sangriaHeightMm, oneDimension)}` : "Somente a diferença para a Segurança."} label="Sangria · acréscimo por lado" min="0" value={sangriaIncrement} onChange={setSangriaIncrement} />
        <GuideNumberInput hint={dimensions ? `Valor absoluto calculado: ${sizeLabel(dimensions.cutWidthMm, dimensions.cutHeightMm, oneDimension)}` : "Somente a diferença para a Sangria."} label="Corte · acréscimo por lado" min="0" value={cutIncrement} onChange={setCutIncrement} />
      </div>
      <input name="printWidthMm" type="hidden" value={dimensions ? dimensions.sangriaWidthMm : ""} />
      <input name="printHeightMm" type="hidden" value={dimensions ? dimensions.sangriaHeightMm : ""} />
      <input name="printSafeMarginMm" type="hidden" value={dimensions ? dimensions.sangriaIncrementMm : ""} />
      <input name="printBleedMm" type="hidden" value={dimensions ? dimensions.cutIncrementMm : ""} />
      <div className="mt-3 grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-[11px] leading-5 text-zinc-500 sm:grid-cols-3">
        <GuideSummary color="cyan" label="Segurança" value={dimensions ? sizeLabel(dimensions.safeWidthMm, dimensions.safeHeightMm, oneDimension) : "Informe a medida absoluta"}>Elementos importantes ficam dentro dela.</GuideSummary>
        <GuideSummary color="amber" label="Sangria" value={dimensions ? sizeLabel(dimensions.sangriaWidthMm, dimensions.sangriaHeightMm, oneDimension) : "Calculada automaticamente"}>Segurança + acréscimo em cada lado. Limite visível.</GuideSummary>
        <GuideSummary color="rose" label="Corte" value={dimensions ? sizeLabel(dimensions.cutWidthMm, dimensions.cutHeightMm, oneDimension) : "Calculado automaticamente"}>Sangria + acréscimo em cada lado. Continue o fundo até aqui.</GuideSummary>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-300"><input className="h-4 w-4 accent-cyan-400" defaultChecked={defaults?.allowPrintRotation ?? true} name="allowPrintRotation" type="checkbox" />Permitir girar 90° na folha para economizar espaço</label>
    </div>
  );
}

function GuideNumberInput({ hint, label, min, value, onChange }: { hint: string; label: string; min: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="mb-1 block text-xs font-medium text-zinc-300">{label} (mm)</span><input className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" inputMode="decimal" min={min} required step="0.1" type="number" value={value} onChange={(event) => onChange(event.target.value)} /><span className="mt-1 block text-[10px] text-zinc-500">{hint}</span></label>;
}

function GuideSummary({ color, label, value, children }: { color: "cyan" | "amber" | "rose"; label: string; value: string; children: React.ReactNode }) {
  const style = color === "cyan" ? "text-cyan-300" : color === "amber" ? "text-amber-300" : "text-rose-300";
  return <div><strong className={`block text-xs ${style}`}>{label}: {value}</strong><span>{children}</span></div>;
}

function GeometryInput({ defaultValue, label, min = "5", name, required = false }: { defaultValue: string | number | null; label: string; min?: string; name: string; required?: boolean }) {
  return <label><span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span><input className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" defaultValue={defaultValue ?? ""} min={min} name={name} required={required} step="0.1" type="number" /></label>;
}

function numeric(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function valueText(value: number | null) { return value === null ? "" : String(Number(value.toFixed(2))); }
function sizeLabel(width: number, height: number, oneDimension: boolean) {
  return oneDimension ? `${formatMmValue(width)} mm` : `${formatMmValue(width)} × ${formatMmValue(height)} mm`;
}
function formatMmValue(value: number) { return Number(value.toFixed(2)).toLocaleString("pt-BR"); }
