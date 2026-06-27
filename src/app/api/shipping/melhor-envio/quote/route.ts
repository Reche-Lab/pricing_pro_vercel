import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import { quoteMelhorEnvioShipping } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

const quoteSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50000),
  originPostalCode: z.string().min(8),
  destinationPostalCode: z.string().min(8),
  declaredValue: z.number().min(0).optional(),
  insuranceValue: z.number().min(0).optional(),
  ownHand: z.boolean().optional(),
  receipt: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not active." }, { status: 409 });
  }

  try {
    const packaging = await estimatePackaging(session.userId, session.tenantId, parsed.data);
    if (!packaging) {
      return NextResponse.json({ ok: false, error: "No compatible packaging found." }, { status: 404 });
    }

    const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const result = await quoteMelhorEnvioShipping(
      {
        ...parsed.data,
        packaging
      },
      connection.settings as MelhorEnvioSettings,
      credentials
    );

    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: "shipping.quote",
      status: "success",
      metadata: {
        productVariantId: parsed.data.productVariantId,
        quantity: parsed.data.quantity,
        boxesNeeded: packaging.boxesNeeded
      }
    });

    return NextResponse.json({ ok: true, result, packaging });
  } catch (error) {
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: "shipping.quote",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Melhor Envio error"
    });

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Melhor Envio error" },
      { status: 502 }
    );
  }
}
