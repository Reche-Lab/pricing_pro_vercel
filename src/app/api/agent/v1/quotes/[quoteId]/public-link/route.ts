import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { createPublicQuoteLink } from "@/repositories/quotes";
import { logAgentAudit } from "@/repositories/agent";
import { withAgentAuth } from "../../../_shared";

const schema = z.object({
  validDays: z.number().int().min(1).max(90).default(15)
});

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
      if (!parsed.success) return { validDays: 15 };
      return parsed.data;
    },
    async ({ context: agentContext, body }) => {
      const result = await createPublicQuoteLink(agentContext.actorUserId, agentContext.tenantId, quoteId, body.validDays);
      const url = `${getServerEnv().APP_URL.replace(/\/$/, "")}/q/${result.token}`;
      await logAgentAudit(agentContext, "agent.quotes.public_link", { quoteId, validDays: body.validDays });
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
