import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ARTWORK_AI_GENERATION_LIMIT } from "@/domain/artwork/ai-generation-limit";
import { getCurrentSession } from "@/lib/auth/session";
import { isSuperAdmin, updateTenantArtworkAiGenerationLimit } from "@/repositories/superadmin";

const settingsSchema = z.object({
  artworkAiGenerationLimit: z.number().int().min(0).max(MAX_ARTWORK_AI_GENERATION_LIMIT)
});

export async function PATCH(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const { tenantId } = await context.params;
  if (!z.string().uuid().safeParse(tenantId).success) {
    return NextResponse.json({ ok: false, error: "Tenant inválido." }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: `Informe um limite inteiro entre 0 e ${MAX_ARTWORK_AI_GENERATION_LIMIT}.` }, { status: 400 });
  }

  try {
    const tenant = await updateTenantArtworkAiGenerationLimit({
      actorUserId: session.userId,
      tenantId,
      limit: parsed.data.artworkAiGenerationLimit
    });
    return NextResponse.json({ ok: true, tenant });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o limite.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Forbidden." ? 403 : message.includes("not found") ? 404 : 500 }
    );
  }
}
