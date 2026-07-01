import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createOAuthState, decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { buildOlistAuthUrl } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection) {
    return NextResponse.json({ ok: false, error: "Olist integration is not configured." }, { status: 409 });
  }

  const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const state = randomUUID();
  await createOAuthState(session.userId, session.tenantId, {
    provider: "olist",
    state,
    redirectPath: "/settings",
    ttlMinutes: 10
  });

  const authUrl = buildOlistAuthUrl(connection.settings as OlistSettings, credentials, state);
  return NextResponse.json({ ok: true, authUrl });
}
