import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getArtworkPreparationSource } from "@/repositories/artwork-production";
import { decodeDataUrl, downloadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid(), artworkId: z.string().uuid() });

export async function GET(request: Request, context: { params: Promise<{ quoteId: string; itemId: string; artworkId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false, error: "Arte inválida." }, { status: 400 });
  const artwork = await getArtworkPreparationSource(session.userId, session.tenantId, params.data.quoteId, params.data.itemId, params.data.artworkId);
  if (!artwork) return NextResponse.json({ ok: false, error: "Arte não encontrada." }, { status: 404 });
  const prepared = new URL(request.url).searchParams.get("kind") === "prepared";
  const dataUrl = prepared ? artwork.prepared_data_url : artwork.data_url;
  const storagePath = prepared ? artwork.prepared_storage_path : artwork.storage_path;
  try {
    if (dataUrl) {
      const decoded = decodeDataUrl(dataUrl);
      return new NextResponse(Buffer.from(decoded.bytes), { headers: { "content-type": decoded.contentType, "cache-control": "private, max-age=300" } });
    }
    if (!storagePath) throw new Error("Arquivo indisponível.");
    const stored = await downloadArtworkObject(storagePath);
    if (!stored) throw new Error("Supabase Storage não configurado.");
    return new NextResponse(Buffer.from(stored.bytes), { headers: { "content-type": stored.contentType, "cache-control": "private, max-age=300" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Arquivo indisponível." }, { status: 404 });
  }
}
