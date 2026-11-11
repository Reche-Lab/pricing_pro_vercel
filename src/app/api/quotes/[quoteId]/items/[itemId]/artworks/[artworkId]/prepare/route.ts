import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { getArtworkPreparationSource, getArtworkProductionData, resolveArtworkGeometry, resolveArtworkMargins, savePreparedArtwork } from "@/repositories/artwork-production";
import { prepareArtwork } from "@/services/artwork/production";
import { decodeDataUrl, loadArtworkDataUrl, uploadArtworkObject } from "@/services/storage/artwork-storage";
import { artworkFrameSchema } from "@/domain/artwork/framing";

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid(), artworkId: z.string().uuid() });
const bodySchema = artworkFrameSchema.extend({ diameterMm: z.number().min(10).max(300).optional() });

export async function POST(request: Request, context: { params: Promise<{ quoteId: string; itemId: string; artworkId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });

  try {
    const [source, production] = await Promise.all([
      getArtworkPreparationSource(session.userId, session.tenantId, params.data.quoteId, params.data.itemId, params.data.artworkId),
      getArtworkProductionData(session.userId, session.tenantId, params.data.quoteId)
    ]);
    if (!source || !production) return NextResponse.json({ ok: false, error: "Arte não encontrada." }, { status: 404 });
    const geometry = resolveArtworkGeometry(source);
    if (!geometry) throw new Error("Defina a geometria de impressão deste produto antes de preparar a arte.");
    const margins = resolveArtworkMargins(source, production.profile);
    const sourceDataUrl = await loadArtworkDataUrl(source.data_url, source.storage_path);
    const prepared = await prepareArtwork({
      dataUrl: sourceDataUrl,
      geometry,
      bleedMm: margins.bleedMm,
      safeMarginMm: margins.safeMarginMm,
      dpi: production.profile.dpi,
      scale: body.data.scale,
      offsetX: body.data.offsetX,
      offsetY: body.data.offsetY,
      rotationDegrees: body.data.rotationDegrees,
      backgroundColor: body.data.backgroundColor
    });
    const decodedPrepared = decodeDataUrl(prepared.dataUrl);
    const preparedStoragePath = await uploadArtworkObject({
      path: `${session.tenantId}/quotes/${params.data.quoteId}/items/${params.data.itemId}/prepared/${params.data.artworkId}-v${Date.now()}.png`,
      contentType: "image/png",
      bytes: decodedPrepared.bytes
    });
    const artwork = await savePreparedArtwork({
      userId: session.userId, tenantId: session.tenantId, quoteId: params.data.quoteId,
      itemId: params.data.itemId, artworkId: params.data.artworkId, geometry,
      margins,
      profile: production.profile,
      prepared,
      preparedDataUrl: preparedStoragePath ? null : prepared.dataUrl,
      preparedStoragePath,
      crop: body.data
    });
    return NextResponse.json({ ok: true, artwork });
  } catch (error) {
    console.error("Artwork preparation failed.", { ...params.data, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível preparar a arte." }, { status: 422 });
  }
}
