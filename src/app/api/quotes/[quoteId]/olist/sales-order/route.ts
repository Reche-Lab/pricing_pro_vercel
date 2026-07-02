import { NextResponse } from "next/server";
import { updateQuoteExternalOlistIds } from "@/repositories/quotes";
import { buildOlistSalesOrderPayload, missingOlistSkus } from "@/services/olist/payloads";
import { loadQuoteOlistContext, sendOlistQuoteOperation } from "../_shared";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const path = loaded.settings.sales_order_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist sales order path is not configured." }, { status: 409 });
  const missingSkus = missingOlistSkus(loaded.detail.items);
  if (missingSkus.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Todos os itens do orçamento precisam ter SKU antes de gerar pedido Olist.", missingSkus },
      { status: 409 }
    );
  }

  const payload = buildOlistSalesOrderPayload({ quote: loaded.detail.quote, items: loaded.detail.items });
  try {
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
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Olist error" },
      { status: 502 }
    );
  }
}
