import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { deleteQuote, updateQuoteShippingTotal } from "@/repositories/quotes";
import { userHasPermission } from "@/repositories/users";

const patchSchema = z.object({
  shippingTotal: z.number().min(0).max(100000)
});

export async function PATCH(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const quote = await updateQuoteShippingTotal(session.userId, session.tenantId, quoteId, parsed.data.shippingTotal);
  if (!quote) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

  return NextResponse.json({ ok: true, quote });
}

export async function DELETE(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const allowed = session.role === "owner" || (await userHasPermission(session.userId, session.tenantId, "quotes:delete"));
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const deleted = await deleteQuote(session.userId, session.tenantId, quoteId);
  if (!deleted) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

  return NextResponse.json({ ok: true, quote: deleted });
}
