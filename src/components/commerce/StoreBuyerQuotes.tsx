"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Download, FileText, Loader2, RotateCcw, UserRound } from "lucide-react";
import type { getBuyerQuote, listBuyerQuotes } from "@/repositories/commerce-buyer-quotes";
import { formatDeliveryDate } from "@/domain/shipping/production-lead-time";
import { storeMoney, storeRequest } from "./store-http";
import { StoreOrderContactDetails } from "./StoreOrderContactDetails";
import { StoreOrderSummary } from "./StoreOrderSummary";
import { StoreQuoteSummary } from "./StoreQuoteSummary";
import { StoreQuoteArtworkBenefit } from "./StoreQuoteArtworkBenefit";
import { LibraryDialog } from "./LibraryUI";
import { StoreBuyerQuoteList } from "./StoreBuyerQuoteList";
import styles from "./store.module.css";
import q from "./quote.module.css";

export function StoreBuyerQuotes({ api, base, quoteId, revision, hasCart, onRestored }: { api: string; base: string; quoteId?: string; revision: number; hasCart: boolean; onRestored: (mode: "quote" | "purchase") => Promise<void> }) {
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof listBuyerQuotes>>>([]);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof getBuyerQuote>> | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [intent, setIntent] = useState<"quote" | "purchase" | null>(null), [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();
  const restoreLock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setQuote(null); setQuotes([]); setIntent(null); setReplaceConfirmed(false);
    void storeRequest(quoteId ? `${api}/quotes/${quoteId}` : `${api}/quotes`).then(result => { if (active) { setQuotes(result.quotes ?? []); setQuote(result.quote ?? null); } })
      .catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, quoteId, attempt]);
  function prepare(mode: "quote" | "purchase") { setIntent(mode); setReplaceConfirmed(false); setError(""); }
  if (loading && quoteId) return <p role="status" className="flex items-center gap-2"><Loader2 size={18} className="animate-spin"/>Carregando seus orçamentos…</p>;
  const expired = quote ? new Date(quote.valid_until).getTime() < Date.now() : false;
  return <div className={quoteId ? q.page : q.savedListPage}>
    <div className={q.header}><div><h1 className={styles.title}>{quoteId ? "Seu orçamento" : "Meus orçamentos"}</h1><p>{quoteId ? "Salvo na sua conta, pronto para consultar ou baixar." : "Suas propostas, sem compromisso de compra."}</p></div><Link className={styles.secondary} href={`${base}/orcamento`}><FileText size={16}/>Montar novo orçamento</Link></div>
    {error && !intent ? <div className={q.error}><p role="alert">{error}</p><button type="button" className={`${styles.secondary} mt-3`} onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16}/>Tentar novamente</button></div> : null}
    {quote ? <>
      <div className={q.savedHeader}><span className={q.badge}><CheckCircle2 size={16}/>Orçamento salvo</span><span className={q.badge}>{expired ? "Valores a conferir" : "Dentro da validade"}</span><p>Sem cobrança ou reserva.</p></div>
      <div className={q.layout}>
        <section className={q.items} aria-label="Itens do orçamento salvo">
          <div><h2 className="font-semibold">Orçamento {quote.id.slice(0, 8).toUpperCase()}</h2><p className={q.muted}>Criado em {new Date(quote.created_at).toLocaleDateString("pt-BR")} · Válido até {new Date(quote.valid_until).toLocaleDateString("pt-BR")}</p></div>
          {quote.snapshot.items.map(item => <article className={q.savedRow} key={item.id}><div><strong>{item.name}</strong><small>{item.quantity} un. × {storeMoney(item.unitCents)}{item.artworkName ? ` · ${item.artworkName}` : ""}</small></div><strong>{storeMoney(item.totalCents)}</strong></article>)}
          <details className={q.details}><summary><UserRound size={17}/>Dados e endereço deste orçamento</summary><StoreOrderContactDetails billing={{ ...quote.contact.billing, personType: quote.contact.billing.document.length === 14 ? "J" : "F" }} address={quote.snapshot.delivery === "pickup" ? null : quote.contact.address} same={quote.contact.deliveryAddressSameAsBilling} shippingOption={quote.snapshot.shippingOption}/>{quote.snapshot.delivery === "not_included" ? <p className={q.muted}>O endereço foi registrado, mas o frete não está incluído neste orçamento.</p> : null}</details>
          <div className={q.actions}><button className={styles.secondary} type="button" disabled={busy} onClick={() => prepare("quote")}><Copy size={17}/>Editar uma cópia</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => prepare("purchase")}><ArrowRight size={17}/>Continuar compra com estes produtos</button></div>
          <p className={q.muted}>Editar uma cópia preserva este documento. Antes de comprar, você poderá revisar os preços atuais, o frete e as artes.</p>
          <StoreQuoteArtworkBenefit benefits={quote.snapshot.artworkBenefits ?? []} storeName={quote.snapshot.storeName}/>
        </section>
        <StoreQuoteSummary totalCents={quote.total_cents} totalLabel={quote.shipping_cents === null ? "Sem frete" : "Total"} action={<a className={styles.primary} href={`${api}/quotes/${quote.id}/pdf`}><Download size={17}/>Baixar orçamento PDF</a>}>
          <StoreOrderSummary subtotal={quote.subtotal_cents - (quote.snapshot.artworkDiscountCents ?? 0)} artworkDiscountCents={quote.snapshot.artworkDiscountCents} shipping={quote.shipping_cents ?? undefined} shippingExcluded={quote.shipping_cents === null}/>
          <p>Produção: {quote.snapshot.production.productionDays} dias úteis após pagamento e aprovação das artes.</p>
          {quote.snapshot.production.deliveryDate ? <p>Estimativa registrada: <strong>{formatDeliveryDate(quote.snapshot.production.deliveryDate)}</strong></p> : null}
          <p>{expired ? "A validade terminou; o PDF original continua disponível. Consulte os valores atualizados ao retomar." : "Preços e frete serão conferidos novamente antes da compra."}</p>
        </StoreQuoteSummary>
      </div>
      <Link href={`${base}/orcamentos`} className="mt-6 inline-flex items-center gap-2 text-sm underline"><ArrowLeft size={15}/>Voltar aos meus orçamentos</Link>
      {intent ? <LibraryDialog title={intent === "quote" ? "Editar uma cópia do orçamento" : "Revisar para continuar a compra"} busy={busy} onClose={() => setIntent(null)}><div className={q.confirmation}>
        <p>Orçamento <strong>{quote.id.slice(0, 8).toUpperCase()}</strong> · {quote.snapshot.items.length} {quote.snapshot.items.length === 1 ? "item" : "itens"}.</p>
        <p>{intent === "quote" ? "Vamos recuperar os produtos e seus dados em um rascunho editável. O orçamento e o PDF originais não serão alterados." : "Vamos recuperar os produtos no carrinho para você conferir antes de comprar. Nenhum pagamento será iniciado."}</p>
        <p className={q.muted}>Os preços serão recalculados. O frete precisará ser consultado novamente; artes de outra sessão ou já usadas em pedidos poderão precisar de novo envio.</p>
        {hasCart ? <label><input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)}/>Substituir os itens atuais do carrinho pelos deste orçamento.</label> : null}
        {error ? <p role="alert" className={q.error}>{error}</p> : null}
        <button type="button" className={styles.primary} disabled={busy || (hasCart && !replaceConfirmed)} onClick={async () => {
          if (restoreLock.current) return; restoreLock.current = true; setBusy(true); setError("");
          try { await storeRequest(`${api}/quotes/${quote.id}`, "POST", { revision, confirmReplace: true }); await onRestored(intent); router.push(`${base}/${intent === "quote" ? "orcamento" : "carrinho"}`); setIntent(null); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível recuperar o orçamento."); }
          finally { restoreLock.current = false; setBusy(false); }
        }}>{busy ? <Loader2 className="animate-spin" size={16}/> : <ArrowRight size={16}/>} {intent === "quote" ? "Abrir cópia para editar" : "Abrir carrinho para revisar"}</button>
      </div></LibraryDialog> : null}
    </> : !quoteId && !error ? <StoreBuyerQuoteList key={api} quotes={quotes} loading={loading} api={api} base={base}/> : null}
  </div>;
}
