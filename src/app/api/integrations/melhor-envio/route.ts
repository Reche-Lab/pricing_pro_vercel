import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  upsertIntegrationConnection
} from "@/repositories/integrations";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

const melhorEnvioSchema = z.object({
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  userAgent: z.string().trim().optional().nullable(),
  services: z.array(z.string()).optional()
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  if (!connection) {
    return NextResponse.json({
      ok: true,
      integration: {
        configured: false,
        connected: false,
        status: "disabled",
        redirectUri: defaultRedirectUri(),
        environment: "sandbox"
      }
    });
  }

  let credentials: MelhorEnvioCredentials = {};
  try {
    credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
  } catch {
    credentials = {};
  }

  const settings = connection.settings as MelhorEnvioSettings;
  return NextResponse.json({
    ok: true,
    integration: {
      configured: Boolean(credentials.clientId && credentials.clientSecret),
      connected: Boolean(credentials.accessToken),
      status: connection.status,
      redirectUri: settings.redirect_uri || defaultRedirectUri(),
      environment: settings.api_base_url?.includes("sandbox") ? "sandbox" : "production",
      clientIdTail: credentials.clientId ? credentials.clientId.slice(-6) : null
    }
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = melhorEnvioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const settings = buildSettings(parsed.data.environment, parsed.data.userAgent ?? undefined, parsed.data.services);
  const previous = await getIntegrationConnection(session.userId, session.tenantId, "melhor_envio");
  let previousCredentials: MelhorEnvioCredentials = {};
  if (previous?.credentials_encrypted) {
    try {
      previousCredentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(previous);
    } catch {
      previousCredentials = {};
    }
  }

  await upsertIntegrationConnection(session.userId, session.tenantId, {
    provider: "melhor_envio",
    status: "active",
    settings,
    credentials: {
      accessToken: previousCredentials.accessToken,
      refreshToken: previousCredentials.refreshToken,
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret
    }
  });

  return NextResponse.json({ ok: true, redirectUri: settings.redirect_uri });
}

function buildSettings(environment: "sandbox" | "production", userAgent?: string | null, services?: string[]): MelhorEnvioSettings {
  const base =
    environment === "production"
      ? {
          app_base_url: "https://www.melhorenvio.com.br",
          api_base_url: "https://www.melhorenvio.com.br/api/v2"
        }
      : {
          app_base_url: "https://sandbox.melhorenvio.com.br",
          api_base_url: "https://sandbox.melhorenvio.com.br/api/v2"
        };

  return {
    ...base,
    environment,
    redirect_uri: defaultRedirectUri(),
    user_agent: userAgent || "Pricing Pro (contato@example.com)",
    services: services ?? []
  };
}

function defaultRedirectUri(): string {
  return `${getServerEnv().APP_URL.replace(/\/$/, "")}/api/melhor-envio/oauth/callback`;
}
