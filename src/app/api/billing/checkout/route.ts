import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getOrCreateOpenInvoice, updateInvoiceCheckout } from "@/repositories/billing";
import { userHasPermission } from "@/repositories/users";
import { createMercadoPagoPreference } from "@/services/mercado-pago/mercado-pago";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const allowed = await userHasPermission(session.userId, session.tenantId, "settings:manage");
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const invoice = await getOrCreateOpenInvoice(session.userId, session.tenantId);
  if (invoice.amount_cents <= 0) {
    return NextResponse.json({ ok: true, checkoutUrl: "/billing?status=success", invoiceId: invoice.id });
  }
  const preference = await createMercadoPagoPreference({
    invoiceId: invoice.id,
    tenantId: invoice.tenant_id,
    tenantName: invoice.tenant_name,
    title: `Pricing Pro - ${invoice.plan_name}`,
    amountCents: invoice.amount_cents
  });

  await updateInvoiceCheckout({
    invoiceId: invoice.id,
    preferenceId: preference.id,
    checkoutUrl: preference.initPoint
  });

  return NextResponse.json({ ok: true, checkoutUrl: preference.initPoint, invoiceId: invoice.id });
}
