import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  upsertIntegrationConnection
} from "@/repositories/integrations";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const olistIntegrationSchema = z.object({
  provider: z.enum(["olist", "olist_crm"]),
  apiBaseUrl: z.string().trim().url(),
  apiToken: z.string().trim().min(1),
  path: z.string().trim().min(1),
  authScheme: z.enum(["Bearer", "Token", "ApiKey"]).default("Bearer"),
  authHeader: z.string().trim().default("authorization")
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const [olist, crm] = await Promise.all([
    getIntegrationConnection(session.userId, session.tenantId, "olist"),
    getIntegrationConnection(session.userId, session.tenantId, "olist_crm")
  ]);

  return NextResponse.json({
    ok: true,
    integrations: {
      olist: serializeConnection(olist),
      olistCrm: serializeConnection(crm)
    }
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = olistIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  await upsertIntegrationConnection(session.userId, session.tenantId, {
    provider: parsed.data.provider,
    status: "active",
    settings:
      parsed.data.provider === "olist"
        ? {
            api_base_url: parsed.data.apiBaseUrl,
            customer_path: parsed.data.path,
            auth_scheme: parsed.data.authScheme,
            auth_header: parsed.data.authHeader
          }
        : {
            api_base_url: parsed.data.apiBaseUrl,
            quote_path: parsed.data.path,
            auth_scheme: parsed.data.authScheme,
            auth_header: parsed.data.authHeader
          },
    credentials: {
      apiToken: parsed.data.apiToken
    }
  });

  return NextResponse.json({ ok: true });
}

function serializeConnection(connection: Awaited<ReturnType<typeof getIntegrationConnection>>) {
  if (!connection) return { configured: false, connected: false, status: "disabled" };
  const settings = connection.settings as OlistSettings;
  let credentials: OlistCredentials = {};
  try {
    credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  } catch {
    credentials = {};
  }

  return {
    configured: Boolean(settings.api_base_url && (settings.customer_path || settings.quote_path)),
    connected: Boolean(credentials.apiToken),
    status: connection.status,
    apiBaseUrl: settings.api_base_url ?? "",
    path: settings.customer_path ?? settings.quote_path ?? "",
    authScheme: settings.auth_scheme ?? "Bearer",
    authHeader: settings.auth_header ?? "authorization"
  };
}
