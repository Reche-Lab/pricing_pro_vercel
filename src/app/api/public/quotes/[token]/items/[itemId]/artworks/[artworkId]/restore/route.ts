import { NextResponse } from "next/server";
import { z } from "zod";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { getPublicArtworkContext, restorePublicArtworkVersion } from "@/repositories/public-artworks";
import { deleteArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid(), artworkId: z.string().uuid() });

export async function POST(request: Request, route: { params: Promise<{ token: string; itemId: string; artworkId: string }> }) {
  const params = paramsSchema.safeParse(await route.params); if (!params.success) return NextResponse.json({ ok: false, error: "Arte inválida." }, { status: 400 });
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-restore", limit: 10, windowSeconds: 3600 }); if (limited) return limited;
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId, params.data.artworkId); if (!context) return NextResponse.json({ ok: false, error: "Orçamento ou arte indisponível." }, { status: 409 });
  try {
    const result = await restorePublicArtworkVersion(context, params.data.artworkId);
    await Promise.all([deleteArtworkObject(result.storagePath), deleteArtworkObject(result.preparedStoragePath)]);
    return NextResponse.json({ ok: true, restoredArtworkId: result.restoredArtworkId });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível restaurar a arte original." }, { status: 409 }); }
}
