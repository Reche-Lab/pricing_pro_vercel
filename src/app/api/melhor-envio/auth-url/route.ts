import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createOAuthState, decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { buildMelhorEnvioAuthUrl } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";
import { melhorEnvioOAuthReturnPath } from "@/lib/melhor-envio/oauth-return";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection) {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not configured." }, { status: 409 });
  }

  let credentials: MelhorEnvioCredentials;
  try { credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection); }
  catch { return NextResponse.json({ ok: false, error: "Salve Client ID e Client Secret em Configurações > Melhor Envio antes de reconectar." }, { status: 409 }); }
  if (!credentials.clientId || !credentials.clientSecret) {
    return NextResponse.json({ ok: false, error: "Salve Client ID e Client Secret em Configurações > Melhor Envio antes de reconectar." }, { status: 409 });
  }
  let authUrl: string;
  const state = randomUUID();
  try { authUrl = buildMelhorEnvioAuthUrl(connection.settings as MelhorEnvioSettings, credentials, state); }
  catch { return NextResponse.json({ ok: false, error: "Confira a URL de retorno e as credenciais em Configurações > Melhor Envio." }, { status: 409 }); }
  await createOAuthState(session.userId, session.tenantId, {
    provider: "melhor_envio",
    state,
    redirectPath: melhorEnvioOAuthReturnPath(new URL(request.url).searchParams.get("redirectPath")),
    ttlMinutes: 10
  });
  return NextResponse.json({ ok: true, authUrl }, { headers: { "cache-control": "no-store" } });
}
