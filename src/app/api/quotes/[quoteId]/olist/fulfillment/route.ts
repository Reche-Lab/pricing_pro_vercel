import { NextResponse } from "next/server";
import { z } from "zod";
import { markQuoteOlistFulfillment } from "@/repositories/quotes";
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
    console.info("Olist fulfillment stage started.", {
      provider: "olist",
      operation: "sales_orders.fulfillment.mark_ready",
      quoteId,
      orderId,
      note: parsed.data.note,
      responsibleExternalId: parsed.data.responsibleExternalId
    });

    const result = await markQuoteOlistFulfillment(loaded.session.userId, loaded.session.tenantId, quoteId, {
      orderId,
      note: parsed.data.note,
      responsibleExternalId: parsed.data.responsibleExternalId
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
