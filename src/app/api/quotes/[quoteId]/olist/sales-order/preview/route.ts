import { NextResponse } from "next/server";
import { getQuotePaymentTerm } from "@/repositories/olist-payment-options";
import { listQuoteShipments, type ShipmentRow } from "@/repositories/shipments";
import { buildOlistSalesOrderPayload, missingOlistSkus } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse } from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
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
        missingSkus,
        items: loaded.detail.items.map((item) => ({
          id: item.id,
          description: item.description,
          sku: item.sku,
          externalOlistProductId: item.external_olist_product_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
          artworkName: item.artwork_name
        }))
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
    return NextResponse.json({
      ok: true,
      path,
      method: "POST",
      quote: {
        id: loaded.detail.quote.id,
        customerId: loaded.detail.quote.customer_id,
        customerName: loaded.detail.quote.customer_name,
        customerExternalOlistId: loaded.detail.quote.customer_external_olist_id,
        shippingTotal: loaded.detail.quote.shipping_total,
        discountTotal: loaded.detail.quote.discount_total,
        grandTotal: loaded.detail.quote.grand_total,
        validUntil: loaded.detail.quote.valid_until
      },
      items: loaded.detail.items.map((item) => ({
        id: item.id,
        description: item.description,
        sku: item.sku,
        externalOlistProductId: item.external_olist_product_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        artworkName: item.artwork_name
      })),
      paymentTerm,
      shipment: melhorEnvioShipment ? summarizeShipment(melhorEnvioShipment) : null,
      payload
    });
  } catch (error) {
    console.error("Olist sales order preview failed.", {
      quoteId,
      message: error instanceof Error ? error.message : "Unknown preview error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(olistOperationErrorResponse(error, "Falha ao montar prévia do pedido Olist."), { status: 500 });
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
