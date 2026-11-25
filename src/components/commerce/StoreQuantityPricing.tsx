"use client";
import React, { useRef } from "react";
import { ArrowUpRight, BadgePercent, ChevronDown } from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { publicPriceMoney } from "@/domain/commerce/quantity-pricing";
import { productQuestions } from "@/domain/commerce/product-questions";
import s from "./quantity-pricing.module.css";

export function StoreQuantityPricing({ product, disabled, onSelect }: {
  product: ReturnType<typeof publicCommerceProduct>; disabled: boolean; onSelect: (quantity: number) => void;
}) {
  const pricing = product.quantityPricing;
  const tableScroll = useRef<HTMLDivElement>(null);
  if (!pricing) return null;
  const { bestPrice: best, minimumPurchase: minimum } = pricing;
  return <section className={s.pricing} aria-label="Preços por quantidade">
    <div className={s.heading}><BadgePercent size={19}/><h2>{best.discountPercent > 0 ? "Desconto progressivo por quantidade" : "Preços por quantidade"}</h2></div>
    {best.discountPercent > 0 ? <p className={s.benefit}><strong>Até {best.discountPercent}% de desconto</strong><span>Dependendo da quantidade{product.personalized ? " de uma mesma arte" : ""}.</span></p> : <p className={s.note}>Confira os valores para a quantidade desejada.</p>}
    <p className={s.note}>Compra mínima: <strong>{minimum.quantity.toLocaleString("pt-BR")} un. · {publicPriceMoney(minimum.totalCents)}</strong>. Frete à parte.</p>
    <details className={s.tableDetails}><summary>Ver tabela de preços<ChevronDown size={16}/></summary>
      <p className={s.note}>Referência de 1 unidade: {publicPriceMoney(pricing.originalUnitCents)}{product.minQuantity > 1 ? " (não vendida avulsa)" : ""}.{product.personalized ? " Valores para uma única arte; distribuir entre artes pode alterar o preço." : ""} Benefícios condicionais não incluídos.</p>
      <div ref={tableScroll} className={s.scroll} role="region" aria-label="Tabela de preços por quantidade" tabIndex={0}><table><caption>{product.name} · {pricing.mode === "step" ? "Preço por faixa" : "Curva por quantidade"}</caption><thead><tr><th scope="col">Unidades</th><th scope="col">Unitário</th><th scope="col">Total</th><th scope="col">Economia</th><th scope="col"><span className="sr-only">Selecionar quantidade</span></th></tr></thead><tbody>{pricing.rows.map(row => <tr key={row.quantity} data-best={row.quantity === best.quantity}><th scope="row">{row.quantity.toLocaleString("pt-BR")}</th><td>{publicPriceMoney(row.unitCents)}</td><td>{publicPriceMoney(row.totalCents)}</td><td>{row.discountPercent > 0 ? `${row.discountPercent}%` : "—"}</td><td><button type="button" disabled={disabled} title={`Simular ${row.quantity} unidades${product.personalized ? " com uma arte" : ""}`} aria-label={`Simular ${row.quantity} unidades${product.personalized ? " com uma arte" : ""}`} onClick={() => { onSelect(row.quantity); tableScroll.current?.scrollTo?.({ left: 0 }); }}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>
    </details>
  </section>;
}

export function StoreProductQuestions({ product, settings }: { product: ReturnType<typeof publicCommerceProduct>; settings: StoreSettings }) {
  return <section className={s.questions} aria-label="Dúvidas sobre este produto"><h2>Antes de escolher</h2>{productQuestions(product, settings).map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={16}/></summary><p>{item.answer}</p></details>)}</section>;
}
