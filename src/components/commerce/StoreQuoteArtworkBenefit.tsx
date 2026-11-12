import React from "react";
import { BadgePercent } from "lucide-react";
import { quoteArtworkBenefitDescription, type QuoteArtworkBenefit } from "@/domain/commerce/quote-artwork-benefit";
import styles from "./store.module.css";

export function StoreQuoteArtworkBenefit({ benefits, storeName }: { benefits: QuoteArtworkBenefit[]; storeName: string }) {
  if (!benefits.length) return null;
  return <section className={styles.quoteBenefit} aria-label="Desconto possível por arte pronta">
    <h2><BadgePercent size={19} aria-hidden="true"/>Sua arte pronta pode render mais desconto</h2>
    <ul>{benefits.map(benefit => <li key={benefit.productId}>{quoteArtworkBenefitDescription(benefit)}</li>)}</ul>
    <p>Envie, enquadre e aprove cada arte conforme o guia do produto e as especificações da equipe da {storeName}, pronta para impressão, sem ajustes da equipe.</p>
    <small>Benefício condicional, ainda não descontado do total. Não incide sobre o frete e será conferido antes da compra. Benefícios já aplicados não são contados novamente.</small>
  </section>;
}
