import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import { librarySource } from "@/repositories/commerce-library";
import { downloadArtworkObject } from "@/services/storage/artwork-storage";
import { requireCommerceAdmin, commerceFailure } from "@/services/commerce/http";
export async function GET(request: Request, { params }: { params: Promise<{ artworkId: string }> }) {
  try {
    const { session } = await requireCommerceAdmin();
    const { artworkId } = await params;
    if (!z.string().uuid().safeParse(artworkId).success) throw new CommerceError("Arte não encontrada.", 404);
    const art = await librarySource(session.tenantId, artworkId, "admin");
    const file = await downloadArtworkObject(new URL(request.url).searchParams.has("thumbnail") ? art.thumbnail_path : art.storage_path);
    if (!file) throw new CommerceError("Arquivo indisponível.", 404);
    return new Response(Buffer.from(file.bytes), { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
  } catch (error) { return commerceFailure(error, "admin.library.asset"); }
}
