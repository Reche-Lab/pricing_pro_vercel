import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listOlistPaymentOptions } from "@/repositories/olist-payment-options";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const options = await listOlistPaymentOptions(session.userId, session.tenantId);
  return NextResponse.json({
    ok: true,
    options,
    grouped: {
      paymentMethods: options.filter((option) => option.kind === "payment_method"),
      receivingMethods: options.filter((option) => option.kind === "receiving_method"),
      categories: options.filter((option) => option.kind === "category")
    }
  });
}
