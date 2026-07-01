import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { createOAuthState, decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { buildOlistAuthUrl } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const querySchema = z.object({
  provider: z.enum(["olist", "olist_crm"]).default("olist")
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ provider: url.searchParams.get("provider") ?? "olist" });
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, parsed.data.provider);
  if (!connection) {
    return NextResponse.json({ ok: false, error: "Olist integration is not configured." }, { status: 409 });
  }

  const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const state = randomUUID();
  await createOAuthState(session.userId, session.tenantId, {
    provider: parsed.data.provider,
    state,
    redirectPath: "/settings",
    ttlMinutes: 10
  });

  const authUrl = buildOlistAuthUrl(connection.settings as OlistSettings, credentials, state);
  return NextResponse.json({ ok: true, authUrl });
}
