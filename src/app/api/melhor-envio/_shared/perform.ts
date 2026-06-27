import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

type MelhorEnvioOperation = (
  payload: unknown,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) => Promise<unknown>;

export async function performMelhorEnvioOperation(
  request: Request,
  operationName: string,
  operation: MelhorEnvioOperation
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const payload = body?.payload ?? body;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Payload is required." }, { status: 400 });
  }

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not active." }, { status: 409 });
  }

  try {
    const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const result = await operation(payload, connection.settings as MelhorEnvioSettings, credentials);
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: operationName,
      status: "success"
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: operationName,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Melhor Envio error"
    });

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Melhor Envio error" },
      { status: 502 }
    );
  }
}
