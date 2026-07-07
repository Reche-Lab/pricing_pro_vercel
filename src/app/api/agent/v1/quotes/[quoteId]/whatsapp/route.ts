import { z } from "zod";
import { buildQuoteWhatsAppText } from "@/domain/whatsapp/quote";
import { getQuoteDetail } from "@/repositories/quotes";
import { logAgentAudit } from "@/repositories/agent";
import { withAgentAuthGet } from "../../../_shared";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) {
    return Response.json({ ok: false, error: { code: "invalid_quote_id", message: "ID de orçamento inválido." } }, { status: 400 });
  }

  return withAgentAuthGet(request, "quotes:whatsapp", async (agentContext) => {
    const detail = await getQuoteDetail(agentContext.actorUserId, agentContext.tenantId, quoteId);
    if (!detail) {
      return {
        status: 404,
        body: { ok: false, error: { code: "quote_not_found", message: "Orçamento não encontrado." } }
      };
    }
    await logAgentAudit(agentContext, "agent.quotes.whatsapp", { quoteId });
    return {
      body: {
        ok: true,
        text: buildQuoteWhatsAppText({ quote: detail.quote, items: detail.items })
      }
    };
  });
}
