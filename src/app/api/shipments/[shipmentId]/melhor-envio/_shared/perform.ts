import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { getShipment, updateShipmentFlow } from "@/repositories/shipments";
import {
  findMelhorEnvioOrder,
  melhorEnvioOrderFlowStatus,
  MelhorEnvioRequestError,
  sanitizeMelhorEnvioLogValue,
  type MelhorEnvioOrder
} from "@/services/melhor-envio/melhor-envio";
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
  const repeatableOperation =
    nextStatus === "posted" ||
    (nextStatus === "printed" && !shipment.label_url);
  const alreadyCompleted = repeatableOperation ? null : completedOperationResponse(nextStatus, shipment.status);
  if (alreadyCompleted) return NextResponse.json(alreadyCompleted);

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not active." }, { status: 409 });
  }

  try {
    const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const settings = connection.settings as MelhorEnvioSettings;
    const identifier = shipment.provider_shipment_id ?? shipment.provider_order_id;
    const reconciledBefore = operationName === "shipment.cart.add" || !identifier
      ? null
      : await safelyFindOrder(identifier, settings, credentials, operationName, shipmentId);

    if (reconciledBefore) {
      const recoveredStatus = laterStatus(shipment.status, melhorEnvioOrderFlowStatus(reconciledBefore));
      await updateShipmentFlow(session.userId, session.tenantId, {
        shipmentId,
        status: recoveredStatus,
        providerShipmentId: reconciledBefore.id,
        providerOrderId: stringOrNull(reconciledBefore.protocol),
        trackingCode: stringOrNull(reconciledBefore.tracking)
      });

      if (nextStatus === "paid" && statusReached(recoveredStatus, "paid")) {
        const recoveredResult = {
          message: "Compra já confirmada no Melhor Envio e reconciliada no envio.",
          order: sanitizeMelhorEnvioLogValue(reconciledBefore)
        };
        console.info("Melhor Envio shipment operation reconciled.", {
          operation: operationName,
          shipmentId,
          previousStatus: shipment.status,
          status: recoveredStatus,
          providerShipmentId: reconciledBefore.id,
          providerOrderId: reconciledBefore.protocol
        });
        await logIntegrationEvent(session.userId, session.tenantId, {
          provider: "melhor_envio",
          operation: operationName,
          status: "success",
          externalId: reconciledBefore.id,
          message: "Operação recuperada a partir da etiqueta já comprada no Melhor Envio.",
          metadata: {
            shipmentId,
            reconciled: true,
            previousStatus: shipment.status,
            nextStatus: recoveredStatus,
            order: sanitizeMelhorEnvioLogValue(reconciledBefore)
          }
        });
        return NextResponse.json({ ok: true, reconciled: true, result: recoveredResult });
      }
    }

    const effectivePayload = reconciledBefore
      ? replacePayloadOrder(payload, reconciledBefore.id)
      : payload;
    console.info("Melhor Envio shipment operation started.", {
      operation: operationName,
      shipmentId,
      previousStatus: shipment.status,
      targetStatus: nextStatus,
      payload: sanitizeMelhorEnvioLogValue(effectivePayload)
    });

    const result = await operation(effectivePayload, settings, credentials);
    const reconciledAfter = nextStatus === "paid" && identifier
      ? await safelyFindOrder(identifier, settings, credentials, operationName, shipmentId)
      : null;
    const extracted = extractShipmentFields(result, reconciledAfter ?? reconciledBefore);
    const persistedResponse = reconciledAfter
      ? { operation: result, order: reconciledAfter }
      : result;
    await updateShipmentFlow(session.userId, session.tenantId, {
      shipmentId,
      status: nextStatus,
      rawPayload: effectivePayload,
      rawResponse: persistedResponse,
      ...extracted
    });
    console.info("Melhor Envio shipment operation completed.", {
      operation: operationName,
      shipmentId,
      previousStatus: shipment.status,
      status: nextStatus,
      persisted: true,
      extracted,
      payload: sanitizeMelhorEnvioLogValue(effectivePayload),
      response: sanitizeMelhorEnvioLogValue(persistedResponse)
    });
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: operationName,
      status: "success",
      externalId: extracted.providerShipmentId ?? shipment.provider_shipment_id,
      metadata: {
        shipmentId,
        previousStatus: shipment.status,
        nextStatus,
        persisted: true,
        payload: sanitizeMelhorEnvioLogValue(effectivePayload),
        response: sanitizeMelhorEnvioLogValue(persistedResponse),
        extracted
      }
    });
    return NextResponse.json({ ok: true, result, reconciledOrder: reconciledAfter ?? undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Melhor Envio error";
    const status = error instanceof MelhorEnvioRequestError ? error.status : undefined;
    const response = error instanceof MelhorEnvioRequestError ? error.data : undefined;
    console.error("Melhor Envio shipment operation failed.", {
      operation: operationName,
      shipmentId,
      preservedStatus: shipment.status,
      payload: sanitizeMelhorEnvioLogValue(payload),
      httpStatus: status,
      response: sanitizeMelhorEnvioLogValue(response),
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: operationName,
      status: "error",
      message,
      externalId: shipment.provider_shipment_id,
      metadata: {
        shipmentId,
        preservedStatus: shipment.status,
        payload: sanitizeMelhorEnvioLogValue(payload),
        httpStatus: status,
        response: sanitizeMelhorEnvioLogValue(response)
      }
    });

    return NextResponse.json(
      { ok: false, error: humanizeMelhorEnvioError(message, status), httpStatus: status, response },
      { status: 502 }
    );
  }
}

function humanizeMelhorEnvioError(message: string, status?: number) {
  if (status === 400 || status === 422) return `Melhor Envio recusou os dados da etiqueta. Detalhe: ${message}`;
  if (status === 401) return `Melhor Envio recusou a autenticação. Reconecte o OAuth e tente novamente. Detalhe: ${message}`;
  if (status === 403) return `Melhor Envio negou permissão para esta operação. Confira os escopos do aplicativo. Detalhe: ${message}`;
  return message;
}

function completedOperationResponse(nextStatus: string, currentStatus: string) {
  const order = ["quoted", "cart", "paid", "label_generated", "printed", "posted", "delivered"];
  const targetIndex = order.indexOf(nextStatus);
  const currentIndex = order.indexOf(currentStatus);
  if (targetIndex === -1 || currentIndex === -1 || currentIndex < targetIndex) return null;

  return {
    ok: true,
    alreadyCompleted: true,
    status: currentStatus,
    result: {
      message: `Operação já concluída anteriormente. Status atual: ${currentStatus}.`
    }
  };
}

function extractShipmentFields(result: unknown, order?: MelhorEnvioOrder | null) {
  const record = firstRecord(result);
  const data = record && typeof record === "object" ? record as Record<string, unknown> : {};

  return {
    providerShipmentId: stringOrNull(order?.id) ?? pickString(data, ["id", "order_id", "orderId"]),
    providerOrderId: stringOrNull(order?.protocol) ?? pickString(data, ["order_id", "orderId", "protocol", "protocol_id"]),
    trackingCode: stringOrNull(order?.tracking) ?? pickString(data, ["tracking", "tracking_code", "trackingCode"]),
    labelUrl: pickString(data, ["url", "label_url", "labelUrl", "print_url"])
  };
}

async function safelyFindOrder(
  identifier: string,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials,
  operation: string,
  shipmentId: string
) {
  try {
    return await findMelhorEnvioOrder(identifier, settings, credentials);
  } catch (error) {
    console.warn("Melhor Envio order reconciliation was not completed.", {
      operation,
      shipmentId,
      identifier,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function replacePayloadOrder(payload: unknown, orderId: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { orders: [orderId] };
  return {
    ...(payload as Record<string, unknown>),
    orders: [orderId]
  };
}

function laterStatus(current: string, candidate: string) {
  if (current === "error") return candidate;
  return flowStatusIndex(candidate) > flowStatusIndex(current) ? candidate : current;
}

function statusReached(current: string, target: string) {
  return flowStatusIndex(current) >= flowStatusIndex(target);
}

function flowStatusIndex(status: string) {
  return ["draft", "quoted", "cart", "paid", "label_generated", "printed", "posted", "delivered"].indexOf(status);
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
