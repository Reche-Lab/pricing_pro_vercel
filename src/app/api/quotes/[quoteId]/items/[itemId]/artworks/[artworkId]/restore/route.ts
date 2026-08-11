import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { restoreQuoteItemArtworkVersion } from "@/repositories/quotes";
import { deleteArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid(), artworkId: z.string().uuid() });

export async function POST(_: Request, route: { params: Promise<{ quoteId: string; itemId: string; artworkId: string }> }) {
  const session = await getCurrentSession(); if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId); if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await route.params); if (!params.success) return NextResponse.json({ ok: false, error: "Arte inválida." }, { status: 400 });
  try {
    const result = await restoreQuoteItemArtworkVersion(session.userId, session.tenantId, params.data.quoteId, params.data.itemId, params.data.artworkId);
    await Promise.all([deleteArtworkObject(result.storagePath), deleteArtworkObject(result.preparedStoragePath)]);
    return NextResponse.json({ ok: true, restoredArtworkId: result.restoredArtworkId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível restaurar a arte original." }, { status: 409 });
  }
}
