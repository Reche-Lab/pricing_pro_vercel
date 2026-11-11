"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, FileText, Loader2 } from "lucide-react";
import type { getBuyerQuote, listBuyerQuotes } from "@/repositories/commerce-buyer-quotes";
import { formatDeliveryDate } from "@/domain/shipping/production-lead-time";
import { storeMoney, storeRequest } from "./store-http";
import { StoreOrderContactDetails } from "./StoreOrderContactDetails";
import { StoreOrderSummary } from "./StoreOrderSummary";
import styles from "./store.module.css";

export function StoreBuyerQuotes({ api, base, quoteId, revision, hasCart, onRestored }: { api: string; base: string; quoteId?: string; revision: number; hasCart: boolean; onRestored: () => Promise<void> }) {
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof listBuyerQuotes>>>([]);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof getBuyerQuote>> | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setReplaceConfirmed(false);
    void storeRequest(quoteId ? `${api}/quotes/${quoteId}` : `${api}/quotes`).then(result => { if (active) { setQuotes(result.quotes ?? []); setQuote(result.quote ?? null); } })
      .catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, quoteId]);
  if (loading) return <p role="status" className="flex items-center gap-2"><Loader2 size={18} className="animate-spin"/>Carregando seus orçamentos…</p>;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className={styles.title}>{quoteId ? "Seu orçamento" : "Meus orçamentos"}</h1><Link className={styles.secondary} href={`${base}/catalogo`}><FileText size={16}/>Selecionar produtos para orçamento</Link></div>
    {error ? <p role="alert" className="rounded-md border border-rose-500/30 p-3 text-sm">{error}</p> : null}
    {quote ? <>
      <div className={styles.columns}>
        <section className="min-w-0"><h2 className="font-semibold">Orçamento {quote.id.slice(0, 8).toUpperCase()}</h2>
          <p className={`${styles.muted} mt-1`}>Criado em {new Date(quote.created_at).toLocaleDateString("pt-BR")} · Válido até {new Date(quote.valid_until).toLocaleDateString("pt-BR")}</p>
          <div className="mt-4 divide-y divide-current/15">{quote.snapshot.items.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-3 py-4"><div><strong>{item.name}</strong><p className="text-sm">{item.quantity} un. × {storeMoney(item.unitCents)}{item.artworkName ? ` · ${item.artworkName}` : ""}</p></div><strong>{storeMoney(item.totalCents)}</strong></div>)}</div>
          <StoreOrderContactDetails billing={{ ...quote.contact.billing, personType: quote.contact.billing.document.length === 14 ? "J" : "F" }} address={quote.snapshot.delivery === "pickup" ? null : quote.contact.address} same={quote.contact.deliveryAddressSameAsBilling} shippingOption={quote.snapshot.shippingOption}/>
        </section>
        <aside className={styles.summary}>
          <h2 className="text-lg font-semibold">Resumo do orçamento</h2>
          <div className="my-4"><StoreOrderSummary subtotal={quote.subtotal_cents - (quote.snapshot.artworkDiscountCents ?? 0)} artworkDiscountCents={quote.snapshot.artworkDiscountCents} shipping={quote.shipping_cents ?? undefined} shippingExcluded={quote.shipping_cents === null}/></div>
          <p className="text-sm">Produção: {quote.snapshot.production.productionDays} dias úteis após pagamento e aprovação das artes.</p>
          {quote.snapshot.production.deliveryDate ? <p className="mt-2 text-sm">Estimativa registrada: <strong>{formatDeliveryDate(quote.snapshot.production.deliveryDate)}</strong></p> : null}
          <a className={`${styles.primary} mt-4 w-full`} href={`${api}/quotes/${quote.id}/pdf`}><Download size={17}/>Baixar orçamento PDF</a>
          <p className={`${styles.muted} my-4`}>Não há cobrança nem reserva. Para comprar, confira os valores atuais, recalcule o frete e envie suas artes.</p>
          {hasCart ? <label className="my-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)}/>Substituir os itens atuais do carrinho pelos deste orçamento.</label> : null}
          <button type="button" className={`${styles.secondary} w-full`} disabled={busy || (hasCart && !replaceConfirmed)} onClick={async () => {
            setBusy(true); setError("");
            try { await storeRequest(`${api}/quotes/${quote.id}`, "POST", { revision, confirmReplace: true }); await onRestored(); router.push(`${base}/carrinho`); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível recuperar o orçamento."); }
            finally { setBusy(false); }
          }}>{busy ? <Loader2 className="animate-spin" size={16}/> : <ArrowRight size={16}/>}Continuar compra com estes produtos</button>
        </aside>
      </div>
      <Link href={`${base}/orcamentos`} className="inline-block text-sm underline">Voltar aos meus orçamentos</Link>
    </> : !quoteId ? <div className="divide-y divide-current/15">{quotes.length ? quotes.map(item => <Link href={`${base}/orcamentos/${item.id}`} key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-5"><span className="flex items-center gap-3"><FileText size={20}/><span><strong>Orçamento {item.id.slice(0, 8).toUpperCase()}</strong><small className={`${styles.muted} block`}>{new Date(item.created_at).toLocaleDateString("pt-BR")} · {item.shipping_cents === null ? "Sem frete" : "Com frete/retirada"}</small></span></span><strong className="inline-flex items-center gap-3">{storeMoney(item.total_cents)}<ArrowRight size={17}/></strong></Link>) : <p className="py-8">Você ainda não tem orçamentos salvos. Escolha os produtos e selecione Gerar orçamento no carrinho.</p>}</div> : null}
  </div>;
}
