import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import { quoteCorreiosShipping } from "@/services/correios/correios";
import type { CorreiosCredentials, CorreiosSettings } from "@/services/correios/types";

const quoteSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50000),
  service: z.enum(["sedex", "pac"]),
  originPostalCode: z.string().min(8),
  destinationPostalCode: z.string().min(8),
  declaredValue: z.number().min(0).optional()
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "correios");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Correios integration is not active." }, { status: 409 });
  }

  try {
    const packaging = await estimatePackaging(session.userId, session.tenantId, {
      productVariantId: parsed.data.productVariantId,
      quantity: parsed.data.quantity
    });

    if (!packaging) {
      return NextResponse.json({ ok: false, error: "No compatible packaging found." }, { status: 404 });
    }

    const credentials = decryptIntegrationCredentials<CorreiosCredentials>(connection);
    const result = await quoteCorreiosShipping(
      {
        service: parsed.data.service,
        originPostalCode: parsed.data.originPostalCode,
        destinationPostalCode: parsed.data.destinationPostalCode,
        declaredValue: parsed.data.declaredValue,
        packaging
      },
      connection.settings as CorreiosSettings,
      credentials
    );

    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "correios",
      operation: "shipping.quote",
      status: "success",
      metadata: {
        service: parsed.data.service,
        productVariantId: parsed.data.productVariantId,
        quantity: parsed.data.quantity,
        totalFrete: result.totalFrete,
        boxesNeeded: packaging.boxesNeeded
      }
    });

    return NextResponse.json({ ok: true, result, packaging });
  } catch (error) {
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "correios",
      operation: "shipping.quote",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Correios error",
      metadata: {
        service: parsed.data.service,
        productVariantId: parsed.data.productVariantId,
        quantity: parsed.data.quantity
      }
    });

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Correios error" },
      { status: 502 }
    );
  }
}
