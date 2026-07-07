import { z } from "zod";
import { getQuoteDetail } from "@/repositories/quotes";
import { logAgentAudit } from "@/repositories/agent";
import { withAgentAuthGet } from "../../_shared";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) {
    return Response.json({ ok: false, error: { code: "invalid_quote_id", message: "ID de orçamento inválido." } }, { status: 400 });
  }

  return withAgentAuthGet(request, "quotes:read", async (agentContext) => {
    const detail = await getQuoteDetail(agentContext.actorUserId, agentContext.tenantId, quoteId);
    if (!detail) {
      return {
        status: 404,
        body: { ok: false, error: { code: "quote_not_found", message: "Orçamento não encontrado." } }
      };
    }
    await logAgentAudit(agentContext, "agent.quotes.read", { quoteId });
    return {
      body: {
        ok: true,
        quote: {
          id: detail.quote.id,
          status: detail.quote.status,
          customerName: detail.quote.customer_name,
          grandTotal: Number(detail.quote.grand_total),
          shippingTotal: Number(detail.quote.shipping_total),
          validUntil: detail.quote.valid_until
        },
        items: detail.items.map((item) => ({
          description: item.description,
          artworkName: item.artwork_name,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          total: Number(item.total_price)
        }))
      }
    };
  });
}
