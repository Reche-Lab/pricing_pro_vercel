"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Info, Loader2, RotateCw, ZoomIn, X } from "lucide-react";
import { calculatePrintGuideDimensions, createShapePath, type PrintGeometry, type PrintMargins } from "@/domain/artwork/geometry";
import { defaultMockup, mockupSourcePoint, type ProductMockup } from "@/domain/commerce/artwork-options";
import type { ArtworkFrame } from "@/domain/artwork/framing";
import { drawArtworkFrame } from "@/components/quotes/artwork-frame-canvas";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => resolve(img); img.onerror = () => reject(new Error("Não foi possível carregar uma camada do modelo. Confira as imagens e as permissões de leitura.")); img.src = url;
  });
}

export async function drawProductMockup(canvas: HTMLCanvasElement, sourceUrl: string, geometry: PrintGeometry, margins: PrintMargins, model: ProductMockup, side: "front" | "back", frame?: ArtworkFrame, highResolution = false) {
  const face = model[side];
  const loaded = await loadImage(sourceUrl);
  const base = await loadImage(face.baseUrl), mask = await loadImage(face.maskUrl), overlay = geometry.shape === "circle" && side === "front" ? null : await loadImage(face.overlayUrl);
  if (!loaded) throw new Error("Enquadre a arte para visualizar o produto.");
  let source: HTMLImageElement | HTMLCanvasElement = loaded;
  if (frame) {
    const framed = document.createElement("canvas");
    const dimensions = calculatePrintGuideDimensions({ safeWidthMm: geometry.widthMm, safeHeightMm: geometry.heightMm, sangriaIncrementMm: margins.safeMarginMm, cutIncrementMm: margins.bleedMm });
    framed.width = 640; framed.height = Math.max(1, Math.round(640 * dimensions.cutHeightMm / dimensions.cutWidthMm));
    const framedContext = framed.getContext("2d")!; framedContext.fillStyle = "white"; framedContext.fillRect(0, 0, framed.width, framed.height);
    drawArtworkFrame(framedContext, loaded, loaded.width, loaded.height, framed.width, framed.height, frame); source = framed;
  }
  const aspect = base ? base.width / base.height : geometry.widthMm / geometry.heightMm;
  const resolution = highResolution ? 640 : frame ? 256 : 640;
  canvas.width = Math.round(resolution * Math.min(1, aspect)); canvas.height = Math.round(resolution / Math.max(1, aspect));
  const context = canvas.getContext("2d")!; context.clearRect(0, 0, canvas.width, canvas.height);
  // Front photo highlights create a white rim. The artwork itself defines the front edge.
  if (base && (side === "back" || geometry.shape !== "circle")) context.drawImage(base, 0, 0, canvas.width, canvas.height);
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
  if (overlay) {
    context.save();
    if (geometry.shape === "circle" && side === "back") {
      context.beginPath();
      context.ellipse(x + width / 2, y + height / 2, width * model.backOpeningRatio / 2, height * model.backOpeningRatio / 2, 0, 0, Math.PI * 2);
      context.clip();
    }
    context.drawImage(overlay, 0, 0, canvas.width, canvas.height); context.restore();
  }
}

export function StoreProductMockup({ sourceUrl, geometry, margins, model, name, frame, fixedSide, compact = false, expandable = false }: { sourceUrl: string; geometry: PrintGeometry; margins: PrintMargins; model?: ProductMockup; name: string; frame?: ArtworkFrame; fixedSide?: "front" | "back"; compact?: boolean; expandable?: boolean }) {
  const disclaimerId = useId();
  const [side, setSide] = useState<"front" | "back">("front");
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLElement>(null);
  const zoomButton = useRef<HTMLButtonElement>(null);
  // Closing the portal recreates the inline trigger, so focus must use its current node.
  const restoreFocus = useCallback((previous: HTMLElement | null) => { (zoomButton.current ?? previous)?.focus(); }, []);
  const zoomLabel = expanded ? "Fechar ampliação" : compact ? `Ampliar ${fixedSide === "back" ? "verso" : "frente"} do produto` : "Ampliar produto";
  useEffect(() => {
    let active = true; setBusy(true); setError("");
    const output = document.createElement("canvas");
    const timer = window.setTimeout(() => { void drawProductMockup(output, sourceUrl, geometry, margins, model ?? defaultMockup(), fixedSide ?? side, frame, expanded).then(() => {
      if (!active || !canvas.current) return;
      canvas.current.width = output.width; canvas.current.height = output.height;
      canvas.current.getContext("2d")!.drawImage(output, 0, 0);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); }); }, frame ? 90 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [sourceUrl, geometry, margins, model, side, expanded, frame, fixedSide]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; root.current?.focus();
    return () => { document.body.style.overflow = overflow; restoreFocus(previous); };
  }, [expanded, restoreFocus]);
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
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="inline-flex items-center gap-2 text-sm">{compact ? fixedSide === "back" ? "Verso" : "Frente" : <><Eye size={16} />{model ? "Produto acabado" : "Prévia geométrica"}</>}</strong>
      {!compact || expandable ? <div className="flex items-center gap-2">{fixedSide ? !compact ? <span className="text-xs font-semibold">{fixedSide === "front" ? "Frente" : "Verso"}</span> : null : <div className="inline-flex rounded-md border border-current/25 p-1" role="group" aria-label="Face do produto">{(["front", "back"] as const).map(value => <button type="button" key={value} aria-pressed={side === value} onClick={() => setSide(value)} title={value === "front" ? "Visualizar frente" : "Visualizar verso e faixa dobrada"} className={`min-h-9 rounded px-3 text-xs ${side === value ? "bg-emerald-500 text-zinc-950" : "hover:bg-current/10"}`}>{value === "front" ? "Frente" : "Verso"}</button>)}</div>}<button ref={zoomButton} type="button" title={zoomLabel} aria-label={zoomLabel} onClick={() => setExpanded(!expanded)} className="grid h-10 w-10 place-items-center rounded-md border border-current/25">{expanded ? <X size={18} /> : <ZoomIn size={18} />}</button></div> : null}</div>
    <div className="relative mx-auto mt-3 grid w-full max-w-xl min-w-0 place-items-center overflow-hidden rounded-lg bg-zinc-500/10" style={{ aspectRatio: "1" }}>
      <canvas ref={canvas} aria-describedby={compact && !expanded ? undefined : disclaimerId} aria-label={`${name}: ${(fixedSide ?? side) === "front" ? "frente" : "verso"} com a arte enquadrada`} className="max-h-full max-w-full object-contain" />
      {busy ? <Loader2 className="absolute animate-spin" size={22} /> : null}
      {error ? <p role="alert" className="absolute inset-x-3 rounded-md bg-zinc-950 p-3 text-sm text-rose-200">{error}<button title="Alternar face" type="button" onClick={() => setSide(side === "front" ? "back" : "front")}><RotateCw size={16} /></button></p> : null}
    </div>
    {!compact || expanded ? <><p id={disclaimerId} className="mt-3 flex items-start gap-2 text-xs leading-5"><Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" /><span><strong className="font-semibold">Imagem meramente ilustrativa.</strong> Cores, acabamento e curvatura podem variar no produto final, principalmente na parte traseira e no modelo do fecho.</span></p>
    <p className="mt-2 text-xs leading-5 opacity-70">{!model ? "Visualização esquemática, sem foto do acabamento. " : ""}{geometry.shape !== "circle" ? "Este formato usa uma projeção plana por máscara, sem simular a dobra física." : (fixedSide ?? side) === "back" ? "A faixa externa da arte dobra para o verso; o acabamento deve cobrir a região central." : "Textos e detalhes importantes devem permanecer na área de segurança."}</p></> : null}
  </section>;
  return expanded ? createPortal(content, document.body) : content;
}
