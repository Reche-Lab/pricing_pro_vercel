"use client";
import React from "react";
import { BadgePercent } from "lucide-react";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";

export function StorePriceBreakdown({ originalUnitCents, quantity, price, compact = false, pending = true }: {
  originalUnitCents: number; quantity: number; compact?: boolean;
  pending?: boolean;
  price: { totalCents: number; items: { unitCents: number; artworkName?: string; quantity?: number }[] } | null;
}) {
  const units = price?.items.map(item => item.unitCents) ?? [];
  const min = Math.min(...units), max = Math.max(...units);
  const originalTotal = originalUnitCents * quantity;
  const savings = price ? Math.max(0, originalTotal - price.totalCents) : 0;
  return <div className={`${styles.priceBreakdown} ${compact ? styles.compactPrice : ""}`} aria-live="polite" aria-busy={!price && pending}>
    <div className={styles.priceAmounts}>
      <div>
        <span className={styles.muted}>Preço unitário{min !== max && price ? " por arte" : ""}</span>
        {price && originalUnitCents > max ? <del aria-label="Preço unitário de referência">{storeMoney(originalUnitCents)}</del> : null}
        <strong>{price ? min === max ? storeMoney(min) : `${storeMoney(min)} a ${storeMoney(max)}` : pending ? "Calculando…" : "—"}</strong>
      </div>
      <div>
        <span className={styles.muted}>Total dos produtos</span>
        {savings > 0 ? <del aria-label="Total sem desconto por quantidade">{storeMoney(originalTotal)}</del> : null}
        <strong>{price ? storeMoney(price.totalCents) : "—"}</strong>
      </div>
    </div>
    {savings > 0 ? <p className={styles.savings}><BadgePercent size={16} aria-hidden="true" /> Economia de {storeMoney(savings)}
      <span>({savings * 100 < originalTotal ? "<1" : Math.floor(savings * 100 / originalTotal)}%)</span></p> : null}
    {!compact ? <p className={styles.muted}>Referência de 1 unidade: {storeMoney(originalUnitCents)}. Total sem frete.</p> : null}
    {!compact && price && min !== max ? <details className={styles.priceByArt}>
      <summary>Valores por arte</summary>
      {price.items.map((item, i) => <p key={i}>{item.artworkName || `Arte ${i + 1}`} · {item.quantity} un. <strong>{storeMoney(item.unitCents)} / un.</strong></p>)}
    </details> : null}
  </div>;
}
