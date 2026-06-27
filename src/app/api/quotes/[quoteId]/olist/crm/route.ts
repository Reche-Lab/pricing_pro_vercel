import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { getQuoteDetail, updateQuoteExternalCrmId } from "@/repositories/quotes";
import { extractExternalId, olistRequest } from "@/services/olist/olist";
import { buildOlistCrmQuotePayload } from "@/services/olist/payloads";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const [detail, connection] = await Promise.all([
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    getIntegrationConnection(session.userId, session.tenantId, "olist_crm")
  ]);
  if (!detail) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Olist CRM integration is not active." }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  const path = settings.quote_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist CRM quote path is not configured." }, { status: 409 });

  const payload = buildOlistCrmQuotePayload({ quote: detail.quote, items: detail.items });
  try {
    const result = await olistRequest({
      settings,
      credentials: decryptIntegrationCredentials<OlistCredentials>(connection),
      path,
      body: payload
    });
    const externalId = extractExternalId(result);
    if (externalId) {
      await updateQuoteExternalCrmId(session.userId, session.tenantId, quoteId, externalId);
    }
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "olist_crm",
      operation: "quotes.create",
      status: "success",
      externalId,
      metadata: { quoteId, payload, result }
    });
    return NextResponse.json({ ok: true, result, externalId });
  } catch (error) {
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "olist_crm",
      operation: "quotes.create",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Olist CRM error",
      metadata: { quoteId, payload }
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Olist CRM error" },
      { status: 502 }
    );
  }
}
