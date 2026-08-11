import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { addPublicArtwork, getPublicArtworkContext } from "@/repositories/public-artworks";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";
import { deleteArtworkObject, uploadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid() });
const bodySchema = z.object({
  artworkName: z.string().trim().max(120).optional().nullable(),
  artworkFile: z.object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    fileSize: z.number().int().min(1).max(3 * 1024 * 1024),
    dataUrl: z.string().startsWith("data:image/").max(4_300_000)
  })
});

export async function POST(request: Request, route: { params: Promise<{ token: string; itemId: string }> }) {
  const params = paramsSchema.safeParse(await route.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Use PNG, JPEG ou WebP com até 3 MB." }, { status: 400 });
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-upload", limit: 10, windowSeconds: 3600 });
  if (limited) return limited;
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId);
  if (!context) return unavailable();
  let storagePath: string | null = null;
  try {
    const normalized = await normalizePublicArtworkUpload({
      dataUrl: body.data.artworkFile.dataUrl,
      declaredMimeType: body.data.artworkFile.mimeType,
      declaredSize: body.data.artworkFile.fileSize,
      originalFileName: body.data.artworkFile.fileName
    });
    const storedFileName = `${randomUUID()}-${normalized.fileName}`;
    storagePath = await uploadArtworkObject({
      path: `${context.tenantId}/quotes/${context.quoteId}/items/${context.itemId}/original/${storedFileName}`,
      contentType: normalized.contentType,
      bytes: normalized.bytes
    });
    const artwork = await addPublicArtwork({
      context,
      artworkName: body.data.artworkName ?? null,
      fileName: normalized.fileName,
      mimeType: normalized.contentType,
      fileSize: normalized.fileSize,
      dataUrl: normalized.dataUrl,
      storagePath
    });
    return NextResponse.json({ ok: true, artwork }, { status: 201 });
  } catch (error) {
    await deleteArtworkObject(storagePath);
    console.error("Public artwork upload failed.", { quoteId: context.quoteId, itemId: context.itemId, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível enviar a arte." }, { status: 422 });
  }
}

function unavailable() { return NextResponse.json({ ok: false, error: "Este orçamento não está mais disponível para alterações." }, { status: 409 }); }
