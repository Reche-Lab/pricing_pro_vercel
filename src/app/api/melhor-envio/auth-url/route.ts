import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { buildMelhorEnvioAuthUrl } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection) {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not configured." }, { status: 409 });
  }

  const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
  const authUrl = buildMelhorEnvioAuthUrl(connection.settings as MelhorEnvioSettings, credentials, randomUUID());
  return NextResponse.json({ ok: true, authUrl });
}
