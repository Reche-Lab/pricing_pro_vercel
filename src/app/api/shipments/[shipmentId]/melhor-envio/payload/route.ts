import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getQuoteDetail } from "@/repositories/quotes";
import { getShipment } from "@/repositories/shipments";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { buildMelhorEnvioOperationPayloadDraft } from "@/services/melhor-envio/payloads";

const operationSchema = z.enum(["cart", "checkout", "generate", "print", "tracking"]);

export async function GET(request: Request, context: { params: Promise<{ shipmentId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { shipmentId } = await context.params;
  const shipmentIdParsed = z.string().uuid().safeParse(shipmentId);
  if (!shipmentIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid shipment id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const operationParsed = operationSchema.safeParse(url.searchParams.get("operation") ?? "cart");
  if (!operationParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid operation." }, { status: 400 });
  }

  const shipment = await getShipment(session.userId, session.tenantId, shipmentId);
  if (!shipment) return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
  if (shipment.provider !== "melhor_envio") {
    return NextResponse.json({ ok: false, error: "Shipment provider is not Melhor Envio." }, { status: 409 });
  }

  const [tenant, detail] = await Promise.all([
    getTenantShippingProfile(session.userId, session.tenantId),
    getQuoteDetail(session.userId, session.tenantId, shipment.quote_id)
  ]);

  if (!tenant) return NextResponse.json({ ok: false, error: "Tenant not found." }, { status: 404 });
  if (!detail) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

  const draft = buildMelhorEnvioOperationPayloadDraft({
    operation: operationParsed.data,
    tenant,
    quote: detail.quote,
    items: detail.items,
    shipment
  });

  return NextResponse.json({ ok: true, ...draft });
}
