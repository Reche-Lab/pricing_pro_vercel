import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail } from "@/repositories/quotes";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { getSessionProfile } from "@/repositories/users";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";
import { listQuoteShipments } from "@/repositories/shipments";
import { deliveryEstimate, transportDaysFromQuote } from "@/domain/shipping/production-lead-time";

const artworkVariantSchema = z.enum(["product", "original", "edited", "cropped"]);

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }
  const artworkVariant = artworkVariantSchema.safeParse(new URL(request.url).searchParams.get("artwork") ?? "product");
  if (!artworkVariant.success) {
    return NextResponse.json({ ok: false, error: "Seleção de arte inválida." }, { status: 400 });
  }
  const view = z.enum(["front", "both"]).safeParse(new URL(request.url).searchParams.get("view") ?? "both");
  if (!view.success) return NextResponse.json({ ok: false, error: "Visualização do produto inválida." }, { status: 400 });

  const [profile, detail, tenant, shipments] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    getTenantShippingProfile(session.userId, session.tenantId),
    listQuoteShipments(session.userId, session.tenantId, quoteId)
  ]);
  if (!profile || !detail) {
    return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });
  }

  const pdf = await generateQuotePdf({
    tenantName: profile.tenant_name,
    tenant,
    quote: detail.quote,
    items: detail.items,
    artworkVariant: artworkVariant.data,
    mockupView: view.data,
    productionEstimate: detail.items.length ? deliveryEstimate(detail.items.reduce((sum, item) => sum + item.quantity, 0), detail.quote.delivery_method === "pickup" ? 0 : transportDaysFromQuote(shipments[0]?.selected_quote), tenant?.production_settings) : undefined
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="orcamento-${quoteId}.pdf"`
    }
  });
}
