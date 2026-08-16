import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  upsertIntegrationConnection
} from "@/repositories/integrations";
import type { CorreiosCredentials, CorreiosSettings } from "@/services/correios/types";

const DEFAULT_API_BASE_URL = "https://api.correios.com.br";
const DEFAULT_SEDEX_CODE = "04162";
const DEFAULT_PAC_CODE = "04669";

const correiosIntegrationSchema = z.object({
  active: z.boolean().default(true),
  apiBaseUrl: z.string().trim().url(),
  token: z.string().trim().optional().default(""),
  contract: z.string().trim().max(40).optional().default(""),
  sedexServiceCode: z.string().trim().regex(/^\d{1,20}$/, "Informe um código SEDEX válido."),
  pacServiceCode: z.string().trim().regex(/^\d{1,20}$/, "Informe um código PAC válido.")
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "correios");
  const settings = (connection?.settings ?? {}) as CorreiosSettings;
  const credentials = readCredentials(connection);

  return NextResponse.json({
    ok: true,
    integration: {
      configured: Boolean(credentials.token),
      active: connection?.status === "active",
      status: connection?.status ?? "disabled",
      apiBaseUrl: settings.api_base_url ?? DEFAULT_API_BASE_URL,
      contract: settings.contrato_correios ?? "",
      sedexServiceCode: settings.servicos?.sedex ?? DEFAULT_SEDEX_CODE,
      pacServiceCode: settings.servicos?.pac ?? DEFAULT_PAC_CODE,
      tokenTail: credentials.token ? credentials.token.slice(-4) : null
    }
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = correiosIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "correios");
  const previousCredentials = readCredentials(connection);
  const token = parsed.data.token || previousCredentials.token;

  if (parsed.data.active && !token) {
    return NextResponse.json(
      { ok: false, error: "Informe o token da API para ativar a integração dos Correios." },
      { status: 400 }
    );
  }

  await upsertIntegrationConnection(session.userId, session.tenantId, {
    provider: "correios",
    status: parsed.data.active ? "active" : "disabled",
    settings: {
      api_base_url: parsed.data.apiBaseUrl.replace(/\/$/, ""),
      contrato_correios: parsed.data.contract,
      servicos: {
        sedex: parsed.data.sedexServiceCode,
        pac: parsed.data.pacServiceCode
      }
    },
    credentials: { token: token ?? "" }
  });

  return NextResponse.json({ ok: true });
}

function readCredentials(
  connection: Awaited<ReturnType<typeof getIntegrationConnection>>
): Partial<CorreiosCredentials> {
  if (!connection?.credentials_encrypted) return {};
  try {
    return decryptIntegrationCredentials<CorreiosCredentials>(connection);
  } catch {
    return {};
  }
}
