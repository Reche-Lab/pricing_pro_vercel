import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { getShipment, updateShipmentFlow } from "@/repositories/shipments";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

type MelhorEnvioOperation = (
  payload: unknown,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) => Promise<unknown>;

export async function performShipmentMelhorEnvioOperation(
  request: Request,
  context: { params: Promise<{ shipmentId: string }> },
  operationName: string,
  nextStatus: string,
  operation: MelhorEnvioOperation
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { shipmentId } = await context.params;
  const shipmentIdParsed = z.string().uuid().safeParse(shipmentId);
  if (!shipmentIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid shipment id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const payload = body?.payload ?? body;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Payload is required." }, { status: 400 });
  }

  const shipment = await getShipment(session.userId, session.tenantId, shipmentId);
  if (!shipment) return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
  if (shipment.provider !== "melhor_envio") {
    return NextResponse.json({ ok: false, error: "Shipment provider is not Melhor Envio." }, { status: 409 });
  }

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not active." }, { status: 409 });
  }

  try {
    const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const result = await operation(payload, connection.settings as MelhorEnvioSettings, credentials);
    const extracted = extractShipmentFields(result);
    await updateShipmentFlow(session.userId, session.tenantId, {
      shipmentId,
      status: nextStatus,
      rawPayload: payload,
      rawResponse: result,
      ...extracted
    });
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: operationName,
      status: "success",
      metadata: { shipmentId }
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await updateShipmentFlow(session.userId, session.tenantId, {
      shipmentId,
      status: "error",
      rawPayload: payload,
      rawResponse: { error: error instanceof Error ? error.message : "Unknown Melhor Envio error" }
    });
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: operationName,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Melhor Envio error",
      metadata: { shipmentId }
    });

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Melhor Envio error" },
      { status: 502 }
    );
  }
}

function extractShipmentFields(result: unknown) {
  const record = Array.isArray(result) ? (result[0] as unknown) : result;
  if (!record || typeof record !== "object") return {};
  const data = record as Record<string, unknown>;

  return {
    providerShipmentId: stringOrNull(data.id) ?? stringOrNull(data.order_id),
    providerOrderId: stringOrNull(data.order_id) ?? stringOrNull(data.protocol),
    trackingCode: stringOrNull(data.tracking) ?? stringOrNull(data.tracking_code),
    labelUrl: stringOrNull(data.url) ?? stringOrNull(data.label_url)
  };
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}
