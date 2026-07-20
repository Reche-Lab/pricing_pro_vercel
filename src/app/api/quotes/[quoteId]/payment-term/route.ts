import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuotePaymentTerm, upsertQuotePaymentTerm } from "@/repositories/olist-payment-options";

const installmentSchema = z.object({
  installmentNumber: z.number().int().min(1).max(24),
  dueDate: z.string().trim().optional().nullable(),
  days: z.number().int().min(0).max(3650).optional().nullable(),
  amount: z.number().min(0).max(1000000),
  notes: z.string().trim().max(300).optional().nullable(),
  paymentMethodExternalId: z.string().trim().max(80).optional().nullable(),
  paymentMethodName: z.string().trim().max(160).optional().nullable(),
  receivingMethodExternalId: z.string().trim().max(80).optional().nullable(),
  receivingMethodName: z.string().trim().max(160).optional().nullable()
});

const paymentTermSchema = z.object({
  paymentMethodExternalId: z.string().trim().max(80).optional().nullable(),
  paymentMethodName: z.string().trim().max(160).optional().nullable(),
  receivingMethodExternalId: z.string().trim().max(80).optional().nullable(),
  receivingMethodName: z.string().trim().max(160).optional().nullable(),
  categoryExternalId: z.string().trim().max(80).optional().nullable(),
  categoryName: z.string().trim().max(160).optional().nullable(),
  installmentsCount: z.number().int().min(1).max(24).optional().nullable(),
  notes: z.string().trim().max(600).optional().nullable(),
  installments: z.array(installmentSchema).min(1).max(24)
});

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const { quoteId } = await context.params;
  const parsedQuoteId = z.string().uuid().safeParse(quoteId);
  if (!parsedQuoteId.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const paymentTerm = await getQuotePaymentTerm(session.userId, session.tenantId, quoteId);
  return NextResponse.json({ ok: true, paymentTerm });
}

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const { quoteId } = await context.params;
  const parsedQuoteId = z.string().uuid().safeParse(quoteId);
  if (!parsedQuoteId.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = paymentTermSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  await upsertQuotePaymentTerm(session.userId, session.tenantId, quoteId, parsed.data);
  const paymentTerm = await getQuotePaymentTerm(session.userId, session.tenantId, quoteId);
  return NextResponse.json({ ok: true, paymentTerm });
}
