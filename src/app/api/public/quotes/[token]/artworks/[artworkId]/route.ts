import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicQuoteByToken } from "@/repositories/quotes";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { isSafePublicArtworkContentType } from "@/services/artwork/public-upload";
import { decodeDataUrl, downloadArtworkObject } from "@/services/storage/artwork-storage";

const paramsSchema = z.object({ token: z.string().min(20).max(200), artworkId: z.string().uuid() });

export async function GET(request: Request, context: { params: Promise<{ token: string; artworkId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false }, { status: 400 });
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "artwork-read", limit: 120, windowSeconds: 60 });
  if (limited) return limited;
  const quote = await getPublicQuoteByToken(params.data.token);
  const artwork = quote?.items.flatMap((item) => item.artworks ?? []).find((entry) => entry.id === params.data.artworkId);
  if (!artwork) return NextResponse.json({ ok: false }, { status: 404 });
  const prepared = new URL(request.url).searchParams.get("kind") === "prepared";
  const dataUrl = prepared ? artwork.prepared_data_url : artwork.data_url;
  const storagePath = prepared ? artwork.prepared_storage_path : artwork.storage_path;
  if (dataUrl) {
    const decoded = decodeDataUrl(dataUrl);
    if (!isSafePublicArtworkContentType(decoded.contentType)) return NextResponse.json({ ok: false }, { status: 415 });
    return artworkResponse(decoded.bytes, decoded.contentType);
  }
  if (!storagePath) return NextResponse.json({ ok: false }, { status: 404 });
  const stored = await downloadArtworkObject(storagePath).catch(() => null);
  if (!stored) return NextResponse.json({ ok: false }, { status: 404 });
  if (!isSafePublicArtworkContentType(stored.contentType)) return NextResponse.json({ ok: false }, { status: 415 });
  return artworkResponse(stored.bytes, stored.contentType);
}

function artworkResponse(bytes: Uint8Array, contentType: string) {
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": contentType,
    "cache-control": "private, no-store, max-age=0",
    "content-security-policy": "sandbox; default-src 'none'",
    "x-content-type-options": "nosniff"
  } });
}
