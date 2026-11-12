"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useRef, useState } from "react";
import { ImagePlus, Loader2, Maximize2, RotateCcw, Shrink, Trash2, Upload } from "lucide-react";
import type { PrintGeometry, PrintMargins } from "@/domain/artwork/geometry";
import { studioImageDpi, studioImageFitScale, type StudioBackgroundImage } from "@/domain/commerce/studio-background";
import { readStudioBackground } from "./studio-image";
import styles from "./studio.module.css";

export function StudioImageControls({ image, geometry, margins, onChange, onBusyChange }: { image?: StudioBackgroundImage; geometry: PrintGeometry; margins: PrintMargins; onChange: (image?: StudioBackgroundImage) => void; onBusyChange: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null), working = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file || working.current) return;
    working.current = true; setBusy(true); onBusyChange(true); setError("");
    try { const asset = await readStudioBackground(file); onChange({ asset, scale: 1, offsetX: 0, offsetY: 0, fillColor: image?.fillColor ?? "#ffffff" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir a imagem."); }
    finally { working.current = false; setBusy(false); onBusyChange(false); }
  }
  const dpi = image ? studioImageDpi(image.asset, image.scale, geometry, margins) : null;
  return <div className={styles.imageControls}>
    <input ref={input} hidden type="file" aria-label="Enviar imagem de fundo" accept="image/png,image/jpeg,image/webp" disabled={busy}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }}/>
    <div className={styles.imageUploadRow}>
      {image ? <img src={image.asset.dataUrl} alt="Imagem de fundo escolhida" width={88} height={66}/> : <span className={styles.emptyImage}><ImagePlus size={24}/></span>}
      <div><button type="button" className={styles.secondary} disabled={busy} onClick={() => input.current?.click()} title="PNG, JPEG ou WebP de até 3 MB e 25 megapixels">{busy ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>} {busy ? "Abrindo imagem…" : image ? "Substituir imagem" : "Enviar imagem"}</button>
        {image ? <small title={image.asset.fileName}>{image.asset.fileName}</small> : <small>PNG, JPEG ou WebP · até 3 MB</small>}</div>
      {image ? <button type="button" className={styles.imageIcon} aria-label="Remover imagem de fundo" title="Remover a imagem; suas cores e seu texto serão mantidos" onClick={() => { onChange(undefined); setError(""); }}><Trash2 size={16}/></button> : null}
    </div>
    {image ? <>
      <div className={styles.imageCommands}><button type="button" title="Mostrar a imagem inteira sem cortar suas laterais" onClick={() => onChange({ ...image, scale: studioImageFitScale(image.asset, geometry, margins), offsetX: 0, offsetY: 0 })}><Shrink size={15}/>Encaixar inteira</button><button type="button" title="Cobrir toda a área de corte, centralizando a imagem" onClick={() => onChange({ ...image, scale: 1, offsetX: 0, offsetY: 0 })}><Maximize2 size={15}/>Preencher</button><button type="button" className={styles.imageIcon} aria-label="Centralizar imagem de fundo" title="Centralizar sem alterar o tamanho escolhido" onClick={() => onChange({ ...image, offsetX: 0, offsetY: 0 })}><RotateCcw size={15}/></button></div>
      {([ ["scale", "Tamanho da imagem", .1, 3], ["offsetX", "Deslocamento horizontal", -1, 1], ["offsetY", "Deslocamento vertical", -1, 1] ] as const).map(([key, label, min, max]) => <label className={styles.imageSlider} key={key}><span>{label}<output>{Math.round(image[key] * 100)}%</output></span><input type="range" min={key === "scale" ? Math.min(min, studioImageFitScale(image.asset, geometry, margins)) : min} max={max} step={.01} aria-label={label} value={image[key]} onChange={event => onChange({ ...image, [key]: Number(event.target.value) })}/></label>)}
      <label className={styles.imageFill}><span>Cor nas áreas descobertas</span><input type="color" value={image.fillColor} aria-label="Cor nas áreas descobertas" onChange={event => onChange({ ...image, fillColor: event.target.value })}/></label>
      {dpi !== null && dpi < 200 ? <p className={styles.imageQuality} role="status">Esta imagem terá cerca de {Math.round(dpi)} dpi no tamanho escolhido e pode perder nitidez na impressão. Confira os detalhes antes de aprovar.</p> : null}
    </> : null}
    {error ? <p role="alert" className={styles.demoError}>{error}</p> : null}
  </div>;
}
