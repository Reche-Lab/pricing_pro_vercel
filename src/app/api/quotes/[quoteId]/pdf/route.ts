import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail } from "@/repositories/quotes";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { getSessionProfile } from "@/repositories/users";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }

  const [profile, detail, tenant] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    getTenantShippingProfile(session.userId, session.tenantId)
  ]);
  if (!profile || !detail) {
    return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });
  }

  const pdf = await generateQuotePdf({
    tenantName: profile.tenant_name,
    tenant,
    quote: detail.quote,
    items: detail.items
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="orcamento-${quoteId}.pdf"`
    }
  });
}
