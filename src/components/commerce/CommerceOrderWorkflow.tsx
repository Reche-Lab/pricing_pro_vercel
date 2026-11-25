"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleAlert, Copy, ExternalLink, Loader2, Printer } from "lucide-react";
import { orderProgress, type OrderOlistProgress } from "@/domain/commerce/order-progress";
import type { OrderWorkspaceItem } from "@/domain/commerce/order-workflow";
import { safeShippingUrl } from "@/domain/commerce/order-shipping";
import { formatDeliveryDate } from "@/domain/shipping/production-lead-time";
import { OLIST_CONNECTED_EVENT } from "@/lib/olist/browser-request";
import { CommerceOrderProduction } from "./CommerceOrderProduction";
import { CommerceOrderOlist } from "./CommerceOrderOlist";
import { CommerceOrderShipping, type CommerceOrderShippingState } from "./CommerceOrderShipping";
import { storeMoney } from "./store-http";
import s from "./order-progress.module.css";

export function CommerceOrderWorkflow({ order, canManage, initialOlist, pickup, melhorEnvio, deliveryDate, shippingBlockedReason, children, summary }: {
  order: OrderWorkspaceItem; canManage: boolean; initialOlist: OrderOlistProgress;
  pickup: boolean; melhorEnvio: boolean; deliveryDate?: string | null; shippingBlockedReason: string | null;
  children: React.ReactNode; summary: React.ReactNode;
}) {
  const router = useRouter();
  const [olist, setOlist] = useState(initialOlist), [shipping, setShipping] = useState<CommerceOrderShippingState | null>(null);
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null), [copied, setCopied] = useState("");
  const [shippingReadError, setShippingReadError] = useState("");
  const [reconnectedAttempt, setReconnectedAttempt] = useState<string | null>(null);
  const lastCarrierStatus = useRef<string | null>(null);
  useEffect(() => { setOlist(initialOlist); }, [initialOlist]);
  const updateOlist = useCallback((state: OrderOlistProgress) => setOlist(state), []);
  const updateShipping = useCallback((state: CommerceOrderShippingState) => setShipping(state), []);
  useEffect(() => {
    const connected = () => { if (olist.job?.error_code === "olist_oauth_invalid") setReconnectedAttempt(olist.job.debug_id ?? order.id); };
    window.addEventListener(OLIST_CONNECTED_EVENT, connected);
    return () => window.removeEventListener(OLIST_CONNECTED_EVENT, connected);
  }, [olist.job?.error_code, olist.job?.debug_id, order.id]);
  const carrierStatus = shipping?.shipping?.status;
  useEffect(() => {
    if (carrierStatus && carrierStatus !== lastCarrierStatus.current && ["posted", "delivered"].includes(carrierStatus)) router.refresh();
    lastCarrierStatus.current = carrierStatus ?? null;
  }, [carrierStatus, router]);
  const connectionRestored = olist.job?.error_code === "olist_oauth_invalid" && reconnectedAttempt === (olist.job.debug_id ?? order.id);
  const presentationOlist = connectionRestored && olist.job ? { ...olist, job: { ...olist.job, error_code: null } } : olist;
  const derived = orderProgress({ order, olist: presentationOlist, shipping, pickup, melhorEnvio });
  const progress = derived.stage === "shipping" && shippingReadError ? { ...derived, title: "Não foi possível consultar o envio", description: shippingReadError, owner: "shipping" as const }
    : connectionRestored && derived.owner === "olist" ? { ...derived, title: "Conexão restabelecida", description: "Confira e retome a integração a partir da etapa pendente. Nenhuma operação foi reenviada automaticamente." } : derived;
  const job = olist.job;
  const invoiceLink = progress.authorized ? safeShippingUrl(job?.invoice_link) : null;
  const labelLink = safeShippingUrl(shipping?.shipping?.label_url);
  const trackingLink = safeShippingUrl(shipping?.shipping?.tracking_url || job?.tracking_url);
  const trackingCode = shipping?.shipping?.tracking_code || job?.tracking_code;
  const automatic = !progress.owner && ["production", "fiscal", "shipping"].includes(progress.stage) && order.payment_status === "paid" && !order.cancelled_at && order.payment_environment !== "test";
  return <div className={s.workspace}>
    <section className={s.overview} aria-label="Andamento e próxima ação do pedido">
      <div className={s.identity}><div><span className={s.eyebrow}>Gestão do pedido</span><h2>{order.customer_name}</h2><p>{order.item_count} {order.item_count === 1 ? "item" : "itens"} · {storeMoney(order.total_cents)}</p></div><div className={s.facts}><span data-paid={order.payment_status === "paid"}>{order.payment_status === "paid" ? <Check size={15}/> : <CircleAlert size={15}/>}{order.payment_status === "paid" ? "Pagamento do cliente confirmado" : order.payment_status === "refunded" ? "Pagamento estornado" : "Pagamento não confirmado"}</span>{deliveryDate ? <small>{pickup ? "Retirada" : "Entrega"} estimada: <strong>{formatDeliveryDate(deliveryDate)}</strong></small> : null}</div></div>
      <ol className={s.steps} aria-label="Etapas do pedido">{progress.steps.map((step, index) => <li key={step.key} data-done={step.done} aria-current={step.key === progress.stage && !step.done ? "step" : undefined}><span>{step.done ? <Check size={15} aria-hidden="true"/> : index + 1}</span><div><strong>{step.label}</strong><small>{step.done ? step.optional ? "Não se aplica" : "Concluída" : step.key === progress.stage ? "Etapa atual" : "Aguardando"}</small></div></li>)}</ol>
      <div className={s.next}>
        <div><span className={s.eyebrow}>{automatic ? "Processamento automático" : progress.owner ? "Próximo passo" : "Situação do pedido"}</span><h3>{progress.title}</h3><p>{progress.description}</p>{olist.job?.last_error ? <a href="#pedido-integracoes" className={s.issue}><CircleAlert size={15}/>Conferir pendência da integração</a> : null}</div>
        <div className={s.nextAction} ref={setActionTarget}>{progress.owner === "artworks" ? <a className={s.primary} href="#pedido-artes">Conferir artes<ArrowRight size={16}/></a> : automatic ? <span role="status" className={s.processing}><Loader2 size={16}/>Aguardando confirmação</span> : null}{!canManage && progress.owner && progress.owner !== "artworks" ? <span className={s.readOnly}>Somente leitura. A equipe responsável pode continuar.</span> : null}</div>
      </div>
      {invoiceLink || labelLink || trackingLink || trackingCode ? <nav className={s.documents} aria-label="Documentos e rastreamento do pedido">
        {invoiceLink ? <a href={invoiceLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Nota fiscal</a> : null}
        {labelLink && canManage ? <a href={labelLink} target="_blank" rel="noopener noreferrer"><Printer size={16}/>Imprimir etiqueta</a> : null}
        {trackingLink ? <a href={trackingLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Acompanhar entrega</a> : null}
        {trackingCode ? <button type="button" title="Copiar código de rastreamento" onClick={async () => { try { await navigator.clipboard.writeText(trackingCode); setCopied("Código copiado."); } catch { setCopied(`Copie o código: ${trackingCode}`); } }}><Copy size={15}/>{trackingCode}</button> : null}
        {copied ? <span role="status">{copied}</span> : null}
      </nav> : null}
    </section>
    <div className={s.layout}><div className={s.content}>
      <CommerceOrderProduction order={order} canManage={canManage} shippingBlockedReason={shippingBlockedReason} guided pickup={pickup} actionTarget={progress.owner === "production" ? actionTarget : null}/>
      <div id="pedido-artes" className={s.anchor}>{children}</div>
      {olist.configured ? <div id="pedido-integracoes" className={s.anchor}><CommerceOrderOlist orderId={order.id} canManage={canManage} paid={order.payment_status === "paid" && !order.cancelled_at} production={order.fulfillment_status === "production"} test={order.payment_environment === "test"} pickup={pickup} onStateChange={updateOlist} guided={{ target: progress.owner === "olist" ? actionTarget : null, action: progress.olistAction }}/></div> : null}
      {melhorEnvio && !pickup ? <details className={s.shipping} open={progress.owner === "shipping" || Boolean(shipping?.shipping?.last_error)}><summary>Preparação do envio · Melhor Envio</summary><CommerceOrderShipping orderId={order.id} canManage={canManage} guided actionTarget={progress.owner === "shipping" ? actionTarget : null} onStateChange={updateShipping} onReadError={setShippingReadError}/></details> : null}
    </div><aside className={s.summary}>{summary}</aside></div>
  </div>;
}
