"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Grid2X2, Package, X } from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";

type MenuProduct = Pick<ReturnType<typeof publicCommerceProduct>, "id" | "name" | "category" | "imageUrl" | "unitCents" | "personalized">;

export function StoreCategoryNavigation({ products, base, preview, view, activeCategory, libraryEnabled = false, navigationKey = "" }: {
  products: MenuProduct[]; base: string; preview: boolean; view: string; activeCategory?: string | null;
  libraryEnabled?: boolean; navigationKey?: string;
}) {
  const categories = useMemo(() => {
    const grouped = new Map<string, MenuProduct[]>();
    for (const product of products) {
      const group = grouped.get(product.category);
      if (group) group.push(product); else grouped.set(product.category, [product]);
    }
    return [...grouped].map(([name, items]) => ({ name, items }));
  }, [products]);
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null), panel = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPanel = useRef(false);
  const id = useId();
  const selected = categories.find(category => category.name === open);
  const cancelClose = useCallback(() => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null; }, []);
  function close(restoreFocus = false) {
    cancelClose(); focusPanel.current = false; setOpen(null);
    if (restoreFocus && open) triggers.current.get(open)?.focus();
  }
  function openCategory(name: string, focus = false) { cancelClose(); focusPanel.current = focus; setOpen(name); }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!root.current?.contains(document.activeElement)) setOpen(null);
    }, 170);
  }
  useEffect(() => { cancelClose(); focusPanel.current = false; setOpen(null); }, [navigationKey, cancelClose]);
  useEffect(() => () => cancelClose(), [cancelClose]);
  useEffect(() => {
    if (!selected) return;
    if (focusPanel.current) { panel.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus(); focusPanel.current = false; }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { cancelClose(); focusPanel.current = false; setOpen(null); }
    };
    const resize = () => {
      const bottom = root.current?.getBoundingClientRect().bottom ?? 0;
      root.current?.style.setProperty("--category-menu-height", `${Math.max(96, Math.min(480, window.innerHeight - bottom - 12))}px`);
    };
    resize();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, { passive: true });
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize); window.removeEventListener("scroll", resize); };
  }, [selected, cancelClose]);

  return <nav ref={root} aria-label="Categorias de produtos" className={styles.categoryNav}
    onPointerEnter={cancelClose} onPointerLeave={scheduleClose}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}
    onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); } }}>
    <div className={styles.categoryNavBar}>
      <Link className={styles.categoryCatalogLink} href={`${base}/catalogo`} aria-label="Pesquisar produtos" aria-current={view === "catalogo" && !activeCategory ? "page" : undefined} onClick={() => close()}><Grid2X2 size={16} aria-hidden="true"/>Todos os produtos</Link>
      {categories.map((category, index) => <button key={category.name} type="button"
        ref={element => { if (element) triggers.current.set(category.name, element); else triggers.current.delete(category.name); }}
        id={`${id}-trigger-${index}`} className={styles.categoryTrigger} title={category.name} aria-expanded={open === category.name}
        aria-controls={`${id}-panel-${index}`} aria-current={activeCategory === category.name ? "true" : undefined}
        data-active={open === category.name || activeCategory === category.name}
        onClick={() => { if (open === category.name) close(); else openCategory(category.name); }}
        onPointerEnter={event => { if (event.pointerType === "mouse" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) openCategory(category.name); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); if (open === category.name) panel.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus(); else openCategory(category.name, true); }
          if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length;
            triggers.current.get(categories[next].name)?.focus(); if (open) openCategory(categories[next].name);
          }
        }}>
        <span>{category.name}</span><ChevronDown size={14} aria-hidden="true"/>
      </button>)}
      {!preview ? <Link className={styles.categoryUtilityLink} href={`${base}/orcamento`} aria-current={view === "orcamento" ? "page" : undefined} onClick={() => close()}>Solicitar orçamento</Link> : null}
      {libraryEnabled ? <><Link className={styles.categoryUtilityLink} href={`${base}/artes`} aria-current={view === "artes" ? "page" : undefined} onClick={() => close()}>Artes prontas</Link><Link className={styles.categoryUtilityLink} href={`${base}/campanhas`} aria-current={view === "campanhas" ? "page" : undefined} onClick={() => close()}>Campanhas</Link></> : null}
    </div>
    {selected ? <section ref={panel} id={`${id}-panel-${categories.indexOf(selected)}`} aria-label={`Produtos de ${selected.name}`} className={styles.categoryDropdown}>
      <div className={styles.categoryDropdownHeading}>
        <div><h2>{selected.name}</h2><span>{selected.items.length} {selected.items.length === 1 ? "produto" : "produtos"}</span></div>
        <Link prefetch={false} className={styles.categoryViewAll} href={`${base}/catalogo?categoria=${encodeURIComponent(selected.name)}`} onClick={() => close()}>Ver categoria completa<ArrowRight size={15} aria-hidden="true"/></Link>
        <button type="button" aria-label="Fechar categorias" title="Fechar categorias" className={styles.categoryClose} onClick={() => close(true)}><X size={18}/></button>
      </div>
      <div className={styles.categoryProductGrid}>
        {selected.items.map(product => <Link prefetch={false} key={product.id} className={styles.categoryProduct} href={`${base}/produto/${product.id}`} onClick={() => close()}>
          <span className={styles.categoryProductImage}>{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" width={64} height={64}/> : <Package size={25} aria-hidden="true"/>}</span>
          <span className={styles.categoryProductText}><strong>{product.name}</strong><small>{product.personalized ? "Personalizável" : selected.name}</small><span>{storeMoney(product.unitCents)} <small>/ un.</small></span></span>
          <ArrowRight className={styles.categoryProductArrow} size={17} aria-hidden="true"/>
        </Link>)}
      </div>
    </section> : null}
  </nav>;
}
