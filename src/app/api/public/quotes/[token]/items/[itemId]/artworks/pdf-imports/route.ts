import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { createPublicArtworkPdfImport } from "@/repositories/artwork-pdf-imports";
import { getPublicArtworkContext } from "@/repositories/public-artworks";
import { validateArtworkPdf } from "@/services/artwork/pdf-import";
import { artworkStorageConfigured, deleteArtworkObject, uploadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ token: z.string().min(20).max(200), itemId: z.string().uuid() });
const bodySchema = z.object({ fileName: z.string().trim().min(1).max(180), fileSize: z.number().int().min(1).max(4 * 1024 * 1024), pageCount: z.number().int().min(1).max(100), dataUrl: z.string().startsWith("data:application/pdf;base64,").max(5_700_000) });

export async function POST(request: Request, route: { params: Promise<{ token: string; itemId: string }> }) {
  const params = paramsSchema.safeParse(await route.params); const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Use um PDF com até 4 MB e 100 páginas." }, { status: 400 });
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-pdf-import", limit: 3, windowSeconds: 3600 }); if (limited) return limited;
  const context = await getPublicArtworkContext(params.data.token, params.data.itemId); if (!context) return unavailable();
  if (!artworkStorageConfigured()) return NextResponse.json({ ok: false, error: "O armazenamento de artes não está configurado." }, { status: 503 });
  let storagePath: string | null = null;
  try {
    const validated = await validateArtworkPdf({ dataUrl: body.data.dataUrl, declaredSize: body.data.fileSize, declaredPageCount: body.data.pageCount });
    storagePath = `${context.tenantId}/quotes/${context.quoteId}/items/${context.itemId}/pdf-imports/${randomUUID()}-${safeFileName(body.data.fileName)}`;
    await uploadArtworkObject({ path: storagePath, contentType: "application/pdf", bytes: validated.bytes });
    const pdfImport = await createPublicArtworkPdfImport(context, { fileName: body.data.fileName, fileSize: body.data.fileSize, pageCount: validated.pageCount, storagePath });
    console.info("Public artwork PDF import created.", { quoteId: context.quoteId, itemId: context.itemId, importId: pdfImport.id, pageCount: validated.pageCount });
    return NextResponse.json({ ok: true, importId: pdfImport.id }, { status: 201 });
  } catch (error) {
    await deleteArtworkObject(storagePath);
    console.error("Public artwork PDF import failed.", { quoteId: context.quoteId, itemId: context.itemId, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível importar o PDF." }, { status: 422 });
  }
}

function unavailable() { return NextResponse.json({ ok: false, error: "Este orçamento não está mais disponível para alterações." }, { status: 409 }); }
function safeFileName(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-"); }
