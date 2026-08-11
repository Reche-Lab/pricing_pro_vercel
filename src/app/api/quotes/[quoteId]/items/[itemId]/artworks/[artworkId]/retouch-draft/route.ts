import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { getArtworkRetouchDraft, saveArtworkRetouchDraft } from "@/repositories/artwork-production";
import { assertQuoteCanBeEdited } from "@/repositories/quotes";
import { retouchDraftBodySchema } from "@/services/artwork/retouch-draft";

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid(), artworkId: z.string().uuid() });
type Route = { params: Promise<{ quoteId: string; itemId: string; artworkId: string }> };

export async function GET(_: Request, route: Route) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const params = paramsSchema.safeParse(await route.params);
  if (!params.success) return NextResponse.json({ ok: false, error: "Arte inválida." }, { status: 400 });
  const result = await getArtworkRetouchDraft(session.userId, session.tenantId, params.data.quoteId, params.data.itemId, params.data.artworkId);
  if (!result) return NextResponse.json({ ok: false, error: "Arte não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, draft: result.retouch_draft, updatedAt: result.retouch_draft_updated_at });
}

export async function PUT(request: Request, route: Route) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId); if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await route.params);
  const body = retouchDraftBodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Rascunho de retoque inválido." }, { status: 400 });
  try {
    await assertQuoteCanBeEdited(session.userId, session.tenantId, params.data.quoteId);
    const saved = await saveArtworkRetouchDraft({ userId: session.userId, tenantId: session.tenantId, ...params.data, draft: body.data.draft });
    return NextResponse.json({ ok: true, updatedAt: saved.retouch_draft_updated_at });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar o rascunho." }, { status: 409 }); }
}

export async function DELETE(_: Request, route: Route) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const params = paramsSchema.safeParse(await route.params);
  if (!params.success) return NextResponse.json({ ok: false, error: "Arte inválida." }, { status: 400 });
  try {
    await assertQuoteCanBeEdited(session.userId, session.tenantId, params.data.quoteId);
    await saveArtworkRetouchDraft({ userId: session.userId, tenantId: session.tenantId, ...params.data, draft: null });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível remover o rascunho." }, { status: 409 }); }
}
