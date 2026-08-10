import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicArtworkContext, savePublicPreparedArtwork } from "@/repositories/public-artworks";
import { prepareArtwork } from "@/services/artwork/production";
import { decodeDataUrl, loadArtworkDataUrl, uploadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid(), artworkId: z.string().uuid() });
const bodySchema = z.object({
  diameterMm: z.number().min(10).max(300).optional(), scale: z.number().min(0.1).max(5).default(1),
  offsetX: z.number().min(-1).max(1).default(0), offsetY: z.number().min(-1).max(1).default(0),
  rotationDegrees: z.number().min(-180).max(180).default(0)
});

export async function POST(request: Request, route: { params: Promise<{ token: string; itemId: string; artworkId: string }> }) {
  const params = paramsSchema.safeParse(await route.params);
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Dados de enquadramento inválidos." }, { status: 400 });
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId, params.data.artworkId);
  if (!context?.artwork) return NextResponse.json({ ok: false, error: "Arte ou orçamento indisponível." }, { status: 409 });
  const geometry = context.geometry;
  if (!geometry) return NextResponse.json({ ok: false, error: "O produto não possui geometria de impressão configurada." }, { status: 422 });
  try {
    const source = await loadArtworkDataUrl(context.artwork.data_url, context.artwork.storage_path);
    const prepared = await prepareArtwork({ dataUrl: source, geometry, bleedMm: context.profile.bleedMm, dpi: context.profile.dpi, scale: body.data.scale, offsetX: body.data.offsetX, offsetY: body.data.offsetY, rotationDegrees: body.data.rotationDegrees });
    const decoded = decodeDataUrl(prepared.dataUrl);
    const storagePath = await uploadArtworkObject({ path: `${context.tenantId}/quotes/${context.quoteId}/items/${context.itemId}/prepared/${params.data.artworkId}-v${Date.now()}.png`, contentType: "image/png", bytes: decoded.bytes });
    await savePublicPreparedArtwork({ context, artworkId: params.data.artworkId, geometry, prepared, preparedDataUrl: storagePath ? null : prepared.dataUrl, preparedStoragePath: storagePath, crop: body.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível reenquadrar a arte." }, { status: 422 });
  }
}
