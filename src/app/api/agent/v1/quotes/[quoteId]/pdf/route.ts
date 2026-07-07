import { z } from "zod";
import {
  AgentApiError,
  authenticateAgentApiKey,
  hasAgentScope,
  logAgentAudit
} from "@/repositories/agent";
import { getQuoteDetail } from "@/repositories/quotes";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";
import { agentErrorResponse } from "../../../_shared";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) {
    return agentErrorResponse(new AgentApiError("invalid_quote_id", "ID de orçamento inválido.", 400));
  }

  const token = authorizationToken(request);
  if (!token) return agentErrorResponse(new AgentApiError("unauthorized", "Token de agente ausente.", 401));
  const agentContext = await authenticateAgentApiKey(token);
  if (!agentContext) return agentErrorResponse(new AgentApiError("unauthorized", "Token de agente inválido.", 401));
  if (!hasAgentScope(agentContext, "quotes:pdf")) {
    return agentErrorResponse(new AgentApiError("forbidden_scope", "Escopo obrigatório ausente: quotes:pdf.", 403));
  }

  const [detail, tenant] = await Promise.all([
    getQuoteDetail(agentContext.actorUserId, agentContext.tenantId, quoteId),
    getTenantShippingProfile(agentContext.actorUserId, agentContext.tenantId)
  ]);
  if (!detail) return agentErrorResponse(new AgentApiError("quote_not_found", "Orçamento não encontrado.", 404));

  const pdf = await generateQuotePdf({
    tenantName: agentContext.tenantName,
    tenant,
    quote: detail.quote,
    items: detail.items
  });
  await logAgentAudit(agentContext, "agent.quotes.pdf", { quoteId });

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="orcamento-${quoteId}.pdf"`
    }
  });
}

function authorizationToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}
