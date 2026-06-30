import { NextResponse } from "next/server";
import { applyMercadoPagoPayment } from "@/repositories/billing";
import { getMercadoPagoPayment } from "@/services/mercado-pago/mercado-pago";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const payload = await request.json().catch(() => null) as {
    type?: string;
    action?: string;
    data?: { id?: string | number };
    id?: string | number;
    topic?: string;
  } | null;

  const topic = payload?.type ?? payload?.topic ?? url.searchParams.get("topic") ?? "";
  const paymentId =
    payload?.data?.id?.toString() ??
    payload?.id?.toString() ??
    url.searchParams.get("id") ??
    url.searchParams.get("data.id");

  if (!paymentId || !["payment", "merchant_order"].includes(topic)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (topic !== "payment") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const payment = await getMercadoPagoPayment(paymentId);
  await applyMercadoPagoPayment({
    paymentId: payment.id.toString(),
    status: payment.status ?? "unknown",
    externalReference: payment.external_reference ?? payment.metadata?.invoice_id ?? null,
    payload: payment
  });

  return NextResponse.json({ ok: true });
}
