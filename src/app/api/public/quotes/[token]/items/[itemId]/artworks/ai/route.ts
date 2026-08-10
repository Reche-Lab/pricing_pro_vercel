import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { addPublicArtwork, getPublicArtworkContext, markPublicArtworkAsGenerated, reservePublicArtworkAiAttempt } from "@/repositories/public-artworks";
import { decodeImageDataUrl } from "@/services/artwork/production";
import { generateArtworkImage, suggestArtworkDirection } from "@/services/openrouter/artwork-agent";
import { loadArtworkDataUrl, uploadArtworkObject } from "@/services/storage/artwork-storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid() });
const bodySchema = z.object({
  action: z.enum(["suggest", "generate"]),
  brief: z.string().trim().min(10).max(3000),
  artworkId: z.string().uuid().optional().nullable()
});

export async function POST(request: Request, route: { params: Promise<{ token: string; itemId: string }> }) {
  const params = paramsSchema.safeParse(await route.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Descreva a solicitação em pelo menos 10 caracteres." }, { status: 400 });
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId, body.data.artworkId);
  if (!context) return NextResponse.json({ ok: false, error: "Orçamento ou referência indisponível." }, { status: 409 });
  if (!context.diameterMm) return NextResponse.json({ ok: false, error: "O produto não possui diâmetro de impressão configurado." }, { status: 422 });
  if (body.data.action === "generate" && context.artworkCount >= 10) return NextResponse.json({ ok: false, error: "Este produto já possui o limite de 10 versões." }, { status: 409 });
  let generationAttempt: { reserved: boolean; limit: number; attemptsUsed: number; attemptsRemaining: number } | null = null;
  try {
    const referenceDataUrl = context.artwork ? await loadArtworkDataUrl(context.artwork.data_url, context.artwork.storage_path) : null;
    if (body.data.action === "suggest") {
      const suggestions = await suggestArtworkDirection({ brief: body.data.brief, product: context.itemDescription, diameterMm: context.diameterMm, referenceDataUrl });
      return NextResponse.json({ ok: true, suggestions });
    }
    generationAttempt = await reservePublicArtworkAiAttempt(context);
    if (!generationAttempt.reserved) {
      const error = generationAttempt.limit === 0
        ? "A geração de artes por IA está desativada para este orçamento."
        : `O limite de ${generationAttempt.limit} tentativas de geração para este produto foi atingido.`;
      return NextResponse.json({ ok: false, error, ...generationAttempt }, { status: 429 });
    }
    const generated = await generateArtworkImage({ prompt: body.data.brief, diameterMm: context.diameterMm, referenceDataUrl });
    const bytes = await optimize(generated.dataUrl);
    const fileName = `arte-assistente-${Date.now()}.webp`;
    const dataUrl = `data:image/webp;base64,${bytes.toString("base64")}`;
    const storagePath = await uploadArtworkObject({
      path: `${context.tenantId}/quotes/${context.quoteId}/items/${context.itemId}/original/${fileName}`,
      contentType: "image/webp",
      bytes
    });
    const artwork = await addPublicArtwork({ context, artworkName: "Versão criada pelo assistente", fileName, mimeType: "image/webp", fileSize: bytes.length, dataUrl, storagePath });
    await markPublicArtworkAsGenerated(context, artwork.id, generated.prompt, context.artwork?.id);
    return NextResponse.json({ ok: true, artwork, ...generationAttempt }, { status: 201 });
  } catch (error) {
    console.error("Public creative assistant failed.", { quoteId: context.quoteId, itemId: context.itemId, action: body.data.action, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível executar o assistente.", ...(generationAttempt ?? {}) }, { status: 502 });
  }
}

async function optimize(dataUrl: string) {
  let quality = 92;
  let output = await sharp(decodeImageDataUrl(dataUrl)).rotate().resize(1800, 1800, { fit: "cover" }).webp({ quality }).toBuffer();
  while (output.length > 3 * 1024 * 1024 && quality > 60) {
    quality -= 10;
    output = await sharp(decodeImageDataUrl(dataUrl)).rotate().resize(1600, 1600, { fit: "cover" }).webp({ quality }).toBuffer();
  }
  if (output.length > 3 * 1024 * 1024) throw new Error("A imagem gerada excedeu 3 MB.");
  return output;
}
