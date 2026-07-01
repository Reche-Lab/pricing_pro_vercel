import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { createShipmentDraft, listQuoteShipments } from "@/repositories/shipments";

const shipmentSchema = z.object({
  provider: z.string().trim().min(2),
  status: z.string().trim().optional(),
  serviceName: z.string().trim().optional().nullable(),
  serviceCode: z.string().trim().optional().nullable(),
  shippingAmount: z.number().min(0).optional(),
  rawQuote: z.unknown().optional()
});

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }

  const shipments = await listQuoteShipments(session.userId, session.tenantId, quoteId);
  return NextResponse.json({ ok: true, shipments });
}

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = shipmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createShipmentDraft(session.userId, session.tenantId, {
    quoteId,
    ...parsed.data
  });
  return NextResponse.json({ ok: true, result }, { status: 201 });
}
