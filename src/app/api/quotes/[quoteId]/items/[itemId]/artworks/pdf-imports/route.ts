import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { createArtworkPdfImport } from "@/repositories/artwork-pdf-imports";
import { assertQuoteCanBeEdited } from "@/repositories/quotes";
import { validateArtworkPdf } from "@/services/artwork/pdf-import";
import { artworkStorageConfigured, deleteArtworkObject, uploadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid() });
const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  fileSize: z.number().int().min(1).max(4 * 1024 * 1024),
  pageCount: z.number().int().min(1).max(100),
  dataUrl: z.string().startsWith("data:application/pdf;base64,").max(5_700_000)
});

export async function POST(request: Request, route: { params: Promise<{ quoteId: string; itemId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await route.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Use um PDF com até 4 MB e 100 páginas." }, { status: 400 });
  if (!artworkStorageConfigured()) return NextResponse.json({ ok: false, error: "Configure o Supabase Storage antes de importar PDFs." }, { status: 503 });
  let storagePath: string | null = null;
  try {
    await assertQuoteCanBeEdited(session.userId, session.tenantId, params.data.quoteId);
    const validated = await validateArtworkPdf({ dataUrl: body.data.dataUrl, declaredSize: body.data.fileSize, declaredPageCount: body.data.pageCount });
    storagePath = `${session.tenantId}/quotes/${params.data.quoteId}/items/${params.data.itemId}/pdf-imports/${randomUUID()}-${safeFileName(body.data.fileName)}`;
    await uploadArtworkObject({ path: storagePath, contentType: "application/pdf", bytes: validated.bytes });
    const pdfImport = await createArtworkPdfImport({ tenantId: session.tenantId, quoteId: params.data.quoteId, itemId: params.data.itemId, fileName: body.data.fileName, fileSize: body.data.fileSize, pageCount: validated.pageCount, storagePath, userId: session.userId, publicUpload: false });
    console.info("Artwork PDF import created.", { quoteId: params.data.quoteId, itemId: params.data.itemId, importId: pdfImport.id, pageCount: validated.pageCount });
    return NextResponse.json({ ok: true, importId: pdfImport.id }, { status: 201 });
  } catch (error) {
    await deleteArtworkObject(storagePath);
    console.error("Artwork PDF import failed.", { quoteId: params.data.quoteId, itemId: params.data.itemId, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível importar o PDF." }, { status: 422 });
  }
}

function safeFileName(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-"); }
