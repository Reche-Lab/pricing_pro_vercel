import { NextResponse } from "next/server";
import { z } from "zod";
import { updateQuoteExternalCrmId } from "@/repositories/quotes";
import { buildOlistCrmQuotePayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../_shared";

const crmSubjectSchema = z.object({
  description: z.string().trim().min(3).optional(),
  date: z.string().trim().optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist_crm");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => ({}));
  const parsed = crmSubjectSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const path = loaded.settings.quote_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist CRM quote path is not configured." }, { status: 409 });

  const payload = buildOlistCrmQuotePayload({
    quote: loaded.detail.quote,
    items: loaded.detail.items,
    description: parsed.data.description,
    date: parsed.data.date
  });
  try {
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "crm.quotes.create",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path,
      payload
    });
    if (result.externalId) {
      await updateQuoteExternalCrmId(loaded.session.userId, loaded.session.tenantId, quoteId, result.externalId);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist CRM error"), { status: 502 });
  }
}
