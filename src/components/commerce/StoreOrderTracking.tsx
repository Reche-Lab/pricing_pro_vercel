"use client";

import React, { useId, useState } from "react";
import { Check, Copy, ExternalLink, Truck } from "lucide-react";
import o from "./buyer-orders.module.css";

export type StoreOrderTrackingShipping = {
  status: string;
  serviceName: string;
  trackingCode: string | null;
  trackingUrl: string | null;
  postedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string | null;
  events: Array<{ status: string; occurredAt: string; description: string }>;
  parcels?: Array<{ id: string; status: string; trackingCode: string | null; trackingUrl: string | null }>;
};

const statusLabels: Record<string, string> = {
  quoted: "Envio em conferência",
  cart: "Envio em preparação",
  purchased: "Envio em preparação",
  review: "Envio em conferência",
  pending: "Envio em preparação",
  preparing: "Envio em preparação",
  label_ready: "Aguardando postagem",
  awaiting_tracking: "Aguardando rastreamento",
  posted: "Postado",
  shipped: "Enviado",
  in_transit: "Em transporte",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  exception: "Entrega com ocorrência",
  delivery_failed: "Tentativa de entrega",
  returned: "Devolvido ao remetente",
  cancelled: "Envio cancelado",
};
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function statusLabel(status: string, fallback: string) {
  return Object.hasOwn(statusLabels, status) ? statusLabels[status] : fallback;
}

function trackingDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? <time dateTime={value}>{dateFormat.format(date)}</time>
    : <span>Data não disponível</span>;
}

function carrierUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function TrackingActions({ trackingCode, trackingUrl, volume }: {
  trackingCode: string | null;
  trackingUrl: string | null;
  volume?: number;
}) {
  const [copying, setCopying] = useState(false);
  const [feedback, setFeedback] = useState<{ code: string; success: boolean } | null>(null);
  const code = trackingCode?.trim() || null;
  const url = carrierUrl(trackingUrl);
  const currentFeedback = feedback?.code === code ? feedback : null;
  const copyLabel = volume ? `Copiar código de rastreamento do volume ${volume}` : "Copiar código de rastreamento";

  async function copyCode() {
    if (!code) return;
    setCopying(true);
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(code);
      setFeedback({ code, success: true });
    } catch { setFeedback({ code, success: false }); }
    finally { setCopying(false); }
  }

  return <>
    {code || url ? <div className={o.trackingActions}>
      {code ? <div className={o.trackingCode}>
        <span>Código de rastreamento</span>
        <div><code>{code}</code><button type="button" className={o.trackingCopy} aria-label={copyLabel} title={copyLabel} disabled={copying} onClick={() => void copyCode()}>
          {currentFeedback?.success ? <Check size={17} aria-hidden="true"/> : <Copy size={17} aria-hidden="true"/>}
        </button></div>
      </div> : null}
      {url ? <a className={o.trackingLink} href={url} target="_blank" rel="noopener noreferrer">{volume ? `Acompanhar volume ${volume} na transportadora` : "Acompanhar na transportadora"}<ExternalLink size={15} aria-hidden="true"/></a> : null}
    </div> : volume ? <p className={o.trackingMessage}>O rastreamento deste volume ainda não está disponível.</p> : null}
    <p className={o.trackingFeedback} role="status" aria-live="polite">{currentFeedback
      ? currentFeedback.success ? "Código copiado." : "Não foi possível copiar. Selecione o código e copie manualmente."
      : ""}</p>
  </>;
}

export function StoreOrderTracking({ shipping, compact = false }: {
  shipping: StoreOrderTrackingShipping | null;
  compact?: boolean;
}) {
  const headingId = useId();
  if (!shipping) return null;

  const parcels = shipping.parcels && shipping.parcels.length > 1 ? shipping.parcels : null;
  const hasTracking = (parcels ?? [shipping]).some(parcel => parcel.trackingCode?.trim() || carrierUrl(parcel.trackingUrl));
  const events = [...shipping.events].sort((a, b) => {
    const first = Date.parse(a.occurredAt), second = Date.parse(b.occurredAt);
    if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : 0;
    return Number.isFinite(second) ? second - first : -1;
  });
  const visibleEvents = compact ? events.slice(0, 1) : events;
  const message = shipping.status === "label_ready"
    ? "A etiqueta está pronta, mas a postagem ainda não foi confirmada pela transportadora."
    : shipping.status === "awaiting_tracking"
      ? hasTracking
        ? "Aguardando novas movimentações da transportadora. O rastreamento pode levar algum tempo para ser atualizado."
        : "Aguardando o rastreamento da transportadora. O código e as movimentações aparecerão aqui quando estiverem disponíveis."
      : !hasTracking && shipping.status !== "delivered" && shipping.status !== "cancelled"
        ? "O rastreamento ainda não está disponível. Aguarde a atualização da transportadora."
        : null;

  return <section className={o.tracking} data-compact={compact} aria-labelledby={headingId}>
    <header className={o.trackingHeader}>
      <h2 id={headingId}><Truck size={18} aria-hidden="true"/>Rastreamento da entrega</h2>
      <span className={o.trackingStatus}>{statusLabel(shipping.status, "Envio em atualização")}</span>
    </header>
    {shipping.serviceName.trim() ? <p className={o.trackingService}>{shipping.serviceName}</p> : null}
    {message ? <p className={o.trackingMessage}>{message}</p> : null}
    {parcels ? parcels.map((parcel, index) => <div key={parcel.id} className={o.trackingHistory} role="group" aria-label={`Volume ${index + 1}`}>
      <div className={o.trackingHeader}><h3 className={o.trackingService}>Volume {index + 1}</h3><span className={o.trackingStatus}>{statusLabel(parcel.status, "Envio em atualização")}</span></div>
      <TrackingActions trackingCode={parcel.trackingCode} trackingUrl={parcel.trackingUrl} volume={index + 1}/>
    </div>) : <TrackingActions trackingCode={shipping.trackingCode} trackingUrl={shipping.trackingUrl}/>}
    {shipping.postedAt || shipping.deliveredAt || shipping.updatedAt ? <dl className={o.trackingDates}>
      {shipping.postedAt ? <div><dt>Postagem confirmada</dt><dd>{trackingDate(shipping.postedAt)}</dd></div> : null}
      {shipping.deliveredAt ? <div><dt>Entrega confirmada</dt><dd>{trackingDate(shipping.deliveredAt)}</dd></div> : null}
      {shipping.updatedAt ? <div><dt>Última atualização</dt><dd>{trackingDate(shipping.updatedAt)}</dd></div> : null}
    </dl> : null}
    {visibleEvents.length ? <div className={o.trackingHistory}>
      <h3>{compact ? "Última ocorrência" : "Histórico da entrega"}</h3>
      <ol className={o.trackingEvents}>{visibleEvents.map((event, index) => <li key={`${event.occurredAt}:${event.status}:${index}`}>
        <strong>{statusLabel(event.status, "Atualização da entrega")}</strong>
        <span>{trackingDate(event.occurredAt)}</span>
        {event.description.trim() ? <p>{event.description}</p> : null}
      </li>)}</ol>
    </div> : <p className={o.trackingEmpty}>Ainda não há movimentações registradas pela transportadora.</p>}
  </section>;
}
