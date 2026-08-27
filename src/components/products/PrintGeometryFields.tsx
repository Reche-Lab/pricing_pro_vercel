"use client";

import React, { useState } from "react";
import type { PrintCornerStyle, PrintGuideDimensions, PrintShape } from "@/domain/artwork/geometry";

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
  const defaultSafeWidth = numeric(defaults?.widthMm);
  const defaultSafeHeight = numeric(defaults?.heightMm) ?? defaultSafeWidth;
  const defaultCutIncrement = numeric(defaults?.bleedMm) ?? 2;
  const [safeWidth, setSafeWidth] = useState(valueText(defaultSafeWidth));
  const [safeHeight, setSafeHeight] = useState(valueText(defaultSafeHeight));
  const [sangriaWidth, setSangriaWidth] = useState(valueText(addTotal(defaultSafeWidth, defaultSangriaIncrement)));
  const [sangriaHeight, setSangriaHeight] = useState(valueText(addTotal(defaultSafeHeight, defaultSangriaIncrement)));
  const [cutWidth, setCutWidth] = useState(valueText(addTotal(addTotal(defaultSafeWidth, defaultSangriaIncrement), defaultCutIncrement)));
  const [cutHeight, setCutHeight] = useState(valueText(addTotal(addTotal(defaultSafeHeight, defaultSangriaIncrement), defaultCutIncrement)));
  const oneDimension = shape === "circle" || shape === "square";
  const polygon = shape === "triangle" || shape === "hexagon";
  const calculation = calculateAbsoluteGuides({
    safeWidth, safeHeight: oneDimension ? safeWidth : safeHeight,
    sangriaWidth, sangriaHeight: oneDimension ? sangriaWidth : sangriaHeight,
    cutWidth, cutHeight: oneDimension ? cutWidth : cutHeight,
    oneDimension
  });
  const dimensions = calculation.dimensions;

  return (
    <div className="mt-4 rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-4">
      <p className="text-sm font-medium text-cyan-100">Geometria de impressão e corte</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">Informe o tamanho total de cada linha. O sistema calcula automaticamente a distância correspondente em cada lado.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className="mb-1 block text-xs font-medium text-zinc-400">Formato</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" name="printShape" value={shape} onChange={(event) => setShape(event.target.value as PrintShape)}>{shapeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {shape !== "circle" ? <label><span className="mb-1 block text-xs font-medium text-zinc-400">Acabamento dos cantos</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" name="printCornerStyle" value={cornerStyle} onChange={(event) => setCornerStyle(event.target.value as PrintCornerStyle)}><option value="sharp">Pontas / cantos retos</option><option value="rounded">Cantos arredondados</option></select></label> : <input name="printCornerStyle" type="hidden" value="sharp" />}
        {shape !== "circle" && cornerStyle === "rounded" ? <GeometryInput defaultValue={defaults?.cornerRadiusMm ?? 2} label="Raio do canto (mm)" name="printCornerRadiusMm" /> : <input name="printCornerRadiusMm" type="hidden" value="0" />}
        {polygon ? <GeometryInput defaultValue={defaults?.rotationDegrees ?? 0} label="Orientação (graus)" min="-180" name="printShapeRotationDegrees" /> : <input name="printShapeRotationDegrees" type="hidden" value="0" />}
      </div>
      <div className="mt-4 grid gap-4 rounded-md border border-zinc-800 bg-zinc-950/45 p-3 lg:grid-cols-3">
        <AbsoluteGuideFields color="cyan" label="Segurança" oneDimension={oneDimension} shape={shape} width={safeWidth} height={safeHeight} onWidthChange={setSafeWidth} onHeightChange={setSafeHeight} hint="Tamanho total da menor linha." />
        <AbsoluteGuideFields color="amber" label="Sangria" oneDimension={oneDimension} shape={shape} width={sangriaWidth} height={sangriaHeight} onWidthChange={setSangriaWidth} onHeightChange={setSangriaHeight} hint={dimensions ? `${formatMmValue(dimensions.sangriaIncrementMm)} mm por lado após a Segurança.` : "Deve ser igual ou maior que a Segurança."} />
        <AbsoluteGuideFields color="rose" label="Corte" oneDimension={oneDimension} shape={shape} width={cutWidth} height={cutHeight} onWidthChange={setCutWidth} onHeightChange={setCutHeight} hint={dimensions ? `${formatMmValue(dimensions.cutIncrementMm)} mm por lado após a Sangria.` : "Deve ser igual ou maior que a Sangria."} />
      </div>
      {calculation.error ? <p className="mt-2 rounded-md border border-red-900/60 bg-red-950/25 px-3 py-2 text-xs text-red-300">{calculation.error}</p> : null}
      <input name="printWidthMm" type="hidden" value={dimensions ? dimensions.safeWidthMm : ""} />
      <input name="printHeightMm" type="hidden" value={dimensions ? dimensions.safeHeightMm : ""} />
      <input name="printSafeMarginMm" type="hidden" value={dimensions ? dimensions.sangriaIncrementMm : ""} />
      <input name="printBleedMm" type="hidden" value={dimensions ? dimensions.cutIncrementMm : ""} />
      <div className="mt-3 grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-[11px] leading-5 text-zinc-500 sm:grid-cols-3">
        <GuideSummary color="cyan" label="Segurança" value={dimensions ? sizeLabel(dimensions.safeWidthMm, dimensions.safeHeightMm, oneDimension) : "Informe a medida absoluta"}>Elementos importantes ficam dentro dela.</GuideSummary>
        <GuideSummary color="amber" label="Sangria" value={dimensions ? sizeLabel(dimensions.sangriaWidthMm, dimensions.sangriaHeightMm, oneDimension) : "Informe a medida absoluta"}>Limite visível. Distância lateral calculada automaticamente.</GuideSummary>
        <GuideSummary color="rose" label="Corte" value={dimensions ? sizeLabel(dimensions.cutWidthMm, dimensions.cutHeightMm, oneDimension) : "Informe a medida absoluta"}>Continue o fundo até esta medida total.</GuideSummary>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-300"><input className="h-4 w-4 accent-cyan-400" defaultChecked={defaults?.allowPrintRotation ?? true} name="allowPrintRotation" type="checkbox" />Permitir girar 90° na folha para economizar espaço</label>
    </div>
  );
}

function AbsoluteGuideFields({ color, hint, label, oneDimension, shape, width, height, onWidthChange, onHeightChange }: { color: "cyan" | "amber" | "rose"; hint: string; label: string; oneDimension: boolean; shape: PrintShape; width: string; height: string; onWidthChange: (value: string) => void; onHeightChange: (value: string) => void }) {
  const heading = color === "cyan" ? "text-cyan-300" : color === "amber" ? "text-amber-300" : "text-rose-300";
  const dimension = shape === "circle" ? "Diâmetro total" : oneDimension ? "Lado total" : "Largura total";
  return <fieldset className="min-w-0 border-l-2 border-zinc-700 pl-3"><legend className={`mb-2 text-xs font-semibold ${heading}`}>{label}</legend><div className={`grid gap-2 ${oneDimension ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"}`}><AbsoluteInput guide={label} label={dimension} value={width} onChange={onWidthChange} />{!oneDimension ? <AbsoluteInput guide={label} label="Altura total" value={height} onChange={onHeightChange} /> : null}</div><p className="mt-1.5 text-[10px] leading-4 text-zinc-500">{hint}</p></fieldset>;
}

function AbsoluteInput({ guide, label, value, onChange }: { guide: string; label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="mb-1 block text-[11px] font-medium text-zinc-400">{label} (mm)</span><input aria-label={`${guide} · ${label} (mm)`} className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" inputMode="decimal" min="1" required step="0.1" type="number" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
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
function addTotal(value: number | null, perSide: number) { return value === null ? null : value + perSide * 2; }
function calculateAbsoluteGuides(input: { safeWidth: string; safeHeight: string; sangriaWidth: string; sangriaHeight: string; cutWidth: string; cutHeight: string; oneDimension: boolean }): { dimensions: PrintGuideDimensions | null; error: string | null } {
  const values = [input.safeWidth, input.safeHeight, input.sangriaWidth, input.sangriaHeight, input.cutWidth, input.cutHeight].map(numeric);
  if (values.some((value) => value === null)) return { dimensions: null, error: null };
  const [safeWidthMm, safeHeightMm, sangriaWidthMm, sangriaHeightMm, cutWidthMm, cutHeightMm] = values as number[];
  if (sangriaWidthMm < safeWidthMm || sangriaHeightMm < safeHeightMm) return { dimensions: null, error: "A Sangria precisa ser igual ou maior que a Segurança." };
  if (cutWidthMm < sangriaWidthMm || cutHeightMm < sangriaHeightMm) return { dimensions: null, error: "O Corte precisa ser igual ou maior que a Sangria." };
  const sangriaWidthIncrement = (sangriaWidthMm - safeWidthMm) / 2;
  const sangriaHeightIncrement = (sangriaHeightMm - safeHeightMm) / 2;
  const cutWidthIncrement = (cutWidthMm - sangriaWidthMm) / 2;
  const cutHeightIncrement = (cutHeightMm - sangriaHeightMm) / 2;
  if (!input.oneDimension && (!same(sangriaWidthIncrement, sangriaHeightIncrement) || !same(cutWidthIncrement, cutHeightIncrement))) {
    return { dimensions: null, error: "Em formatos com largura e altura, mantenha a mesma expansão em todos os lados." };
  }
  return { dimensions: { safeWidthMm, safeHeightMm, sangriaWidthMm, sangriaHeightMm, cutWidthMm, cutHeightMm, sangriaIncrementMm: sangriaWidthIncrement, cutIncrementMm: cutWidthIncrement }, error: null };
}
function same(left: number, right: number) { return Math.abs(left - right) < 0.001; }
function sizeLabel(width: number, height: number, oneDimension: boolean) {
  return oneDimension ? `${formatMmValue(width)} mm` : `${formatMmValue(width)} × ${formatMmValue(height)} mm`;
}
function formatMmValue(value: number) { return Number(value.toFixed(2)).toLocaleString("pt-BR"); }
