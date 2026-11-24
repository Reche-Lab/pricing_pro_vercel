"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Package, Plus } from "lucide-react";
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
  const rail = useRef<HTMLUListElement>(null), railId = useId();
  const [ends, setEnds] = useState({ start: true, end: true });
  // Preserve category variety in the first row, keeping the rest of the catalog reachable.
  const categories = new Set<string>();
  const featured = products.filter(product => {
    if (categories.has(product.category)) return false;
    categories.add(product.category);
    return true;
  }).slice(0, 4);
  for (const product of products) {
    if (!featured.some(item => item.id === product.id)) featured.push(product);
  }

  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const update = () => setEnds({ start: node.scrollLeft <= 2, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2 });
    update();
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(node);
    return () => {
      node.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [products]);

  function move(direction: number) {
    const node = rail.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * .9,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return (
    <div className={q.emptyWorkspace}>
      <header className={q.emptyHeading}>
        <span className={q.emptyEyebrow}><FileText size={16} aria-hidden="true"/>Monte seu orçamento</span>
        <h1>{products.length ? "Sua próxima ideia começa aqui." : "Novas ideias estão a caminho."}</h1>
        <p>{products.length ? "Combine produtos e quantidades. Consulte os valores sem compromisso de compra." : "Os produtos desta loja ainda não estão disponíveis para orçamento."}</p>
      </header>

      {featured.length ? (
        <div className={q.emptyCarousel}>
          <button type="button" className={`${q.emptyCarouselArrow} ${q.emptyPrevious}`} disabled={disabled || ends.start} onClick={() => move(-1)} aria-label="Produtos anteriores do orçamento" title="Produtos anteriores" aria-controls={railId}><ChevronLeft size={21} aria-hidden="true"/></button>
          <ul ref={rail} id={railId} className={q.emptyProducts} aria-label="Sugestões para começar seu orçamento" tabIndex={0} onKeyDown={event => {
            if (event.target !== event.currentTarget || disabled) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
          }}>
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
          <button type="button" className={`${q.emptyCarouselArrow} ${q.emptyNext}`} disabled={disabled || ends.end} onClick={() => move(1)} aria-label="Próximos produtos do orçamento" title="Próximos produtos" aria-controls={railId}><ChevronRight size={21} aria-hidden="true"/></button>
        </div>
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
