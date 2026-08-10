import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicQuoteByToken } from "@/repositories/quotes";
import { decodeDataUrl, downloadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ token: z.string().min(20).max(200), artworkId: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ token: string; artworkId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false }, { status: 400 });
  const quote = await getPublicQuoteByToken(params.data.token);
  const artwork = quote?.items.flatMap((item) => item.artworks ?? []).find((entry) => entry.id === params.data.artworkId);
  if (!artwork) return NextResponse.json({ ok: false }, { status: 404 });
  if (artwork.data_url) {
    const decoded = decodeDataUrl(artwork.data_url);
    return new NextResponse(Buffer.from(decoded.bytes), { headers: { "content-type": decoded.contentType, "cache-control": "private, max-age=300" } });
  }
  if (!artwork.storage_path) return NextResponse.json({ ok: false }, { status: 404 });
  const stored = await downloadArtworkObject(artwork.storage_path).catch(() => null);
  if (!stored) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(Buffer.from(stored.bytes), { headers: { "content-type": stored.contentType, "cache-control": "private, max-age=300" } });
}
