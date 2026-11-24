"use client";
/* eslint-disable @next/next/no-img-element */
import React from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, Package, Plus } from "lucide-react";
import type { StoreProduct } from "./StoreHome";
import styles from "./store.module.css";
import q from "./quote.module.css";

export function StoreQuoteEmptyState({ products, base, identified, disabled, onChoose }: {
  products: StoreProduct[];
  base: string;
  identified: boolean;
  disabled: boolean;
  onChoose: (productId?: string) => void;
}) {
  // Show category variety first, then fill remaining positions with catalog products.
  const categories = new Set<string>();
  const featured = products.filter(product => {
    if (categories.has(product.category)) return false;
    categories.add(product.category);
    return true;
  }).slice(0, 4);
  for (const product of products) {
    if (featured.length >= 4) break;
    if (!featured.some(item => item.id === product.id)) featured.push(product);
  }

  return (
    <div className={q.emptyWorkspace}>
      <header className={q.emptyHeading}>
        <span className={q.emptyEyebrow}><FileText size={16} aria-hidden="true"/>Monte seu orçamento</span>
        <h1>{products.length ? "Sua próxima ideia começa aqui." : "Novas ideias estão a caminho."}</h1>
        <p>{products.length ? "Combine produtos e quantidades. Consulte os valores sem compromisso de compra." : "Os produtos desta loja ainda não estão disponíveis para orçamento."}</p>
      </header>

      {featured.length ? (
        <ul className={q.emptyProducts} aria-label="Sugestões para começar seu orçamento">
          {featured.map(product => (
            <li key={product.id}>
              <button type="button" className={q.emptyProduct} disabled={disabled} onClick={() => onChoose(product.id)} aria-label={`Orçar ${product.name}`}>
                <span className={q.emptyProductImage}>
                  {product.imageUrl ? <img src={product.imageUrl} alt="" width={160} height={160} loading="lazy"/> : <Package size={48} aria-hidden="true"/>}
                  <span className={q.emptyProductPlus}><Plus size={18} aria-hidden="true"/></span>
                </span>
                <span className={q.emptyProductName}>{product.name}</span>
                <span className={q.emptyProductCategory}>{product.category}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={q.emptyFooter}>
        <div className={q.emptyActions}>
          {products.length ? <button type="button" className={styles.primary} disabled={disabled} onClick={() => onChoose()}>Escolher produtos<ArrowRight size={17} aria-hidden="true"/></button> : null}
          {identified ? <Link href={`${base}/orcamentos`} className={q.emptySaved}>Meus orçamentos<ArrowRight size={15} aria-hidden="true"/></Link> : null}
        </div>
        {products.length ? <ul className={q.emptyReassurance}><li><Check size={15} aria-hidden="true"/>Sem pagamento nesta etapa</li><li><Check size={15} aria-hidden="true"/>Artes opcionais</li></ul> : null}
      </div>
    </div>
  );
}
