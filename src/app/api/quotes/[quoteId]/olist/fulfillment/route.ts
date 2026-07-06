import { NextResponse } from "next/server";
import { z } from "zod";
import { markQuoteOlistFulfillment } from "@/repositories/quotes";
import { listQuoteShipments, type ShipmentRow } from "@/repositories/shipments";
import { loadQuoteOlistContext, olistOperationErrorResponse } from "../_shared";

const fulfillmentSchema = z.object({
  note: z.string().trim().max(1000).optional().nullable(),
  responsibleExternalId: z.string().trim().max(50).optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => ({}));
  const parsed = fulfillmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dados de expedição inválidos." }, { status: 400 });
  }

  const orderId = loaded.detail.quote.external_olist_order_id;
  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Gere o pedido de venda Olist antes de enviar para expedição." },
      { status: 409 }
    );
  }

  try {
    const shipments = await listQuoteShipments(loaded.session.userId, loaded.session.tenantId, quoteId);
    const shipment = selectBestMelhorEnvioShipment(shipments);
    console.info("Olist fulfillment stage started.", {
      provider: "olist",
      operation: "sales_orders.fulfillment.mark_ready",
      quoteId,
      orderId,
      note: parsed.data.note,
      responsibleExternalId: parsed.data.responsibleExternalId,
      shipment: shipment ? summarizeShipment(shipment) : null
    });

    const result = await markQuoteOlistFulfillment(loaded.session.userId, loaded.session.tenantId, quoteId, {
      orderId,
      note: parsed.data.note,
      responsibleExternalId: parsed.data.responsibleExternalId,
      shipment: shipment ? summarizeShipment(shipment) : null
    });

    console.info("Olist fulfillment stage completed.", {
      quoteId,
      orderId,
      status: result?.external_olist_fulfillment_status,
      sentAt: result?.external_olist_fulfillment_sent_at
    });

    return NextResponse.json({
      ok: true,
      fulfillmentStatus: result?.external_olist_fulfillment_status ?? "sent_to_fulfillment",
      sentAt: result?.external_olist_fulfillment_sent_at ?? null,
      shipment: shipment ? summarizeShipment(shipment) : null,
      message: "Pedido marcado como pronto para expedição. A próxima etapa é comprar/gerar a etiqueta de envio."
    });
  } catch (error) {
    console.error("Olist fulfillment route failed.", {
      quoteId,
      orderId,
      message: error instanceof Error ? error.message : "Unknown fulfillment error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(olistOperationErrorResponse(error, "Falha ao enviar o pedido para expedição."), { status: 502 });
  }
}

function selectBestMelhorEnvioShipment(shipments: ShipmentRow[]) {
  const priority = new Map([
    ["printed", 6],
    ["label_generated", 5],
    ["paid", 4],
    ["cart", 3],
    ["quoted", 2],
    ["error", 1]
  ]);

  return shipments
    .filter((shipment) => shipment.provider === "melhor_envio")
    .sort((a, b) => (priority.get(b.status) ?? 0) - (priority.get(a.status) ?? 0))[0] ?? null;
}

function summarizeShipment(shipment: ShipmentRow) {
  return {
    id: shipment.id,
    provider: shipment.provider,
    status: shipment.status,
    serviceName: shipment.service_name,
    serviceCode: shipment.service_code,
    shippingAmount: shipment.shipping_amount,
    trackingCode: shipment.tracking_code,
    labelUrl: shipment.label_url,
    package: shipment.packaging_snapshot ? {
      boxName: shipment.packaging_snapshot.box.name,
      widthCm: shipment.packaging_snapshot.box.widthCm,
      lengthCm: shipment.packaging_snapshot.box.lengthCm,
      heightCm: shipment.packaging_snapshot.box.heightCm,
      grossWeightKg: shipment.packaging_snapshot.grossWeightKg,
      boxesNeeded: shipment.packaging_snapshot.boxesNeeded
    } : null
  };
}
