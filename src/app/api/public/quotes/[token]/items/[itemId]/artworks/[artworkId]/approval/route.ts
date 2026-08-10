import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicArtworkContext, selectPublicArtwork } from "@/repositories/public-artworks";

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid(), artworkId: z.string().uuid() });

export async function POST(_request: Request, route: { params: Promise<{ token: string; itemId: string; artworkId: string }> }) {
  const params = paramsSchema.safeParse(await route.params);
  if (!params.success) return NextResponse.json({ ok: false, error: "Arte inválida." }, { status: 400 });
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId, params.data.artworkId);
  if (!context) return NextResponse.json({ ok: false, error: "Este orçamento não está mais disponível para alterações." }, { status: 409 });
  try {
    await selectPublicArtwork(context, params.data.artworkId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível aprovar a arte." }, { status: 422 });
  }
}
