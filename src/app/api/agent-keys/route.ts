import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { createAgentApiKey, listAgentApiKeys } from "@/repositories/agent";
import { userHasPermission } from "@/repositories/users";

export const AGENT_SCOPES = [
  "products:read",
  "pricing:calculate",
  "shipping:quote",
  "quotes:create",
  "quotes:read",
  "quotes:whatsapp",
  "quotes:pdf",
  "quotes:public_link"
] as const;

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1)
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const allowed = await userHasPermission(session.userId, session.tenantId, "settings:manage");
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const keys = await listAgentApiKeys(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, keys, availableScopes: AGENT_SCOPES });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const allowed = await userHasPermission(session.userId, session.tenantId, "settings:manage");
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await createAgentApiKey(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true, key: created.key, token: created.token }, { status: 201 });
}
