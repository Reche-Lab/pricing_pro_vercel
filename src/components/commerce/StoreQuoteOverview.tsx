"use client";
import React from "react";
import Link from "next/link";
import { ArrowRight, FileText, Plus, Trash2 } from "lucide-react";
import type { cartView, publicCommerceProduct } from "@/repositories/commerce";
import { quoteArtworkBenefits } from "@/domain/commerce/quote-artwork-benefit";
import { StoreQuoteArtworkBenefit } from "./StoreQuoteArtworkBenefit";
import { StoreOrderSummary } from "./StoreOrderSummary";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";

export function StoreQuoteOverview({ cart, products, base, storeName, busy, onRemove }: {
  cart: Awaited<ReturnType<typeof cartView>>; products: ReturnType<typeof publicCommerceProduct>[];
  base: string; storeName: string; busy: boolean; onRemove: (id: string) => void;
}) {
  const benefits = quoteArtworkBenefits(cart.lines, products, cart.calculation);
  return <section aria-label="Produtos do seu orçamento">
    <div className={styles.quoteOverviewHeader}><div><h1 className={styles.title}>Monte seu orçamento</h1><p className={styles.muted}>Escolha produtos e quantidades. As artes são opcionais nesta etapa.</p></div><Link href={`${base}/catalogo`} className={styles.secondary}><Plus size={17}/>Adicionar produtos ao orçamento</Link></div>
    {!cart.lines.length ? <div className={styles.empty}><FileText size={32}/><h2>Vamos começar pelos produtos?</h2><p>Navegue pela loja e use “Adicionar ao orçamento”. Você só precisa validar seu e-mail para salvar o orçamento na sua conta.</p><Link href={`${base}/catalogo`} className={styles.primary}>Escolher produtos<ArrowRight size={17}/></Link></div> : <div className={styles.quoteOverview}>
      <div><div className="divide-y divide-current/15">{cart.lines.map(line => {
        const product = products.find(product => product.id === line.productId), price = cart.calculation?.items.find(item => item.id === line.id);
        return <div key={line.id} className="flex min-w-0 items-start justify-between gap-3 py-4"><div className="min-w-0"><Link href={`${base}/produto/${line.productId}`} className="font-semibold">{product?.name ?? price?.name ?? "Produto indisponível"}</Link><p className="mt-1 text-sm">{line.quantity} un. × {storeMoney(price?.unitCents ?? 0)}{line.artworkName ? ` · ${line.artworkName}` : ""}</p>{product?.personalized ? <small className={styles.muted}>{line.artworkId ? "Arte anexada. A aprovação pode ser concluída antes da compra." : "Você pode enviar a arte depois, antes da compra."}</small> : null}</div><div className="flex shrink-0 items-center gap-2"><strong className="text-sm">{storeMoney(price?.totalCents ?? 0)}</strong><button type="button" className={styles.iconButton} title="Remover item do orçamento" aria-label={`Remover ${product?.name ?? "item"} do orçamento`} disabled={busy} onClick={() => onRemove(line.id)}><Trash2 size={17}/></button></div></div>;
      })}</div><Link className="mt-3 inline-block text-sm underline" href={`${base}/carrinho`}>Editar quantidades e artes do orçamento</Link><StoreQuoteArtworkBenefit benefits={benefits} storeName={storeName}/></div>
      <aside className={styles.summary}><h2 className="mb-4 text-lg font-semibold">Resumo do orçamento</h2><StoreOrderSummary subtotal={cart.calculation?.totalCents ?? 0} artworkDiscountCents={cart.calculation?.artworkDiscountCents} shippingExcluded/>
        <Link href={`${base}/orcamento?etapa=dados`} className={`${styles.primary} mt-5 w-full`}>Continuar para dados e entrega<ArrowRight size={17}/></Link>
        <p className={`${styles.muted} mt-3`}>{cart.customer ? "Confira seus dados para salvar e acessar o PDF." : "Na próxima etapa, valide seu e-mail com um código, sem senha. Seus itens serão mantidos."}</p><p className={`${styles.muted} mt-3`}>Nenhum pedido ou pagamento será criado. Depois de salvo, o orçamento ficará em Meus orçamentos para comprar quando quiser, com nova conferência de preços e frete.</p>
      </aside>
    </div>}
  </section>;
}
