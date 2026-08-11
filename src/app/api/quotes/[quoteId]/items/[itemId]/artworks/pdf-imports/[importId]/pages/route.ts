import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { addArtworkPdfPage } from "@/repositories/artwork-pdf-imports";
import { assertQuoteCanBeEdited } from "@/repositories/quotes";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";
import { deleteArtworkObject, uploadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid(), importId: z.string().uuid() });
const bodySchema = z.object({
  pageNumber: z.number().int().min(1).max(100), artworkName: z.string().trim().min(1).max(120),
  productionQuantity: z.number().int().min(1).max(100000),
  artworkFile: z.object({ fileName: z.string().trim().min(1).max(180), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), fileSize: z.number().int().min(1).max(3 * 1024 * 1024), dataUrl: z.string().startsWith("data:image/").max(4_300_000) })
});

export async function POST(request: Request, route: { params: Promise<{ quoteId: string; itemId: string; importId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId); if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await route.params); const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Página ou imagem inválida." }, { status: 400 });
  let storagePath: string | null = null;
  try {
    await assertQuoteCanBeEdited(session.userId, session.tenantId, params.data.quoteId);
    const normalized = await normalizePublicArtworkUpload({ dataUrl: body.data.artworkFile.dataUrl, declaredMimeType: body.data.artworkFile.mimeType, declaredSize: body.data.artworkFile.fileSize, originalFileName: body.data.artworkFile.fileName });
    storagePath = `${session.tenantId}/quotes/${params.data.quoteId}/items/${params.data.itemId}/pdf-imports/${params.data.importId}/pages/${String(body.data.pageNumber).padStart(3, "0")}-${randomUUID()}.webp`;
    await uploadArtworkObject({ path: storagePath, contentType: normalized.contentType, bytes: normalized.bytes });
    const artwork = await addArtworkPdfPage(session.userId, session.tenantId, params.data.quoteId, params.data.itemId, { importId: params.data.importId, pageNumber: body.data.pageNumber, artworkName: body.data.artworkName, fileName: normalized.fileName, mimeType: normalized.contentType, fileSize: normalized.fileSize, dataUrl: normalized.dataUrl, storagePath, productionQuantity: body.data.productionQuantity });
    return NextResponse.json({ ok: true, artwork }, { status: 201 });
  } catch (error) {
    await deleteArtworkObject(storagePath);
    console.error("Artwork PDF page import failed.", { ...params.data, pageNumber: body.data.pageNumber, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar a página." }, { status: 422 });
  }
}
