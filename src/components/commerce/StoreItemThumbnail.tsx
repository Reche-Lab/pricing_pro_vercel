"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { itemArtworkUrl, type StoreItemPreview } from "@/domain/commerce/item-preview";
import { defaultMockup } from "@/domain/commerce/artwork-options";
import { useCommercePreview } from "./CommercePreviewProvider";
import s from "./item-thumbnail.module.css";

export function StoreItemThumbnail({ name, preview, api, quoteId, size = 64 }: {
  name: string; preview: StoreItemPreview; api: string; quoteId?: string; size?: 48 | 64 | 80;
}) {
  const simulation = useCommercePreview();
  let temporary: ReturnType<NonNullable<typeof simulation>["getArtwork"]> | null = null;
  if (simulation && preview.artwork) { try { temporary = simulation.getArtwork(preview.artwork.id); } catch { /* Removed simulation artwork uses the product photo. */ } }
  const original = preview.artwork ? temporary?.source.dataUrl ?? (!simulation && api ? itemArtworkUrl(api, preview.artwork, false, quoteId) : "") : "";
  const prepared = preview.artwork?.approved ? temporary?.preparedUrl ?? (!simulation && api ? itemArtworkUrl(api, preview.artwork, true, quoteId) : "") : "";
  const revision = JSON.stringify([original, prepared, preview.imageUrl, preview.geometry, preview.margins, preview.model]);
  const [state, setState] = useState<{ revision: string; rendered: boolean; originalFailed: boolean; productFailed: boolean }>({ revision, rendered: false, originalFailed: false, productFailed: false });
  const [visible, setVisible] = useState(false), box = useRef<HTMLSpanElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const current = state.revision === revision ? state : { revision, rendered: false, originalFailed: false, productFailed: false };
  useEffect(() => {
    if (!box.current || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "120px" });
    observer.observe(box.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !prepared || !preview.geometry) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void import("./StoreProductMockup").then(async ({ drawProductMockup }) => {
        const output = document.createElement("canvas");
        await drawProductMockup(output, prepared, preview.geometry!, preview.margins, preview.model ?? defaultMockup(), "front", undefined, false, 160);
        if (!active || !canvas.current) return;
        canvas.current.width = output.width; canvas.current.height = output.height;
        canvas.current.getContext("2d")!.drawImage(output, 0, 0);
        setState(value => ({ ...(value.revision === revision ? value : { revision, originalFailed: false, productFailed: false }), rendered: true }));
      }).catch(() => { /* Keep the original artwork visible if the optional model fails. */ });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [visible, prepared, preview.geometry, preview.margins, preview.model, revision]);
  const source = original && !current.originalFailed ? original : !current.productFailed ? preview.imageUrl : "";
  const kind = current.rendered ? "Produto com arte aprovada" : source && source === original ? "Arte original" : "Imagem do produto";
  return <span ref={box} className={s.thumbnail} style={{ width: size, height: size }} title={`${kind} · ${name}`}>
    {source ? <img src={source} alt={`${kind}: ${name}`} width={size} height={size} loading="lazy" hidden={current.rendered} onError={() => setState(value => ({ ...(value.revision === revision ? value : { revision, rendered: false, originalFailed: false, productFailed: false }), ...(source === original ? { originalFailed: true } : { productFailed: true }) }))}/> : !current.rendered ? <ImageOff size={18} aria-label={`Imagem indisponível: ${name}`}/> : null}
    <canvas ref={canvas} hidden={!current.rendered} role="img" aria-label={`Produto com arte aprovada: ${name}`}/>
  </span>;
}
