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
  const record = firstRecord(result);
  if (!record || typeof record !== "object") return {};
  const data = record as Record<string, unknown>;

  return {
    providerShipmentId: pickString(data, ["id", "order_id", "orderId"]),
    providerOrderId: pickString(data, ["order_id", "orderId", "protocol", "protocol_id"]),
    trackingCode: pickString(data, ["tracking", "tracking_code", "trackingCode"]),
    labelUrl: pickString(data, ["url", "label_url", "labelUrl", "print_url"])
  };
}

function firstRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(firstRecord).find(Boolean) ?? null;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (["id", "order_id", "orderId", "protocol", "tracking", "url"].some((key) => record[key] !== undefined)) {
    return record;
  }
  for (const item of Object.values(record)) {
    const nested = firstRecord(item);
    if (nested) return nested;
  }
  return record;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringOrNull(record[key]);
    if (value) return value;
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}
