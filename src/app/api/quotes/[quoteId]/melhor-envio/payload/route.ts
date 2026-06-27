import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail } from "@/repositories/quotes";
import { listQuoteShipments } from "@/repositories/shipments";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { buildMelhorEnvioCartPayloadDraft } from "@/services/melhor-envio/payloads";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }

  const [tenant, detail, shipments] = await Promise.all([
    getTenantShippingProfile(session.userId, session.tenantId),
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    listQuoteShipments(session.userId, session.tenantId, quoteId)
  ]);

  if (!tenant) return NextResponse.json({ ok: false, error: "Tenant not found." }, { status: 404 });
  if (!detail) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

  const shipment = shipments.find((item) => item.provider === "melhor_envio") ?? null;
  const draft = buildMelhorEnvioCartPayloadDraft({
    tenant,
    quote: detail.quote,
    items: detail.items,
    shipment
  });

  return NextResponse.json({ ok: true, ...draft });
}
