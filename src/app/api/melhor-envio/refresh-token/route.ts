import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import { refreshMelhorEnvioToken } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection) {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not configured." }, { status: 409 });
  }

  try {
    const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const token = await refreshMelhorEnvioToken(connection.settings as MelhorEnvioSettings, credentials);
    await updateIntegrationCredentials(session.userId, session.tenantId, {
      provider: "melhor_envio",
      credentials: {
        ...credentials,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? credentials.refreshToken
      },
      status: "active"
    });
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: "oauth.refresh_token",
      status: "success"
    });
    return NextResponse.json({ ok: true, token });
  } catch (error) {
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: "oauth.refresh_token",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Melhor Envio error"
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Melhor Envio error" },
      { status: 502 }
    );
  }
}
