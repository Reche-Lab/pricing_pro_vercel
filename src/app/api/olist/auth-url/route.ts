import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createOAuthState, decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { buildOlistAuthUrl } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(request.url);
  const redirectPath = safeRedirectPath(url.searchParams.get("redirectPath")) ?? "/settings";

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection) {
    return NextResponse.json({ ok: false, error: "Olist integration is not configured." }, { status: 409 });
  }

  let credentials: OlistCredentials;
  try {
    credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Salve as credenciais Client ID e Client Secret da Olist antes de conectar o OAuth." },
      { status: 409 }
    );
  }

  if (!credentials.clientId || !credentials.clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Informe e salve Client ID e Client Secret da Olist antes de conectar o OAuth." },
      { status: 409 }
    );
  }

  const state = randomUUID();
  await createOAuthState(session.userId, session.tenantId, {
    provider: "olist",
    state,
    redirectPath,
    ttlMinutes: 10
  });

  try {
    const authUrl = buildOlistAuthUrl(connection.settings as OlistSettings, credentials, state);
    return NextResponse.json({ ok: true, authUrl });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Não foi possível iniciar OAuth Olist." },
      { status: 409 }
    );
  }
}

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  return value.slice(0, 120);
}
