import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { createPublicQuoteLink } from "@/repositories/quotes";
import { logAgentAudit } from "@/repositories/agent";
import { withAgentAuth } from "../../../_shared";

const schema = z.object({});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return Response.json({ ok: false, error: { code: "invalid_quote_id", message: "ID de orçamento inválido." } }, { status: 400 });
  }

  return withAgentAuth(
    request,
    "quotes:public_link",
    (body) => {
      const parsed = schema.safeParse(body ?? {});
      if (!parsed.success) return {};
      return parsed.data;
    },
    async ({ context: agentContext }) => {
      const result = await createPublicQuoteLink(agentContext.actorUserId, agentContext.tenantId, quoteId);
      const url = `${getServerEnv().APP_URL.replace(/\/$/, "")}/q/${result.token}`;
      await logAgentAudit(agentContext, "agent.quotes.public_link", { quoteId, validDays: 3 });
      return {
        body: {
          ok: true,
          url,
          pdfUrl: `${url}/pdf`,
          expiresAt: result.expiresAt
        }
      };
    },
    { idempotent: true }
  );
}
