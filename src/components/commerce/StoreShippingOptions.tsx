"use client";
import React from "react";
import { CalendarDays, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { hasTransitEstimate, sortShippingOptions, type StoreShippingOption } from "@/domain/commerce/shipping-options";
import { deliveryEstimate, formatDeliveryDate, type ProductionSettings } from "@/domain/shipping/production-lead-time";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";

export function StoreShippingOptions({ options, selectedId, onSelect, disabled, quantity, production }: {
  options: StoreShippingOption[]; selectedId: string; onSelect: (option: StoreShippingOption) => void;
  disabled?: boolean; quantity: number; production?: ProductionSettings;
}) {
  const sorted = sortShippingOptions(options), fastest = sorted.find(hasTransitEstimate);
  if (!sorted.length) return null;
  return <fieldset className={styles.shippingOptions} disabled={disabled}>
    <legend>Opções de entrega</legend>
    <div className={styles.shippingGrid}>
      {sorted.map(option => {
        const selected = option.id === selectedId;
        const estimate = quantity > 0 ? deliveryEstimate(quantity, option.transitDays ?? null, production) : null;
        return <label key={option.id} className={styles.shippingCard} data-selected={selected}>
          <span className={styles.shippingCardHeading}>
            <input type="radio" name="shipping-service" aria-label={option.name} value={option.id} checked={selected} onChange={() => onSelect(option)} onClick={() => { if (selected) onSelect(option); }}/>
            <strong>{option.name}</strong>
            {selected ? <CheckCircle2 size={17} aria-hidden="true"/> : null}
          </span>
          <span className={styles.shippingCardPrice}><strong>{storeMoney(option.priceCents)}</strong>{option.id === fastest?.id ? <small><Zap size={12} aria-hidden="true"/>Mais rápida</small> : null}</span>
          <span className={styles.shippingCardTiming}>{estimate ? `Produção: ${estimate.productionDays} dias úteis · ` : ""}Transporte: {hasTransitEstimate(option) ? `${option.transitDays} dias úteis` : "a confirmar"}</span>
          {estimate?.deliveryDate ? <span className={styles.shippingCardDate}><CalendarDays size={14} aria-hidden="true"/>Estimativa: <strong>{formatDeliveryDate(estimate.deliveryDate)}</strong></span> : null}
          {option.insuranceValueCents !== undefined ? <span className={styles.shippingCardInsurance}><ShieldCheck size={14} aria-hidden="true"/><span>Valor declarado: {storeMoney(option.insuranceValueCents)}<small>Seguro considerado nesta cotação</small></span></span> : null}
        </label>;
      })}
    </div>
    <p className={styles.muted}>Você pode escolher outro serviço. As datas dependem da confirmação do pagamento e das artes.</p>
  </fieldset>;
}
