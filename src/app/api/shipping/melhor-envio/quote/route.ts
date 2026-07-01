import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import { createShipmentDraft } from "@/repositories/shipments";
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
  serviceIds: z.array(z.string()).optional(),
  quoteId: z.string().uuid().optional(),
  selectedBoxId: z.string().uuid().optional().nullable(),
  clearanceCm: z.number().min(0).max(5).optional()
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

    let shipment: { id: string } | null = null;
    if (parsed.data.quoteId) {
      const selected = extractFirstQuoteOption(result);
      shipment = await createShipmentDraft(session.userId, session.tenantId, {
        quoteId: parsed.data.quoteId,
        provider: "melhor_envio",
        status: "quoted",
        serviceName: selected.serviceName,
        serviceCode: selected.serviceCode,
        shippingAmount: selected.shippingAmount,
        rawQuote: result,
        selectedQuote: selected.raw,
        packagingSnapshot: packaging
      });
    }

    return NextResponse.json({ ok: true, result, packaging, shipment });
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

function extractFirstQuoteOption(result: unknown) {
  const first = Array.isArray(result) ? result[0] : null;
  const record = first && typeof first === "object" ? (first as Record<string, unknown>) : {};
  const company = record.company && typeof record.company === "object" ? (record.company as Record<string, unknown>) : {};
  return {
    serviceName: stringOrNull(record.name) ?? stringOrNull(company.name) ?? "Melhor Envio",
    serviceCode: stringOrNull(record.id),
    shippingAmount: numberOrZero(record.price) || numberOrZero(record.custom_price),
    raw: record
  };
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
