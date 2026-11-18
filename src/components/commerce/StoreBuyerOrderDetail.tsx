"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useId } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Check, CreditCard, Download, Package, RefreshCw, Truck, UserRound } from "lucide-react";
import { CommerceOrderArtworks } from "./CommerceOrderArtworks";
import { StoreOrderContactDetails } from "./StoreOrderContactDetails";
import { StoreOrderSummary } from "./StoreOrderSummary";
import { formatDeliveryDate } from "@/domain/shipping/production-lead-time";
import { buyerOrderDate, buyerOrderUnits, buyerPaymentLabel, buyerFulfillmentLabel, type BuyerOrder, type OrderCatalogImage } from "./buyer-order-presentation";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";
import o from "./buyer-orders.module.css";
import { useStoreAnalytics } from "./StoreAnalytics";
import { analyticsCommercePayload } from "@/domain/commerce/analytics";
const StorePayment = dynamic(() => import("./StorePayment").then(module => module.StorePayment), { ssr: false });
export function StoreBuyerOrderDetail({ order, api, base, instructions, busy, onRefresh, products }: {
  order: BuyerOrder; api: string; base: string; instructions: string; busy: boolean; onRefresh: () => Promise<void>; products: OrderCatalogImage[];
}) {
  const analytics = useStoreAnalytics();
  const paymentId = useId(), code = order.id.slice(0, 8).toUpperCase();
  const steps = ["Recebido", "Produção", "Envio / retirada", "Concluído"], stage = ["received", "production", "shipped", "completed"].indexOf(order.fulfillment_status);
  const pending = order.payment_status === "pending", test = order.payment_environment === "test";
  useEffect(() => {
    if (!test && order.payment_status === "paid") analytics.once(`purchase:${order.id}`, "purchase", { ...analyticsCommercePayload(order.items), transaction_id: order.id, value: (order.total_cents - order.shipping_cents) / 100, currency: "BRL", shipping: order.shipping_cents / 100, customer_state: "identified" });
  }, [analytics, order, test]);
  return <div className={o.page}>
    <Link className={o.back} href={`${base}/pedidos`}><ArrowLeft size={15}/>Voltar aos meus pedidos</Link>
    <header className={o.detailHeader}><div><p className={o.eyebrow}>Pedido {code} · {buyerOrderDate(order.created_at)}</p><h1 className={styles.title}>Seu pedido</h1><p className={o.muted}>{buyerOrderUnits(order)} unidades · {order.items.length} {order.items.length === 1 ? "item" : "itens"}</p></div><div className={o.headerActions}><div className={o.orderTotal}><small>Total do pedido</small><strong>{storeMoney(order.total_cents)}</strong></div><button type="button" className={styles.secondary} disabled={busy} aria-label={busy ? "Atualizando situação" : "Atualizar situação"} title="Atualizar situação" onClick={() => void onRefresh()}><RefreshCw size={16} className={busy ? "animate-spin motion-reduce:animate-none" : ""}/><span>{busy ? "Atualizando…" : "Atualizar situação"}</span></button></div></header>
    {test ? <p className={o.testNotice} role="status">Pedido de teste · sem produção ou envio.</p> : null}
    <div className={o.stateBand}><span className={o.status} data-status={order.payment_status}><CreditCard size={15}/>{buyerPaymentLabel(order.payment_status)}</span><span className={o.status}><Package size={15}/>{buyerFulfillmentLabel(order.fulfillment_status)}</span>{pending ? <a className={o.paymentShortcut} href={`#${paymentId}`}>Ver pagamento<ArrowRight size={14}/></a> : null}</div>
    {!test && order.payment_status !== "refunded" && stage >= 0 ? <section className={o.progress} aria-label="Andamento do pedido"><ol>{steps.map((label, index) => <li key={label} data-state={index < stage ? "done" : index === stage ? "current" : "upcoming"} aria-current={index === stage ? "step" : undefined}><span>{index < stage ? <Check size={14}/> : index + 1}</span><strong>{label}</strong></li>)}</ol></section> : null}
    <div className={o.detailLayout}><div className={o.content}>
      <section aria-label="Itens comprados"><div className={o.sectionHeading}><h2>Itens do pedido</h2><small>{order.items.length} {order.items.length === 1 ? "item" : "itens"}</small></div><div className={o.itemList}>{order.items.map(item => {
        const image = products.find(product => product.id === item.productId)?.imageUrl;
        return <article className={o.item} key={item.id}><span className={o.thumbnail}>{image ? <img src={image} alt="" loading="lazy" width={60} height={60}/> : <Package size={23}/>}</span><div className={o.itemText}><h3>{item.name}</h3>{item.artworkName ? <p>Arte: {item.artworkName}</p> : null}<small>{item.quantity} un. × {storeMoney(item.unitCents)}</small></div><strong className={o.itemTotal}>{storeMoney(item.totalCents)}</strong></article>;
      })}</div></section>
      <section className={o.delivery} aria-label="Entrega e prazos"><h2><Truck size={18}/>{order.delivery === "pickup" ? "Retirada na loja" : "Entrega do pedido"}</h2><p>{order.delivery === "pickup" ? "Retirada pessoalmente, conforme combinado com a loja." : order.shippingOption?.name || "Entrega conforme combinado com a loja."}</p>
        {order.address ? <p className={o.destination}>{order.address.name} · {order.address.city}/{order.address.state}{order.address.attention ? ` · Aos cuidados de ${order.address.attention}` : ""}</p> : null}
        {!test && order.production ? <><div className={o.leadTime}><span>Produção<strong>{order.production.productionDays} dias úteis</strong></span><span>{order.delivery === "pickup" ? "Recebimento" : "Transporte"}<strong>{order.delivery === "pickup" ? "Retirada na loja" : order.production.transportDays !== null ? `${order.production.transportDays} dias úteis` : "A confirmar"}</strong></span></div>{order.production.deliveryDate ? <p className={o.estimate}>{order.delivery === "pickup" ? "Retirada" : "Recebimento"} estimado: <strong>{formatDeliveryDate(order.production.deliveryDate)}</strong></p> : null}<p className={o.small}>Previsão registrada na criação do pedido. A produção depende do pagamento e da aprovação das artes; confirmações posteriores podem alterar essa data.</p></> : null}
      </section>
      <CommerceOrderArtworks key={order.id} endpoint={`${api}/orders/${order.id}/artworks`}/>
      <details className={o.details}><summary><UserRound size={17}/>Dados de faturamento e recebimento</summary><StoreOrderContactDetails billing={order.billing} address={order.address} same={order.deliveryAddressSameAsBilling} shippingOption={order.shippingOption}/></details>
      {order.hasTerms ? <section className={o.terms}><h2>Condições desta compra</h2><p className={o.small}>Documento registrado na compra{order.termsVersion ? ` · versão ${order.termsVersion}` : ""}.</p><a href={`${api}/orders/${order.id}/conditions`} className={styles.secondary}><Download size={16}/>Baixar condições aceitas</a></section> : null}
    </div><aside className={o.financial} aria-label="Resumo financeiro do pedido"><h2>Resumo do pedido</h2><StoreOrderSummary subtotal={order.subtotal_cents} shipping={order.shipping_cents} artworkDiscountCents={order.artworkDiscountCents}/><div id={paymentId} className={o.paymentArea}>
      {pending ? order.provider === "mercado_pago" ? <StorePayment key={order.id} api={api} orderId={order.id} onConfirmed={onRefresh} analyticsPayload={test ? undefined : analyticsCommercePayload(order.items)}/> : <section aria-label="Orientações de pagamento"><h2><CreditCard size={17}/>Como pagar</h2><p className={o.instructions}>{instructions || "Entre em contato com a loja para combinar a forma de pagamento."}</p><small className={o.small}>A situação será atualizada após a confirmação pela loja.</small></section> : <p className={o.paymentResult} data-status={order.payment_status}>{buyerPaymentLabel(order.payment_status)}</p>}
    </div></aside></div>
  </div>;
}
