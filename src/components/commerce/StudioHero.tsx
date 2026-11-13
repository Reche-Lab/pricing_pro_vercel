"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Paintbrush, Pause, Play, ScanLine } from "lucide-react";
import type { StoreSettings } from "@/domain/commerce/schemas";
import type { StoreProduct } from "./StoreHome";
import { storeMoney } from "./store-http";
import { useStudioMotion } from "./use-studio-motion";
import styles from "./studio.module.css";

export function StudioHero({ settings, products, base, preview = false, quoting = false, onOpenPreview }: { settings: StoreSettings; products: StoreProduct[]; base: string; preview?: boolean; quoting?: boolean; onOpenPreview?: () => void }) {
  const [selected, setSelected] = useState(products[0]?.id), [paused, setPaused] = useState(false);
  const product = products.find(product => product.id === selected) ?? products[0];
  const { ref, active } = useStudioMotion(settings.experience?.motion !== false && !paused);
  const photo = settings.experience?.backgroundUrl;
  return <section ref={ref} className={styles.hero} data-moving={active} data-photo={Boolean(photo)} aria-label={`Estúdio ${settings.name}`}>
    <img className={styles.backdrop} src={photo || "/studio/paper-v1.webp"} alt="" aria-hidden="true" fetchPriority="high" width={1600} height={670}/>
    <div className={styles.inner}>
      <div className={styles.copy}><p className={styles.eyebrow}><ScanLine size={15} aria-hidden="true"/>{products.some(product => product.personalized) ? "Sua ideia ganha forma" : "Escolhas com personalidade"}</p><h1>{settings.name}</h1><p className={styles.description}>{settings.description || "Pequenos detalhes. Novas possibilidades."}</p><div className={styles.actions}><Link className={styles.primary} href={`${base}/catalogo`}>{quoting ? "Produtos para meu orçamento" : "Explorar produtos"}<ArrowRight size={17}/></Link>{onOpenPreview ? <button type="button" className={`${styles.secondary} ${styles.studioCta}`} onClick={onOpenPreview}><Paintbrush size={17}/>Crie sua arte aqui<ArrowRight size={16}/></button> : null}</div>{!preview ? <Link href={`${base}/orcamento`} className={styles.quote}><FileText size={15}/>{quoting ? "Ver meu orçamento" : "Solicitar orçamento"}<ArrowRight size={14}/></Link> : null}</div>
      {product ? <div className={styles.productStage}><Link className={styles.productImage} href={`${base}/produto/${product.id}`} aria-label={`${product.personalized ? "Personalizar" : "Ver"} ${product.name}`}><span className={styles.productFloat} data-studio-float><img src={product.imageUrl} alt={product.name} width={440} height={440} fetchPriority="high"/></span></Link><div className={styles.productCaption}><span>{product.category}</span><strong>{product.name}</strong><small>{storeMoney(product.unitCents)} / un. em {product.minQuantity.toLocaleString("pt-BR")} un.</small></div></div> : null}
      <div className={styles.bottom}><span className={styles.materialNote}>{photo ? "Produtos do catálogo" : "Cenário ilustrativo · Produtos do catálogo"}</span><div className={styles.selectors} role="group" aria-label="Produtos em destaque">{products.slice(0, 4).map(item => <button key={item.id} type="button" aria-label={`Mostrar ${item.name}`} title={item.name} aria-pressed={product?.id === item.id} onClick={() => setSelected(item.id)}><img src={item.imageUrl} alt="" loading="lazy" width={40} height={40}/></button>)}</div>{settings.experience?.motion !== false ? <button type="button" className={styles.motionButton} aria-label={paused ? "Retomar movimento da vitrine" : "Pausar movimento da vitrine"} title={paused ? "Retomar movimento da vitrine" : "Pausar movimento da vitrine"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15}/> : <Pause size={15}/>}</button> : null}</div>
    </div>
  </section>;
}
