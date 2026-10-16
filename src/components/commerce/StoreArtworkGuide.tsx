"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, Download, Ruler } from "lucide-react";
import type { PrintGeometry, PrintMargins } from "@/domain/artwork/geometry";
import { ARTWORK_GUIDE_MARKS, createArtworkGuideSvg } from "@/domain/artwork/guide-svg";
import styles from "./store.module.css";

export function StoreArtworkGuide({ productName, geometry, margins }: {
  productName: string;
  geometry: PrintGeometry | null;
  margins: PrintMargins;
}) {
  const [dashed, setDashed] = useState(false);
  const guide = useMemo(() => {
    if (!geometry) return null;
    try { return createArtworkGuideSvg({ productName, geometry, margins, dashed }); }
    catch { return null; }
  }, [productName, geometry, margins, dashed]);
  if (!guide) return null;
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(guide.svg)}`;
  return (
    <section className={styles.artworkGuide} aria-label="Guia de medidas da arte">
      <div className={styles.artworkGuideHeader}>
        <div><h2><Ruler size={18} aria-hidden="true" />Guia da arte</h2><p>Medidas deste produto · escala 1:1</p></div>
        <a className={styles.secondary} href={href} download={guide.fileName} title="Baixar guia vetorial com as medidas reais do produto, em milímetros">
          <Download size={16} aria-hidden="true" />Baixar guia SVG
        </a>
      </div>
      <details className={styles.artworkGuideDetails}>
        <summary>Ver marcações e medidas<ChevronDown size={15} aria-hidden="true" /></summary>
        <label className={styles.artworkGuideLineStyle} title="Aplicar tracejado à prévia e ao SVG baixado; as medidas permanecem iguais">
          <input type="checkbox" checked={dashed} onChange={event => setDashed(event.target.checked)} />Linhas tracejadas
        </label>
        <div className={styles.artworkGuideContent}>
          <svg viewBox={`-1 -1 ${guide.dimensions.cutWidthMm + 2} ${guide.dimensions.cutHeightMm + 2}`} width={160} height={160}
            shapeRendering="geometricPrecision" role="img" aria-label={`Guia de segurança, imagem/sangria e corte de ${productName}`}>
            {[...ARTWORK_GUIDE_MARKS].reverse().map(mark => <path key={mark.key} d={guide.layout[mark.key].path}
              transform={`translate(${guide.layout[mark.key].x} ${guide.layout[mark.key].y})`}
              fill="none" stroke={mark.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={dashed && mark.dash ? mark.dash : undefined} />)}
          </svg>
          <dl>
            {ARTWORK_GUIDE_MARKS.map(mark => <div key={mark.key}>
              <dt><span className={styles.guideSwatch} style={{ borderColor: mark.color, borderTopStyle: dashed && mark.dash ? "dashed" : "solid" }} />{mark.label}</dt>
              <dd>{guide.sizes[mark.key]}</dd>
            </div>)}
          </dl>
        </div>
        <p className={styles.artworkGuideHint}>Mantenha textos e detalhes importantes dentro da segurança. A imagem fica visível até a sangria; continue o fundo até o corte externo.</p>
        <p className={styles.artworkGuideHint}>Importe o SVG em tamanho real (100%) e oculte as marcações antes de exportar sua arte final.</p>
      </details>
    </section>
  );
}
