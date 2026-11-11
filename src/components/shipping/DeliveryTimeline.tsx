import React from "react";
import { CalendarDays, PackageCheck, Truck } from "lucide-react";
import { deliveryEstimate, formatDeliveryDate, type ProductionSettings } from "@/domain/shipping/production-lead-time";

export function DeliveryTimeline({ quantity, transportDays = null, settings, pickup = false, compact = false }: {
  quantity: number; transportDays?: number | null; settings?: ProductionSettings; pickup?: boolean; compact?: boolean;
}) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
  const estimate = deliveryEstimate(quantity, pickup ? 0 : transportDays, settings);
  return <div className="my-3 min-w-0 space-y-2 rounded-md border border-current/15 px-3 py-3 text-sm" aria-label="Produção e previsão de entrega">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
      <span className="inline-flex items-center gap-1.5"><PackageCheck size={15}/>Produção: <strong>{estimate.productionDays} dias úteis</strong></span>
      {!pickup ? <span className="inline-flex items-center gap-1.5"><Truck size={15}/>Transporte: <strong>{estimate.transportDays === null ? "a confirmar" : `${estimate.transportDays} dias úteis`}</strong></span> : null}
    </div>
    <p className="flex flex-wrap items-center gap-2 font-semibold"><CalendarDays size={17}/>{pickup ? "Retirada estimada:" : "Recebimento estimado:"} <span className="text-base">{estimate.deliveryDate ? formatDeliveryDate(estimate.deliveryDate) : "consulte o prazo do transporte"}</span></p>
    {!compact ? <p className="text-xs leading-5 opacity-75">Projeção se pagamento e artes forem confirmados hoje. A produção começa após ambos; não inclui sábados, domingos nem datas sem produção cadastradas. O transporte segue a estimativa do serviço.</p> : null}
  </div>;
}
