import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { addQuoteItemArtwork, deleteQuoteItemArtwork } from "@/repositories/quotes";
import { decodeDataUrl, deleteArtworkObject, uploadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({
  quoteId: z.string().uuid(),
  itemId: z.string().uuid()
});

const artworkSchema = z.object({
  artworkName: z.string().trim().max(120).optional().nullable(),
  sourceKind: z.literal("retouch").optional(),
  parentArtworkId: z.string().uuid().optional().nullable(),
  productionQuantity: z.number().int().min(1).max(100000).optional().nullable(),
  artworkFile: z.object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["image/png", "image/jpeg", "image/jpg", "image/webp"]),
    fileSize: z.number().int().min(1).max(3 * 1024 * 1024),
    dataUrl: z.string().startsWith("data:image/").max(4_300_000)
  })
}).superRefine((value, context) => {
  if (value.sourceKind === "retouch" && !value.parentArtworkId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["parentArtworkId"], message: "Informe a arte original do retoque." });
  }
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string; itemId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false, error: "Orçamento ou item inválido." }, { status: 400 });
  const parsed = artworkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Use uma imagem PNG, JPEG ou WebP com até 3 MB." }, { status: 400 });
  }

  try {
    const decoded = decodeDataUrl(parsed.data.artworkFile.dataUrl);
    const storagePath = await uploadArtworkObject({
      path: `${session.tenantId}/quotes/${params.data.quoteId}/items/${params.data.itemId}/original/${randomUUID()}-${safeFileName(parsed.data.artworkFile.fileName)}`,
      contentType: decoded.contentType,
      bytes: decoded.bytes
    });
    const artwork = await addQuoteItemArtwork(
      session.userId,
      session.tenantId,
      params.data.quoteId,
      params.data.itemId,
      { ...parsed.data, storagePath }
    );
    console.info("Quote artwork uploaded.", {
      quoteId: params.data.quoteId,
      itemId: params.data.itemId,
      artworkId: artwork.id,
      fileName: artwork.file_name,
      mimeType: artwork.mime_type,
      fileSize: artwork.file_size
    });
    return NextResponse.json({ ok: true, artwork }, { status: 201 });
  } catch (error) {
    console.error("Quote artwork upload failed.", {
      quoteId: params.data.quoteId,
      itemId: params.data.itemId,
      message: error instanceof Error ? error.message : "Erro desconhecido"
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Não foi possível incluir a imagem." },
      { status: 409 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ quoteId: string; itemId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const params = paramsSchema.safeParse(await context.params);
  const artworkId = z.string().uuid().safeParse(new URL(request.url).searchParams.get("artworkId"));
  if (!params.success || !artworkId.success) {
    return NextResponse.json({ ok: false, error: "Imagem, orçamento ou item inválido." }, { status: 400 });
  }

  try {
    const artwork = await deleteQuoteItemArtwork(
      session.userId,
      session.tenantId,
      params.data.quoteId,
      params.data.itemId,
      artworkId.data
    );
    if (!artwork) return NextResponse.json({ ok: false, error: "Imagem não encontrada." }, { status: 404 });
    await deleteArtworkObject(artwork.storage_path);
    await deleteArtworkObject(artwork.prepared_storage_path);
    console.info("Quote artwork deleted.", {
      quoteId: params.data.quoteId,
      itemId: params.data.itemId,
      artworkId: artwork.id,
      fileName: artwork.file_name
    });
    return NextResponse.json({ ok: true, artwork });
  } catch (error) {
    console.error("Quote artwork deletion failed.", {
      quoteId: params.data.quoteId,
      itemId: params.data.itemId,
      artworkId: artworkId.data,
      message: error instanceof Error ? error.message : "Erro desconhecido"
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Não foi possível remover a imagem." },
      { status: 409 }
    );
  }
}

function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}
