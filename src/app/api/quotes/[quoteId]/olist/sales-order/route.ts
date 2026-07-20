import { NextResponse } from "next/server";
import { updateQuoteExternalOlistIds } from "@/repositories/quotes";
import { getQuotePaymentTerm } from "@/repositories/olist-payment-options";
import { listQuoteShipments, type ShipmentRow } from "@/repositories/shipments";
import { buildOlistSalesOrderPayload, missingOlistSkus } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../_shared";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const path = loaded.settings.sales_order_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist sales order path is not configured." }, { status: 409 });
  const missingSkus = missingOlistSkus(loaded.detail.items);
  if (missingSkus.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Todos os itens do orçamento precisam ter ID numérico do produto Olist cadastrado em Produtos antes de gerar pedido.",
        missingSkus
      },
      { status: 409 }
    );
  }

  try {
    const shipments = await listQuoteShipments(loaded.session.userId, loaded.session.tenantId, quoteId);
    const paymentTerm = await getQuotePaymentTerm(loaded.session.userId, loaded.session.tenantId, quoteId);
    if (!paymentTerm?.payment_method_external_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Selecione e salve uma forma de pagamento do Olist antes de gerar o pedido de venda.",
          paymentRequired: true,
          paymentTerm
        },
        { status: 409 }
      );
    }
    const melhorEnvioShipment = selectBestMelhorEnvioShipment(shipments);
    const payload = buildOlistSalesOrderPayload({
      quote: loaded.detail.quote,
      items: loaded.detail.items,
      shipment: melhorEnvioShipment,
      paymentTerm
    });
    console.info("Olist sales order payload built.", {
      quoteId,
      path,
      customerExternalOlistId: loaded.detail.quote.customer_external_olist_id,
      itemCount: loaded.detail.items.length,
      shipmentId: melhorEnvioShipment?.id ?? null,
      package: melhorEnvioShipment?.packaging_snapshot ?? null,
      paymentTerm,
      payload
    });
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "sales_orders.create",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path,
      payload
    });
    if (result.externalId) {
      await updateQuoteExternalOlistIds(loaded.session.userId, loaded.session.tenantId, quoteId, {
        orderId: result.externalId
      });
    }
    console.info("Olist sales order route completed.", {
      quoteId,
      externalId: result.externalId,
      debugId: result.debugId
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Olist sales order route failed.", {
      quoteId,
      message: error instanceof Error ? error.message : "Unknown sales order error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist error"), { status: 502 });
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
