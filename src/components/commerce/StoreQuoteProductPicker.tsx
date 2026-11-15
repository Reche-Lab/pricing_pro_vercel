"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import type { CartLine } from "@/domain/commerce/schemas";
import { addQuoteProduct } from "@/domain/commerce/quote-cart";
import { normalizeProductSearchTerm } from "@/domain/products/product-search";
import { LibraryDialog } from "./LibraryUI";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";
import q from "./quote.module.css";
type Product = ReturnType<typeof publicCommerceProduct>;
export function StoreQuoteProductPicker({ products, lines, busy, error, onClose, onAdd }: { products: Product[]; lines: CartLine[]; busy: boolean; error: string; onClose: () => void; onAdd: (lines: CartLine[]) => Promise<boolean> }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState(""), [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("1"), [artworks, setArtworks] = useState("1"), [invalid, setInvalid] = useState("");
  const terms = normalizeProductSearchTerm(query).split(" ").filter(Boolean);
  const found = products.filter(product => (!category || category === product.category) && terms.every(term => normalizeProductSearchTerm(`${product.name} ${product.category} ${product.description}`).includes(term)));
  return <LibraryDialog title="Adicionar produtos ao orçamento" onClose={onClose} busy={busy} wide>
    <div className={q.search}><Search size={19} aria-hidden="true"/><label className="sr-only" htmlFor="quote-product-search">Buscar produto</label><input id="quote-product-search" placeholder="Nome, tamanho ou categoria" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <label className={q.muted}>Categoria<select aria-label="Categoria dos produtos" value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas as categorias</option>{[...new Set(products.map(product => product.category))].map(value => <option key={value}>{value}</option>)}</select></label>
    <div className={q.catalog} role="group" aria-label="Produtos disponíveis">{found.map(product => <button type="button" className={q.catalogChoice} aria-pressed={selected?.id === product.id} disabled={busy} key={product.id} onClick={() => { setSelected(product); setQuantity(String(product.minQuantity)); setArtworks("1"); setInvalid(""); }}><img src={product.imageUrl} alt="" width={46} height={46}/><span><strong>{product.name}</strong><small>{storeMoney(product.unitCents)} / un. na quantidade mínima de {product.minQuantity}</small></span></button>)}</div>
    {!found.length ? <p role="status" className={q.status}>Nenhum produto encontrado. Experimente outro nome ou categoria.</p> : null}
    {selected ? <form className={q.selection} onSubmit={async event => { event.preventDefault(); setInvalid(""); try { const next = addQuoteProduct(lines, selected, Number(quantity), Number(artworks)); if (await onAdd(next)) onClose(); } catch (cause) { setInvalid(cause instanceof Error ? cause.message : "Confira as quantidades."); } }}>
      <label>Quantidade de produtos<input inputMode="numeric" pattern="[0-9]+" value={quantity} onChange={event => setQuantity(event.target.value)} required maxLength={5} disabled={busy}/></label>
      {selected.personalized ? <label>Quantidade de artes / grupos<input inputMode="numeric" pattern="[0-9]+" value={artworks} onChange={event => setArtworks(event.target.value)} required maxLength={2} disabled={busy}/></label> : null}
      <p className={q.muted}>A arte é opcional para orçar. {lines.some(line => line.productId === selected.id) ? selected.personalized ? "Este produto já está no orçamento; a inclusão cria novos grupos, preservando os existentes." : "A quantidade será somada à deste produto no orçamento." : "Os valores serão calculados após a inclusão."}</p>
      {invalid || error ? <p role="alert" className={q.error}>{invalid || error}</p> : null}
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? <Loader2 size={17} className="animate-spin"/> : <Plus size={17}/>}Adicionar ao orçamento</button>
    </form> : null}
  </LibraryDialog>;
}
