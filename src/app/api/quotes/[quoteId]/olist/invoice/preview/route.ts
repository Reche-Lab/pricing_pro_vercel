import { NextResponse } from "next/server";
import { buildOlistInvoiceEmitPayload, buildOlistInvoicePayload, missingOlistSkus } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse } from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const hasInvoice = Boolean(loaded.detail.quote.external_olist_invoice_id);
  const pathTemplate = hasInvoice ? loaded.settings.invoice_emit_path : loaded.settings.invoice_path;
  const path = replacePathTokens(pathTemplate ?? "", {
    idPedido: loaded.detail.quote.external_olist_order_id,
    idNota: loaded.detail.quote.external_olist_invoice_id
  });
  if (!path) return NextResponse.json({ ok: false, error: "Olist invoice path is not configured." }, { status: 409 });
  if ("error" in path) return NextResponse.json({ ok: false, error: path.error }, { status: 409 });

  const missingSkus = missingOlistSkus(loaded.detail.items);
  if (missingSkus.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Todos os itens do orçamento precisam ter ID numérico do produto Olist cadastrado em Produtos antes de gerar nota.",
        missingSkus,
        items: summarizeItems(loaded.detail.items)
      },
      { status: 409 }
    );
  }

  try {
    const payload = hasInvoice
      ? buildOlistInvoiceEmitPayload()
      : buildOlistInvoicePayload({ quote: loaded.detail.quote, items: loaded.detail.items });

    return NextResponse.json({
      ok: true,
      mode: hasInvoice ? "emit" : "create",
      title: hasInvoice ? "Autorizar nota existente" : "Gerar nota fiscal do pedido",
      path: path.value,
      method: "POST",
      quote: {
        id: loaded.detail.quote.id,
        customerName: loaded.detail.quote.customer_name,
        customerExternalOlistId: loaded.detail.quote.customer_external_olist_id,
        externalOlistOrderId: loaded.detail.quote.external_olist_order_id,
        externalOlistInvoiceId: loaded.detail.quote.external_olist_invoice_id,
        shippingTotal: loaded.detail.quote.shipping_total,
        discountTotal: loaded.detail.quote.discount_total,
        grandTotal: loaded.detail.quote.grand_total
      },
      items: summarizeItems(loaded.detail.items),
      payload
    });
  } catch (error) {
    console.error("Olist invoice preview failed.", {
      quoteId,
      message: error instanceof Error ? error.message : "Unknown invoice preview error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(olistOperationErrorResponse(error, "Falha ao montar prévia da nota Olist."), { status: 500 });
  }
}

function summarizeItems(items: Array<{
  id: string;
  description: string;
  sku?: string | null;
  external_olist_product_id?: string | null;
  quantity: number;
  unit_price: string;
  total_price: string;
  artwork_name?: string | null;
}>) {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    sku: item.sku,
    externalOlistProductId: item.external_olist_product_id,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    totalPrice: item.total_price,
    artworkName: item.artwork_name
  }));
}

function replacePathTokens(template: string, values: Record<string, string | null | undefined>) {
  if (!template) return "";
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    if (!output.includes(`{${key}}`)) continue;
    if (!value) return { error: `Olist path requires ${key}, but it is not available yet.` } as const;
    output = output.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return { value: output } as const;
}
