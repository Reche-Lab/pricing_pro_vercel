import { NextResponse } from "next/server";
import { updateQuoteExternalCrmId } from "@/repositories/quotes";
import { buildOlistCrmQuotePayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, sendOlistQuoteOperation } from "../_shared";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist_crm");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const path = loaded.settings.quote_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist CRM quote path is not configured." }, { status: 409 });

  const payload = buildOlistCrmQuotePayload({ quote: loaded.detail.quote, items: loaded.detail.items });
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
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Olist CRM error" },
      { status: 502 }
    );
  }
}
