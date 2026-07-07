import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { revokeAgentApiKey } from "@/repositories/agent";
import { userHasPermission } from "@/repositories/users";

const paramsSchema = z.object({
  keyId: z.string().uuid()
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const allowed = await userHasPermission(session.userId, session.tenantId, "settings:manage");
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid key id." }, { status: 400 });

  const key = await revokeAgentApiKey(session.userId, session.tenantId, parsed.data.keyId);
  if (!key) return NextResponse.json({ ok: false, error: "Chave não encontrada." }, { status: 404 });

  return NextResponse.json({ ok: true, key });
}
