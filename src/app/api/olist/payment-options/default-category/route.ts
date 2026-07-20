import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const schema = z.object({
  categoryExternalId: z.string().trim().min(1).max(80),
  categoryName: z.string().trim().min(1).max(160)
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Integração Olist não está ativa." }, { status: 409 });
  }

  const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const settings = connection.settings as OlistSettings;
  await updateIntegrationCredentials(session.userId, session.tenantId, {
    provider: "olist",
    credentials,
    settings: {
      ...settings,
      default_payment_category_external_id: parsed.data.categoryExternalId,
      default_payment_category_name: parsed.data.categoryName
    },
    status: "active"
  });

  return NextResponse.json({ ok: true });
}
