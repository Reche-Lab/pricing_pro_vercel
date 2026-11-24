"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useRef, useState } from "react";
import Link from "next/link";
import { commerceProductPath } from "@/domain/commerce/product-urls";
import { ArrowRight, Check, Images, Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import type { cartView, publicCommerceProduct } from "@/repositories/commerce";
import type { CartLine } from "@/domain/commerce/schemas";
import { changeQuoteQuantity, quoteCartFingerprint, restoreRemovedQuoteLine, type RemovedQuoteLine } from "@/domain/commerce/quote-cart";
import { quoteArtworkBenefits } from "@/domain/commerce/quote-artwork-benefit";
import { StoreQuoteArtworkBenefit } from "./StoreQuoteArtworkBenefit";
import { StoreOrderSummary } from "./StoreOrderSummary";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";
import q from "./quote.module.css";
import { StoreQuoteQuantity } from "./StoreQuoteQuantity";
import { StoreQuoteProductPicker } from "./StoreQuoteProductPicker";
import { StoreQuoteSummary } from "./StoreQuoteSummary";
import { StoreQuoteEmptyState } from "./StoreQuoteEmptyState";

export function StoreQuoteOverview({ cart, products, base, storeName, busy, onUpdate, renderArtwork }: {
  cart: Awaited<ReturnType<typeof cartView>>; products: ReturnType<typeof publicCommerceProduct>[];
  base: string; storeName: string; busy: boolean; onUpdate: (lines: CartLine[]) => Promise<void>; renderArtwork?: (line: CartLine, disabled: boolean) => React.ReactNode;
}) {
  const [picker, setPicker] = useState<{ productId?: string } | null>(null), [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<RemovedQuoteLine | null>(null), lock = useRef(false);
  const disabled = busy || saving;
  const benefits = quoteArtworkBenefits(cart.lines, products, cart.calculation);
  async function apply(lines: CartLine[], message: string, undo: RemovedQuoteLine | null = null) {
    if (lock.current || busy) return false;
    lock.current = true; setSaving(true); setError(""); setNotice("");
    try { await onUpdate(lines); setRemoved(undo); setNotice(message); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar. Tente novamente."); return false; }
    finally { lock.current = false; setSaving(false); }
  }
  return <section className={q.page} data-empty={!cart.lines.length} aria-label="Produtos do seu orçamento" aria-busy={saving}>
    {cart.lines.length ? <div className={q.header}><div><h1 className={styles.title}>Monte seu orçamento</h1><p>Escolha produtos e quantidades. As artes são opcionais nesta etapa.</p></div><button type="button" className={styles.secondary} disabled={disabled} onClick={() => { setError(""); setPicker({}); }}><Plus size={17}/>Adicionar produtos ao orçamento</button></div> : null}
    <div className={q.status} role="status">{saving ? <><Loader2 size={16} className="animate-spin"/>Atualizando itens e valores…</> : notice ? <><Check size={16}/>{notice}</> : null}{removed && !saving ? <button type="button" disabled={disabled} onClick={() => { try { void apply(restoreRemovedQuoteLine(cart.lines, removed), "Item recuperado. Valores atualizados."); } catch (cause) { setError((cause as Error).message); setRemoved(null); } }}><Undo2 size={15}/>Desfazer remoção</button> : null}</div>
    {error && !picker ? <p className={q.error} role="alert">{error}</p> : null}
    {!cart.lines.length ? <StoreQuoteEmptyState products={products} base={base} identified={Boolean(cart.customer)} disabled={disabled} onChoose={productId => { if (!disabled) { setError(""); setPicker({ productId }); } }}/> : <div className={`${q.layout} ${q.populated}`}>
      <div className={q.items}>{[...new Set(cart.lines.map(line => line.productId))].map(productId => {
        const product = products.find(item => item.id === productId), lines = cart.lines.filter(line => line.productId === productId);
        const prices = cart.calculation?.items.filter(item => item.productId === productId) ?? [];
        const name = product?.name ?? prices[0]?.name ?? "Produto indisponível";
        return <article className={q.product} key={productId} aria-label={name}>
          <header className={q.productHeader}>{product ? <img className={q.thumbnail} src={product.imageUrl} alt="" width={64} height={64}/> : null}<div><h2><Link href={commerceProductPath(base, product ?? { id: productId })}>{name}</Link></h2><p>{lines.reduce((total, line) => total + line.quantity, 0)} unidades · {lines.length} {lines.length === 1 ? "grupo" : "grupos"}</p></div><strong className={q.productTotal}>{storeMoney(prices.reduce((total, item) => total + item.totalCents, 0))}</strong></header>
          {lines.map((line, index) => { const price = prices.find(item => item.id === line.id); return <div className={q.line} key={line.id}><div><strong>{line.artworkName || `Grupo ${index + 1}`}</strong><small>{storeMoney(price?.unitCents ?? 0)} por unidade · subtotal {storeMoney(price?.totalCents ?? 0)}</small></div><div className={q.lineTools}>{product ? <StoreQuoteQuantity value={line.quantity} label={`${name} · ${line.artworkName || `Grupo ${index + 1}`}`} disabled={disabled} onCommit={quantity => apply(changeQuoteQuantity(cart.lines, line.id, quantity, product), "Quantidade e valores atualizados.")}/> : <p className={q.muted}>Remova o produto indisponível.</p>}<button type="button" className={styles.iconButton} disabled={disabled} title="Remover grupo do orçamento" aria-label={`Remover ${name} · ${line.artworkName || `Grupo ${index + 1}`}`} onClick={() => { const next = cart.lines.filter(item => item.id !== line.id); void apply(next, "Item removido do orçamento.", { line, index: cart.lines.findIndex(item => item.id === line.id), after: quoteCartFingerprint(next) }); }}><Trash2 size={17}/></button></div></div>; })}
          {product?.personalized ? <details className={q.details}><summary><Images size={16}/>Artes e personalização · opcional</summary>{lines.map((line, index) => <div key={`${line.id}:${line.artworkName}`} className={q.art}><label>Nome da arte / lote {index + 1}<input defaultValue={line.artworkName} maxLength={100} disabled={disabled} onBlur={event => { const artworkName = event.currentTarget.value.trim(); if (artworkName !== line.artworkName) void apply(cart.lines.map(item => item.id === line.id ? { ...item, artworkName } : item), "Nome da arte atualizado."); }}/></label>{renderArtwork?.(line, disabled) ?? <p className={q.muted}>Você pode preparar e aprovar a arte antes da compra.</p>}</div>)}</details> : null}
        </article>;
      })}<StoreQuoteArtworkBenefit benefits={benefits} storeName={storeName}/></div>
      <StoreQuoteSummary totalCents={cart.calculation?.totalCents ?? 0} totalLabel="Sem frete" action={<Link href={`${base}/orcamento?etapa=dados`} className={styles.primary} aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>Continuar para dados e entrega<ArrowRight size={17}/></Link>}>
        <StoreOrderSummary subtotal={cart.calculation?.totalCents ?? 0} artworkDiscountCents={cart.calculation?.artworkDiscountCents} shippingExcluded/>
        <p>{cart.customer ? "Confira seus dados para salvar e acessar o PDF." : "Na próxima etapa, valide seu e-mail com um código, sem senha."}</p><p>Sem cobrança ou reserva. Seu orçamento ficará em Meus orçamentos para retomar depois.</p>
      </StoreQuoteSummary>
    </div>}
    {picker ? <StoreQuoteProductPicker products={products} initialProductId={picker.productId} lines={cart.lines} busy={disabled} error={error} onClose={() => setPicker(null)} onAdd={lines => apply(lines, "Produto adicionado. Valores atualizados.")}/> : null}
  </section>;
}
