"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Info, Loader2, RotateCw, ZoomIn, X } from "lucide-react";
import { calculatePrintGuideDimensions, createShapePath, type PrintGeometry, type PrintMargins } from "@/domain/artwork/geometry";
import { defaultMockup, mockupSourcePoint, type ProductMockup } from "@/domain/commerce/artwork-options";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => resolve(img); img.onerror = () => reject(new Error("Não foi possível carregar uma camada do modelo. Confira as imagens e as permissões de leitura.")); img.src = url;
  });
}

export async function drawProductMockup(canvas: HTMLCanvasElement, sourceUrl: string, geometry: PrintGeometry, margins: PrintMargins, model: ProductMockup, side: "front" | "back") {
  const face = model[side];
  const source = await loadImage(sourceUrl);
  const base = await loadImage(face.baseUrl), mask = await loadImage(face.maskUrl), overlay = await loadImage(face.overlayUrl);
  if (!source) throw new Error("Enquadre a arte para visualizar o produto.");
  const aspect = base ? base.width / base.height : geometry.widthMm / geometry.heightMm;
  canvas.width = Math.round(640 * Math.min(1, aspect)); canvas.height = Math.round(640 / Math.max(1, aspect));
  const context = canvas.getContext("2d")!; context.clearRect(0, 0, canvas.width, canvas.height);
  if (base) context.drawImage(base, 0, 0, canvas.width, canvas.height);
  const layer = document.createElement("canvas"); layer.width = canvas.width; layer.height = canvas.height;
  const ctx = layer.getContext("2d")!;
  const width = Math.round(canvas.width * face.width), height = Math.round(canvas.height * face.height);
  const x = canvas.width * face.x, y = canvas.height * face.y;
  const dimensions = calculatePrintGuideDimensions({ safeWidthMm: geometry.widthMm, safeHeightMm: geometry.heightMm, sangriaIncrementMm: margins.safeMarginMm, cutIncrementMm: margins.bleedMm });
  const visible = dimensions.sangriaWidthMm / dimensions.cutWidthMm;
  if (geometry.shape === "circle") {
    const sample = document.createElement("canvas"); sample.width = 1024; sample.height = 1024;
    const sampleCtx = sample.getContext("2d")!; sampleCtx.drawImage(source, 0, 0, 1024, 1024);
    const pixels = sampleCtx.getImageData(0, 0, 1024, 1024).data;
    const image = ctx.createImageData(width, height);
    for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
      const point = mockupSourcePoint((i + 0.5) / width * 2 - 1, (j + 0.5) / height * 2 - 1, side, visible, model);
      if (!point) continue;
      const sx = Math.max(0, Math.min(1023, point.x * 1023)), sy = Math.max(0, Math.min(1023, point.y * 1023));
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      for (let c = 0; c < 4; c++) {
        const at = (xx: number, yy: number) => pixels[(Math.min(1023, yy) * 1024 + Math.min(1023, xx)) * 4 + c];
        image.data[(j * width + i) * 4 + c] = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
      }
    }
    const warped = document.createElement("canvas"); warped.width = width; warped.height = height; warped.getContext("2d")!.putImageData(image, 0, 0);
    ctx.drawImage(warped, x, y);
  } else {
    ctx.save(); ctx.translate(x, y);
    ctx.clip(new Path2D(createShapePath({ shape: geometry.shape, width, height, cornerRadius: geometry.cornerRadiusMm / geometry.widthMm * width, rotationDegrees: geometry.rotationDegrees })));
    const cropX = source.width * margins.bleedMm / dimensions.cutWidthMm;
    const cropY = source.height * margins.bleedMm / dimensions.cutHeightMm;
    if (side === "front" || mask) {
      if (side === "back") { ctx.translate(width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(source, cropX, cropY, source.width - cropX * 2, source.height - cropY * 2, 0, 0, width, height);
    }
    ctx.restore();
  }
  if (mask) {
    ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(mask, 0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = "source-over";
  }
  context.drawImage(layer, 0, 0);
  if (overlay) context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
}

export function StoreProductMockup({ sourceUrl, geometry, margins, model, name }: { sourceUrl: string; geometry: PrintGeometry; margins: PrintMargins; model?: ProductMockup; name: string }) {
  const disclaimerId = useId();
  const [side, setSide] = useState<"front" | "back">("front");
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true; setBusy(true); setError("");
    const output = document.createElement("canvas");
    void drawProductMockup(output, sourceUrl, geometry, margins, model ?? defaultMockup(), side).then(() => {
      if (!active || !canvas.current) return;
      canvas.current.width = output.width; canvas.current.height = output.height;
      canvas.current.getContext("2d")!.drawImage(output, 0, 0);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [sourceUrl, geometry, margins, model, side, expanded]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; root.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [expanded]);
  const content = <section ref={root} tabIndex={expanded ? -1 : undefined} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined}
    onKeyDown={e => {
      if (!expanded) return;
      if (e.key === "Escape") { e.stopPropagation(); setExpanded(false); }
      if (e.key === "Tab") {
        const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }} className={expanded ? "fixed inset-0 z-[150] flex flex-col overflow-auto bg-zinc-950 p-4 text-white outline-none sm:p-8" : "min-w-0 rounded-lg border border-current/15 p-3"} aria-label={`Prévia do produto ${name}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="inline-flex items-center gap-2 text-sm"><Eye size={16} />{model ? "Produto acabado" : "Prévia geométrica"}</strong>
      <div className="flex items-center gap-2"><div className="inline-flex rounded-md border border-current/25 p-1" role="group" aria-label="Face do produto">{(["front", "back"] as const).map(value => <button type="button" key={value} aria-pressed={side === value} onClick={() => setSide(value)} title={value === "front" ? "Visualizar frente" : "Visualizar verso e faixa dobrada"} className={`min-h-9 rounded px-3 text-xs ${side === value ? "bg-emerald-500 text-zinc-950" : "hover:bg-current/10"}`}>{value === "front" ? "Frente" : "Verso"}</button>)}</div><button type="button" title={expanded ? "Fechar ampliação" : "Ampliar produto"} aria-label={expanded ? "Fechar ampliação" : "Ampliar produto"} onClick={() => setExpanded(!expanded)} className="grid h-10 w-10 place-items-center rounded-md border border-current/25">{expanded ? <X size={18} /> : <ZoomIn size={18} />}</button></div></div>
    <div className="relative mx-auto mt-3 grid w-full max-w-xl min-w-0 place-items-center overflow-hidden rounded-lg bg-zinc-500/10" style={{ aspectRatio: "1" }}>
      <canvas ref={canvas} aria-describedby={disclaimerId} aria-label={`${name}: ${side === "front" ? "frente" : "verso"} com a arte enquadrada`} className="max-h-full max-w-full object-contain" />
      {busy ? <Loader2 className="absolute animate-spin" size={22} /> : null}
      {error ? <p role="alert" className="absolute inset-x-3 rounded-md bg-zinc-950 p-3 text-sm text-rose-200">{error}<button title="Alternar face" type="button" onClick={() => setSide(side === "front" ? "back" : "front")}><RotateCw size={16} /></button></p> : null}
    </div>
    <p id={disclaimerId} className="mt-3 flex items-start gap-2 text-xs leading-5"><Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" /><span><strong className="font-semibold">Imagem meramente ilustrativa.</strong> Cores, acabamento e curvatura podem variar no produto final, principalmente na parte traseira e no modelo do fecho.</span></p>
    <p className="mt-2 text-xs leading-5 opacity-70">{!model ? "Visualização esquemática, sem foto do acabamento. " : ""}{geometry.shape !== "circle" ? "Este formato usa uma projeção plana por máscara, sem simular a dobra física." : side === "back" ? "A faixa externa da arte dobra para o verso; o acabamento deve cobrir a região central." : "Textos e detalhes importantes devem permanecer na área de segurança."}</p>
  </section>;
  return expanded ? createPortal(content, document.body) : content;
}
