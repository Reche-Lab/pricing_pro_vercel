import { NextResponse } from "next/server";
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
    const payload = buildOlistSalesOrderPayload({ quote: loaded.detail.quote, items: loaded.detail.items });
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
