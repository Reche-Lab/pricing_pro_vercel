import { NextResponse } from "next/server";
import { z } from "zod";
import { buildQuoteWhatsAppText } from "@/domain/whatsapp/quote";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail } from "@/repositories/quotes";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }

  const detail = await getQuoteDetail(session.userId, session.tenantId, quoteId);
  if (!detail) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    text: buildQuoteWhatsAppText({ quote: detail.quote, items: detail.items })
  });
}
