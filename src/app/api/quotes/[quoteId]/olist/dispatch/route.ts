import { NextResponse } from "next/server";
import { listQuoteShipments, type ShipmentRow } from "@/repositories/shipments";
import { buildOlistSalesOrderDispatchPayload } from "@/services/olist/payloads";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../_shared";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const orderId = loaded.detail.quote.external_olist_order_id;
  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Gere o pedido de venda Olist antes de atualizar despacho/rastreio." },
      { status: 409 }
    );
  }

  const pathTemplate = loaded.settings.sales_order_dispatch_path || OLIST_DEFAULT_PATHS.salesOrderDispatch;
  const path = replacePathTokens(pathTemplate, { idPedido: orderId });
  if ("error" in path) return NextResponse.json({ ok: false, error: path.error }, { status: 409 });

  try {
    const shipments = await listQuoteShipments(loaded.session.userId, loaded.session.tenantId, quoteId);
    const shipment = selectBestMelhorEnvioShipment(shipments);
    if (!shipment) {
      return NextResponse.json(
        { ok: false, error: "Não há frete Melhor Envio vinculado a este orçamento para atualizar no pedido Olist." },
        { status: 409 }
      );
    }

    const payload = buildOlistSalesOrderDispatchPayload({
      quote: loaded.detail.quote,
      shipment,
      settings: loaded.settings
    });

    console.info("Olist sales order dispatch payload built.", {
      quoteId,
      orderId,
      path: path.value,
      shipmentId: shipment.id,
      shipmentStatus: shipment.status,
      serviceName: shipment.service_name,
      serviceCode: shipment.service_code,
      trackingCode: shipment.tracking_code,
      payload
    });

    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "sales_orders.dispatch.update",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path: path.value,
      method: "PUT",
      payload
    });

    return NextResponse.json({
      ...result,
      message: "Dados de transporte, volumes e rastreio enviados ao pedido Olist.",
      shipment: summarizeShipment(shipment)
    });
  } catch (error) {
    console.error("Olist sales order dispatch route failed.", {
      quoteId,
      orderId,
      message: error instanceof Error ? error.message : "Unknown dispatch update error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(olistOperationErrorResponse(error, "Falha ao atualizar despacho/rastreio no pedido Olist."), { status: 502 });
  }
}

function selectBestMelhorEnvioShipment(shipments: ShipmentRow[]) {
  const priority = new Map([
    ["posted", 8],
    ["printed", 7],
    ["label_generated", 6],
    ["paid", 5],
    ["cart", 4],
    ["quoted", 3],
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
      netWeightKg: shipment.packaging_snapshot.netWeightKg,
      boxesNeeded: shipment.packaging_snapshot.boxesNeeded
    } : null
  };
}

function replacePathTokens(template: string, values: Record<string, string | null | undefined>) {
  if (!template) return { error: "Olist dispatch path is not configured." } as const;
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    if (!output.includes(`{${key}}`)) continue;
    if (!value) return { error: `Olist path requires ${key}, but it is not available yet.` } as const;
    output = output.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return { value: output } as const;
}
