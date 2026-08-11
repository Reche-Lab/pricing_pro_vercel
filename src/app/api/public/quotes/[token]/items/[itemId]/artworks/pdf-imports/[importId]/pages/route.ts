import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { addPublicArtworkPdfPage } from "@/repositories/artwork-pdf-imports";
import { getPublicArtworkContext } from "@/repositories/public-artworks";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";
import { deleteArtworkObject, uploadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid(), importId: z.string().uuid() });
const bodySchema = z.object({ pageNumber: z.number().int().min(1).max(100), artworkName: z.string().trim().min(1).max(120), productionQuantity: z.number().int().min(1).max(100000), artworkFile: z.object({ fileName: z.string().trim().min(1).max(180), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), fileSize: z.number().int().min(1).max(3 * 1024 * 1024), dataUrl: z.string().startsWith("data:image/").max(4_300_000) }) });

export async function POST(request: Request, route: { params: Promise<{ token: string; itemId: string; importId: string }> }) {
  const params = paramsSchema.safeParse(await route.params); const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Página ou imagem inválida." }, { status: 400 });
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-pdf-page", limit: 110, windowSeconds: 3600 }); if (limited) return limited;
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId); if (!context) return unavailable();
  let storagePath: string | null = null;
  try {
    const normalized = await normalizePublicArtworkUpload({ dataUrl: body.data.artworkFile.dataUrl, declaredMimeType: body.data.artworkFile.mimeType, declaredSize: body.data.artworkFile.fileSize, originalFileName: body.data.artworkFile.fileName });
    storagePath = `${context.tenantId}/quotes/${context.quoteId}/items/${context.itemId}/pdf-imports/${params.data.importId}/pages/${String(body.data.pageNumber).padStart(3, "0")}-${randomUUID()}.webp`;
    await uploadArtworkObject({ path: storagePath, contentType: normalized.contentType, bytes: normalized.bytes });
    const artwork = await addPublicArtworkPdfPage(context, { importId: params.data.importId, pageNumber: body.data.pageNumber, artworkName: body.data.artworkName, fileName: normalized.fileName, mimeType: normalized.contentType, fileSize: normalized.fileSize, dataUrl: normalized.dataUrl, storagePath, productionQuantity: body.data.productionQuantity });
    return NextResponse.json({ ok: true, artwork }, { status: 201 });
  } catch (error) {
    await deleteArtworkObject(storagePath);
    console.error("Public artwork PDF page import failed.", { quoteId: context.quoteId, itemId: context.itemId, importId: params.data.importId, pageNumber: body.data.pageNumber, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar a página." }, { status: 422 });
  }
}

function unavailable() { return NextResponse.json({ ok: false, error: "Este orçamento não está mais disponível para alterações." }, { status: 409 }); }
