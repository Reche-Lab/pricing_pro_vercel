"use client";
import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Paintbrush } from "lucide-react";
import type { StoreProduct } from "./StoreHome";
import { StoreProductMockup } from "./StoreProductMockup";
import styles from "./studio.module.css";

const colors = [{ name: "Verde", background: "#226d5c", ink: "#ffffff" }, { name: "Coral", background: "#a52e48", ink: "#ffffff" }, { name: "Amarelo", background: "#f2cc59", ink: "#242b25" }];
const frame = { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 };
export function StudioPersonalizer({ products, base }: { products: StoreProduct[]; base: string }) {
  const id = useId();
  const [selected, setSelected] = useState(products[0]?.id), [text, setText] = useState("Sua ideia"), [color, setColor] = useState(0), [source, setSource] = useState("");
  const product = products.find(item => item.id === selected) ?? products[0];
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 640;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = colors[color].background; ctx.fillRect(0, 0, 640, 640);
      ctx.strokeStyle = colors[color].ink; ctx.lineWidth = 2; ctx.globalAlpha = .18;
      for (let i = -640; i < 1280; i += 48) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 640, 640); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = colors[color].ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      let size = 78; const label = text.trim() || "Sua ideia"; ctx.font = `700 ${size}px sans-serif`;
      while (ctx.measureText(label).width > 390 && size > 20) { size -= 2; ctx.font = `700 ${size}px sans-serif`; }
      ctx.fillText(label, 320, 320); setSource(canvas.toDataURL("image/png"));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [text, color]);
  if (!product?.geometry || !product.artworkOptions?.mockup) return null;
  return <div className={styles.demoInner}>
    <div className={styles.demoCopy}><p className={styles.eyebrow}><Paintbrush size={15}/>Uma ideia, muitas possibilidades</p><h2>Imagine o seu próximo produto.</h2><p>Experimente uma mensagem e descubra a frente e o verso. No produto, você poderá enviar e ajustar sua própria arte.</p>
      <div className={styles.demoControls}><label htmlFor={`${id}-product`}>Produto<select id={`${id}-product`} value={product.id} onChange={event => setSelected(event.target.value)}>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label htmlFor={`${id}-message`}>Sua mensagem<input id={`${id}-message`} value={text} maxLength={28} onChange={event => setText(event.target.value)}/></label><fieldset className={styles.swatches}><legend>Cor da arte</legend>{colors.map((item, index) => <button type="button" key={item.name} aria-label={`Cor ${item.name.toLowerCase()}`} title={item.name} aria-pressed={color === index} onClick={() => setColor(index)} style={{ background: item.background, color: item.ink }}>{color === index ? <Check size={17} className="mx-auto"/> : null}</button>)}</fieldset></div>
      <Link className={styles.primary} href={`${base}/produto/${product.id}`}>Personalizar este produto<ArrowRight size={17}/></Link>
    </div>
    <div className={styles.demoPreview}>{source ? <StoreProductMockup sourceUrl={source} geometry={product.geometry} margins={product.margins} model={product.artworkOptions.mockup} name={product.name} frame={frame}/> : <p className={styles.demoStatus} role="status">Preparando sua prévia…</p>}</div>
  </div>;
}
