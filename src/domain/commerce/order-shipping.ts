import { z } from "zod";
import { CommerceError } from "./commerce";

export const shippingVolumeSchema = z.object({
  width: z.number().positive().max(1000), height: z.number().positive().max(1000),
  length: z.number().positive().max(1000), weight: z.number().positive().max(1000),
  insurance: z.number().nonnegative().max(1000000).optional(),
});
export const carrierSnapshotSchema = z.object({
  originPostalCode: z.string().regex(/^\d{8}$/),
  destinationPostalCode: z.string().regex(/^\d{8}$/),
  volumes: z.array(shippingVolumeSchema).min(1).max(50),
  insuranceValueCents: z.number().int().nonnegative().max(100000000),
});
export type CarrierSnapshot = z.infer<typeof carrierSnapshotSchema>;
export type ShipmentParcel = {
  id: string; tenant_id: string; shipment_id: string; parcel_index: number; provider_id: string | null;
  status: string; price_cents: number | null; snapshot: Record<string, unknown>;
  tracking_code: string | null; tracking_url: string | null; label_url: string | null;
};
export type OrderShipment = {
  id: string; tenant_id: string; order_id: string; connection_id: string; service_code: string; service_name: string;
  status: string; quoted_cents: number; purchase_cents: number | null;
  purchase_attempted_at: string | Date | null;
  snapshot: { carrier?: CarrierSnapshot; invoiceKey?: string; senderStateRegister?: string; review?: ShippingReview };
  tracking_code: string | null; tracking_url: string | null; label_url: string | null;
  production_ready_at: string | Date | null; posted_at: string | Date | null; delivered_at: string | Date | null;
  operation: string | null; operation_token: string | null; last_error: string | null; updated_at: string | Date;
  parcels: ShipmentParcel[];
};
export type ShippingReview = {
  serviceName: string; contractedCents: number; currentCents: number; changed: boolean;
  sender: { name: string; postalCode: string };
  recipient: { name: string; document: string; phone: string; postalCode: string; address: string; number: string; complement: string; district: string; city: string; state: string };
  volumes: Array<z.infer<typeof shippingVolumeSchema>>;
  warnings: string[];
};
export const orderShippingActionSchema = z.object({
  action: z.enum(["review", "cart", "checkout", "generate", "print", "refresh", "retry_notifications"]),
  invoiceKey: z.string().trim().regex(/^\d{44}$/, "Informe os 44 dígitos da chave da nota fiscal.").optional(),
  senderStateRegister: z.string().trim().min(2).max(30).optional(),
  productionReady: z.boolean().optional(), acceptCostChange: z.boolean().optional(),
  expectedCostCents: z.number().int().nonnegative().max(100000000).optional(),
}).strict();
export type OrderShippingAction = z.infer<typeof orderShippingActionSchema>;

export function shippingEligibility(order: { payment_status: string; fulfillment_status: string; payment_environment?: string; cancelled_at?: unknown; deleted_at?: unknown; snapshot: { delivery: string; shippingOption?: { id: string } | null } }) {
  const reason = order.deleted_at || order.cancelled_at ? "Este pedido foi encerrado. Não emita uma nova etiqueta."
    : order.payment_environment === "test" ? "Pedidos de teste não permitem comprar etiquetas reais."
    : order.payment_status !== "paid" ? "Aguarde a confirmação do pagamento."
    : order.snapshot.delivery === "pickup" ? "Este pedido foi contratado para retirada na loja."
    : !/^melhor_envio:[1-9]\d*$/.test(order.snapshot.shippingOption?.id ?? "") ? "Este pedido não possui frete Melhor Envio contratado."
    : !["production", "shipped", "completed"].includes(order.fulfillment_status) ? "Inicie e conclua a produção antes de preparar o envio." : null;
  return { eligible: !reason, reason };
}
const shippingLabels: Record<string, string> = { quoted: "Envio em conferência", cart: "Etiqueta no carrinho", purchased: "Etiqueta comprada", label_ready: "Etiqueta pronta para impressão", posted: "Pedido postado", delivered: "Pedido entregue", exception: "A entrega precisa de atenção", cancelled: "Etiqueta cancelada", review: "Confira o envio antes de continuar" };
export const shippingStatusLabel = (status: string) => Object.hasOwn(shippingLabels, status) ? shippingLabels[status] : "Envio em atualização";
const rank: Record<string, number> = { quoted: 0, cart: 1, purchased: 2, label_ready: 3, posted: 4, delivered: 5 };
export function normalizedShipmentStatus(order: Record<string, unknown>) {
  const status = String(order.status ?? "");
  if (order.delivered_at || status === "delivered") return "delivered";
  if (["undelivered", "paused", "suspended"].includes(status)) return "exception";
  if (order.canceled_at || order.cancelled_at || ["cancelled", "canceled"].includes(status)) return "cancelled";
  if (order.posted_at || status === "posted") return "posted";
  if (order.generated_at || status === "generated") return "label_ready";
  if (order.paid_at || ["released", "paid"].includes(status)) return "purchased";
  return "cart";
}
export function nextShipmentStatus(current: string, candidate: string) {
  if (current === "delivered" || current === "cancelled") return current;
  if (["exception", "cancelled"].includes(candidate)) return candidate;
  return current === "exception" || current === "review" || (rank[candidate] ?? -1) >= (rank[current] ?? -1) ? candidate : current;
}
export function aggregateShipmentStatus(statuses: string[]) {
  if (!statuses.length) return "quoted";
  if (statuses.includes("cancelled")) return "review";
  if (statuses.includes("exception")) return "exception";
  return statuses.reduce((first, next) => (rank[next] ?? 0) < (rank[first] ?? 0) ? next : first);
}
export function safeShippingUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
export function assertShippingCost(current: number, contracted: number, input: Pick<OrderShippingAction, "expectedCostCents" | "acceptCostChange">) {
  if (input.expectedCostCents !== current) throw new CommerceError("O custo da etiqueta mudou ou não foi conferido. Atualize a conferência antes de continuar.", 409);
  if (current !== contracted && !input.acceptCostChange) throw new CommerceError("Confirme a diferença entre o frete contratado e o custo atual da etiqueta. O cliente não será cobrado novamente.", 409);
}
export function trackingValue(value: unknown) { return typeof value === "string" && /^[a-zA-Z0-9._-]{3,100}$/.test(value) ? value : null; }
