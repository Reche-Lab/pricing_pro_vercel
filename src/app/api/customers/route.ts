import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { isValidCpfOrCnpj } from "@/lib/validation/documents";
import { createCustomer, listCustomers } from "@/repositories/customers";

const customerSchema = z.object({
  name: z.string().trim().min(2),
  document: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  addressNumber: z.string().trim().optional().nullable(),
  addressComplement: z.string().trim().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().max(2).optional().nullable()
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const customers = await listCustomers(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, customers });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const body = await request.json().catch(() => null);
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.document && !isValidCpfOrCnpj(parsed.data.document)) {
    return NextResponse.json({ ok: false, error: "Invalid document." }, { status: 400 });
  }

  const customer = await createCustomer(session.userId, session.tenantId, {
    ...parsed.data,
    email: parsed.data.email || null
  });

  return NextResponse.json({ ok: true, customer }, { status: 201 });
}
