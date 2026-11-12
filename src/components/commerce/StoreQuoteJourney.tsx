"use client";
import React from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText } from "lucide-react";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";

export function StoreQuoteJourney({ base, step, count, totalCents, identified, onPurchase }: {
  base: string; step: number; count: number; totalCents: number; identified: boolean; onPurchase: () => void;
}) {
  return <section className={styles.quoteJourney} aria-label="Etapas do seu orçamento">
    <div className={styles.quoteJourneyInner}>
      <div className={styles.quoteJourneyTitle}><FileText size={20} aria-hidden="true"/><div><strong>{step === 4 ? "Orçamento salvo na sua conta" : "Você está montando um orçamento"}</strong><small>{step === 4 ? "Disponível em Meus orçamentos para comprar depois." : identified ? "Sem cobrança. Salve para acessar depois na sua conta." : "Rascunho neste dispositivo. Valide seu e-mail ao salvar."}</small></div></div>
      <ol className={styles.quoteSteps} aria-label="Progresso do orçamento">{["Produtos", "Dados e entrega", "Revisão", "Salvo"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-done={step > index + 1}><span>{step > index + 1 ? <Check size={13} aria-hidden="true"/> : index + 1}</span>{label}</li>)}</ol>
      <div className={styles.quoteJourneyActions}>{step !== 4 ? <><Link className={styles.quoteJourneyResume} href={`${base}/orcamento`}>{count} {count === 1 ? "grupo" : "grupos"} · {storeMoney(totalCents)}<ArrowRight size={15}/><span className="sr-only">Ver meu orçamento</span></Link><button type="button" onClick={onPurchase}>Continuar como compra</button></> : <Link href={`${base}/orcamentos`}>Meus orçamentos<ArrowRight size={15}/></Link>}</div>
    </div>
  </section>;
}
