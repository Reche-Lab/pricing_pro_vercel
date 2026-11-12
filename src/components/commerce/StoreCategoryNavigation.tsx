"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Grid2X2, Images, Megaphone, Package, X } from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import { campaignIsVisible } from "@/domain/commerce/library";
import { storeMoney } from "./store-http";
import { useMenuLibrary } from "./use-menu-library";
import { StoreLibraryMenuContent } from "./StoreLibraryMenuContent";
import styles from "./store.module.css";

type MenuProduct = Pick<ReturnType<typeof publicCommerceProduct>, "id" | "name" | "category" | "imageUrl" | "unitCents" | "personalized">;
type MenuGroup = { key: string; name: string; kind: "products"; items: MenuProduct[] } | { key: string; name: string; kind: "artworks" | "campaigns" };

export function StoreCategoryNavigation({ products, base, preview, view, activeCategory, libraryEnabled = false, libraryApi = "", navigationKey = "" }: {
  products: MenuProduct[]; base: string; preview: boolean; view: string; activeCategory?: string | null;
  libraryEnabled?: boolean; libraryApi?: string; navigationKey?: string;
}) {
  const categories = useMemo(() => {
    const grouped = new Map<string, MenuProduct[]>();
    for (const product of products) {
      const group = grouped.get(product.category);
      if (group) group.push(product); else grouped.set(product.category, [product]);
    }
    const groups: MenuGroup[] = [...grouped].map(([name, items]) => ({ key: `product:${name}`, kind: "products", name, items }));
    if (libraryEnabled) groups.push({ key: "library:artworks", name: "Artes prontas", kind: "artworks" }, { key: "library:campaigns", name: "Campanhas", kind: "campaigns" });
    return groups;
  }, [products, libraryEnabled]);
  const [open, setOpen] = useState<string | null>(null);
  const [requestedLibraryApi, setRequestedLibraryApi] = useState<string | null>(null);
  const library = useMenuLibrary(libraryApi, libraryEnabled && requestedLibraryApi === libraryApi);
  const campaigns = library.data?.campaigns.filter(campaign => preview ? campaign.status !== "archived" : campaignIsVisible(campaign)) ?? [];
  const root = useRef<HTMLElement>(null), panel = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPanel = useRef(false);
  const id = useId();
  const selected = categories.find(category => category.key === open);
  const cancelClose = useCallback(() => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null; }, []);
  function close(restoreFocus = false) {
    cancelClose(); focusPanel.current = false; setOpen(null);
    if (restoreFocus && open) triggers.current.get(open)?.focus();
  }
  function openCategory(key: string, focus = false) {
    cancelClose(); focusPanel.current = focus; setOpen(key);
    if (categories.find(category => category.key === key)?.kind !== "products" && libraryApi) setRequestedLibraryApi(libraryApi);
  }
  function isActive(category: MenuGroup) { return category.kind === "products" ? activeCategory === category.name : view === (category.kind === "artworks" ? "artes" : "campanhas"); }
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
      {categories.map((category, index) => <button key={category.key} type="button"
        ref={element => { if (element) triggers.current.set(category.key, element); else triggers.current.delete(category.key); }}
        id={`${id}-trigger-${index}`} className={styles.categoryTrigger} title={category.name} aria-expanded={open === category.key}
        aria-controls={`${id}-panel-${index}`} aria-current={isActive(category) ? "true" : undefined}
        data-active={open === category.key || isActive(category)}
        onClick={() => { if (open === category.key) close(); else openCategory(category.key); }}
        onPointerEnter={event => { if (event.pointerType === "mouse" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) openCategory(category.key); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); if (open === category.key) panel.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus(); else openCategory(category.key, true); }
          if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length;
            triggers.current.get(categories[next].key)?.focus(); if (open) openCategory(categories[next].key);
          }
        }}>
        {category.kind === "artworks" ? <Images size={15} aria-hidden="true"/> : category.kind === "campaigns" ? <Megaphone size={15} aria-hidden="true"/> : null}<span>{category.name}</span><ChevronDown size={14} aria-hidden="true"/>
      </button>)}
      {!preview ? <Link className={styles.categoryUtilityLink} href={`${base}/orcamento`} aria-current={view === "orcamento" ? "page" : undefined} onClick={() => close()}>Solicitar orçamento</Link> : null}
    </div>
    {selected ? <section ref={panel} id={`${id}-panel-${categories.indexOf(selected)}`} aria-label={selected.kind === "products" ? `Produtos de ${selected.name}` : `${selected.name} da loja`} className={styles.categoryDropdown}>
      <div className={styles.categoryDropdownHeading}>
        <div><h2>{selected.name}</h2><span>{selected.kind === "products" ? `${selected.items.length} ${selected.items.length === 1 ? "produto" : "produtos"}` : library.data ? selected.kind === "campaigns" ? `${campaigns.length} ${campaigns.length === 1 ? "campanha" : "campanhas"}` : `${library.data.total} ${library.data.total === 1 ? "arte" : "artes"}` : "Biblioteca da loja"}</span></div>
        <Link prefetch={false} className={styles.categoryViewAll} href={selected.kind === "products" ? `${base}/catalogo?categoria=${encodeURIComponent(selected.name)}` : `${base}/${selected.kind === "artworks" ? "artes" : "campanhas"}`} onClick={() => close()}>{selected.kind === "products" ? "Ver categoria completa" : selected.kind === "artworks" ? "Ver todas as artes" : "Ver todas as campanhas"}<ArrowRight size={15} aria-hidden="true"/></Link>
        <button type="button" aria-label="Fechar categorias" title="Fechar categorias" className={styles.categoryClose} onClick={() => close(true)}><X size={18}/></button>
      </div>
      {selected.kind === "products" ? <div className={styles.categoryProductGrid}>
        {selected.items.map(product => <Link prefetch={false} key={product.id} className={styles.categoryProduct} href={`${base}/produto/${product.id}`} onClick={() => close()}>
          <span className={styles.categoryProductImage}>{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" width={64} height={64}/> : <Package size={25} aria-hidden="true"/>}</span>
          <span className={styles.categoryProductText}><strong>{product.name}</strong><small>{product.personalized ? "Personalizável" : selected.name}</small><span>{storeMoney(product.unitCents)} <small>/ un.</small></span></span>
          <ArrowRight className={styles.categoryProductArrow} size={17} aria-hidden="true"/>
        </Link>)}
      </div> : <StoreLibraryMenuContent kind={selected.kind} base={base} api={libraryApi} preview={preview} data={library.data} campaigns={campaigns} loading={library.loading} error={library.error} reload={library.reload} onNavigate={() => close()}/>}
    </section> : null}
  </nav>;
}
