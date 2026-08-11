import { NextResponse } from "next/server";
import { z } from "zod";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { getPublicArtworkContext, getPublicArtworkRetouchDraft, savePublicArtworkRetouchDraft } from "@/repositories/public-artworks";
import { retouchDraftBodySchema } from "@/services/artwork/retouch-draft";

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid(), artworkId: z.string().uuid() });
type Route = { params: Promise<{ token: string; itemId: string; artworkId: string }> };

export async function GET(request: Request, route: Route) {
  const params = paramsSchema.safeParse(await route.params);
  if (!params.success) return unavailable();
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-retouch-draft-read", limit: 120, windowSeconds: 3600 }); if (limited) return limited;
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId, params.data.artworkId);
  if (!context) return unavailable();
  const result = await getPublicArtworkRetouchDraft(context, params.data.artworkId);
  if (!result) return unavailable();
  return NextResponse.json({ ok: true, draft: result.retouch_draft, updatedAt: result.retouch_draft_updated_at });
}

export async function PUT(request: Request, route: Route) {
  const params = paramsSchema.safeParse(await route.params);
  const body = retouchDraftBodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Rascunho de retoque inválido." }, { status: 400 });
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-retouch-draft-write", limit: 120, windowSeconds: 3600 }); if (limited) return limited;
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId, params.data.artworkId);
  if (!context) return unavailable();
  try { const saved = await savePublicArtworkRetouchDraft(context, params.data.artworkId, body.data.draft); return NextResponse.json({ ok: true, updatedAt: saved.retouch_draft_updated_at }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar o rascunho." }, { status: 409 }); }
}

export async function DELETE(request: Request, route: Route) {
  const params = paramsSchema.safeParse(await route.params); if (!params.success) return unavailable();
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-retouch-draft-delete", limit: 30, windowSeconds: 3600 }); if (limited) return limited;
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId, params.data.artworkId); if (!context) return unavailable();
  try { await savePublicArtworkRetouchDraft(context, params.data.artworkId, null); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível remover o rascunho." }, { status: 409 }); }
}

function unavailable() { return NextResponse.json({ ok: false, error: "Este orçamento não está mais disponível para alterações." }, { status: 409 }); }
