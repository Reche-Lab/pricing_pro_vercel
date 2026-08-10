import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { addQuoteItemArtwork, assertQuoteCanBeEdited } from "@/repositories/quotes";
import { getArtworkPreparationSource, markArtworkAsGenerated, reserveArtworkAiGenerationAttempt, resolveArtworkGeometry } from "@/repositories/artwork-production";
import { resolvePrintGeometry } from "@/domain/artwork/geometry";
import { decodeImageDataUrl } from "@/services/artwork/production";
import { generateArtworkImage, suggestArtworkDirection } from "@/services/openrouter/artwork-agent";
import { loadArtworkDataUrl, uploadArtworkObject } from "@/services/storage/artwork-storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid() });
const bodySchema = z.object({
  action: z.enum(["suggest", "generate"]),
  brief: z.string().trim().min(10).max(3000),
  artworkId: z.string().uuid().optional().nullable(),
  diameterMm: z.number().min(10).max(300).optional(),
  product: z.string().trim().max(200).default("produto personalizado"),
  geometry: z.object({
    shape: z.enum(["circle", "square", "rectangle", "triangle", "hexagon"]),
    widthMm: z.number().min(5).max(1000),
    heightMm: z.number().min(5).max(1000),
    cornerStyle: z.enum(["sharp", "rounded"]),
    cornerRadiusMm: z.number().min(0).max(500),
    rotationDegrees: z.number().min(-360).max(360),
    allowPrintRotation: z.boolean()
  }).optional()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string; itemId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Informe um briefing com pelo menos 10 caracteres." }, { status: 400 });

  let generationAttempt: { reserved: boolean; limit: number; attemptsUsed: number; attemptsRemaining: number } | null = null;
  try {
    await assertQuoteCanBeEdited(session.userId, session.tenantId, params.data.quoteId);
    const reference = body.data.artworkId
      ? await getArtworkPreparationSource(session.userId, session.tenantId, params.data.quoteId, params.data.itemId, body.data.artworkId)
      : null;
    const geometry = body.data.geometry
      ?? (reference ? resolveArtworkGeometry(reference) : null)
      ?? resolvePrintGeometry({ print_diameter_mm: body.data.diameterMm });
    if (!geometry) throw new Error("Configure o formato e as medidas de impressão do produto.");
    const referenceDataUrl = reference ? await loadArtworkDataUrl(reference.data_url, reference.storage_path) : null;
    if (body.data.action === "suggest") {
      const suggestions = await suggestArtworkDirection({ brief: body.data.brief, product: body.data.product, geometry, referenceDataUrl });
      return NextResponse.json({ ok: true, suggestions });
    }

    generationAttempt = await reserveArtworkAiGenerationAttempt({ userId: session.userId, tenantId: session.tenantId, quoteId: params.data.quoteId, itemId: params.data.itemId });
    if (!generationAttempt.reserved) {
      const error = generationAttempt.limit === 0
        ? "A geração de artes por IA está desativada para este tenant."
        : `O limite de ${generationAttempt.limit} tentativas de geração para este produto foi atingido.`;
      return NextResponse.json({ ok: false, error, ...generationAttempt }, { status: 429 });
    }

    const generated = await generateArtworkImage({ prompt: body.data.brief, geometry, referenceDataUrl });
    const optimized = await optimizeGeneratedImage(generated.dataUrl);
    const fileName = `arte-openrouter-${Date.now()}.webp`;
    const storagePath = await uploadArtworkObject({
      path: `${session.tenantId}/quotes/${params.data.quoteId}/items/${params.data.itemId}/original/${fileName}`,
      contentType: "image/webp",
      bytes: optimized
    });
    const artwork = await addQuoteItemArtwork(session.userId, session.tenantId, params.data.quoteId, params.data.itemId, {
      artworkName: "Arte gerada por IA",
      artworkFile: { fileName, mimeType: "image/webp", fileSize: optimized.length, dataUrl: `data:image/webp;base64,${optimized.toString("base64")}` },
      storagePath
    });
    await markArtworkAsGenerated({
      userId: session.userId,
      tenantId: session.tenantId,
      artworkId: artwork.id,
      referenceArtworkId: reference?.id ?? null,
      prompt: generated.prompt
    });
    return NextResponse.json({ ok: true, artwork, ...generationAttempt }, { status: 201 });
  } catch (error) {
    console.error("OpenRouter artwork action failed.", { ...params.data, action: body.data.action, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível executar o assistente criativo.", ...(generationAttempt ?? {}) }, { status: 502 });
  }
}

async function optimizeGeneratedImage(dataUrl: string) {
  let quality = 92;
  let output = await sharp(decodeImageDataUrl(dataUrl)).rotate().resize(1800, 1800, { fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
  while (output.length > 3 * 1024 * 1024 && quality > 60) {
    quality -= 10;
    output = await sharp(decodeImageDataUrl(dataUrl)).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
  }
  if (output.length > 3 * 1024 * 1024) throw new Error("A imagem gerada ficou maior que o limite de 3 MB.");
  return output;
}
