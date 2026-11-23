import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { decryptIntegrationCredentials, type IntegrationConnectionRow } from "@/repositories/integrations";
import { isoUnknown, persistShippingParcel } from "@/repositories/commerce-shipping";
import { CommerceError } from "@/domain/commerce/commerce";
import { isProductionCommerceCarrier } from "@/domain/commerce/carrier-settings";
import type { MelhorEnvioCredentials } from "@/services/melhor-envio/types";

const webhookSchema = z.object({ event: z.enum(["order.created", "order.pending", "order.released", "order.generated", "order.received", "order.posted", "order.delivered", "order.cancelled", "order.undelivered", "order.paused", "order.suspended"]),
  data: z.object({ id: z.string().uuid(), tracking: z.unknown().optional(), tracking_url: z.unknown().optional() }).passthrough() }).passthrough();
export function verifyShippingWebhookSignature(raw: Buffer, signature: string | null, secret: string) {
  if (!signature || !secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const supplied = Buffer.from(signature, "base64");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}
export async function receiveShippingWebhook(request: Request) {
  const raw = await boundedWebhookBody(request);
  let json: unknown;
  try { json = JSON.parse(raw.toString("utf8")); } catch { throw new CommerceError("Notificação inválida.", 400); }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) throw new CommerceError("Notificação inválida.", 400);
  const { event, data } = parsed.data;
  const row = (await getPool().query<IntegrationConnectionRow & { tenant_id: string; shipment_id: string; parcel_id: string; order_id: string }>(`select i.id,i.provider,i.status,i.settings,i.credentials_encrypted,s.tenant_id,s.id as shipment_id,p.id as parcel_id,s.order_id
    from commerce_order_shipment_parcels p join commerce_order_shipments s on s.tenant_id=p.tenant_id and s.id=p.shipment_id
    join integration_connections i on i.tenant_id=s.tenant_id and i.id=s.connection_id
    where p.provider_id=$1::uuid`, [data.id])).rows[0];
  // Acknowledge unrelated labels without revealing which IDs belong to a tenant.
  if (!row) return { ignored: true };
  const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(row);
  if (!isProductionCommerceCarrier(row.settings) || !verifyShippingWebhookSignature(raw, request.headers.get("x-me-signature"), credentials.clientSecret ?? "")) throw new CommerceError("Assinatura da notificação inválida.", 401);
  const status = event.slice("order.".length);
  const occurredAt = isoUnknown(data.updated_at) ?? isoUnknown(data[({ released: "paid_at", generated: "generated_at", posted: "posted_at", delivered: "delivered_at", cancelled: "canceled_at" } as Record<string, string>)[status]]) ?? new Date().toISOString();
  const key = `webhook:${data.id}:${createHash("sha256").update(raw).digest("hex")}`;
  const changed = await persistShippingParcel(row.tenant_id, row.shipment_id, row.parcel_id, { ...data, status }, key, occurredAt);
  console.info("Commerce shipping webhook persisted.", { tenantId: row.tenant_id, orderId: row.order_id, shipmentId: row.shipment_id, event, duplicate: !changed });
  return { tenantId: row.tenant_id, orderId: row.order_id, duplicate: !changed };
}
async function boundedWebhookBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError("Notificação vazia.", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 65536) { await reader.cancel(); throw new CommerceError("Notificação muito grande.", 413); }
    parts.push(chunk.value);
  }
  return Buffer.concat(parts);
}
