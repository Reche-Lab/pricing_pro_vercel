import { z } from "zod";
import { getCommerceStore } from "@/repositories/commerce";
import {
  readCommerceLibrary,
  librarySource,
} from "@/repositories/commerce-library";
import { libraryQuerySchema } from "@/domain/commerce/library";
import { CommerceError } from "@/domain/commerce/commerce";
import { requireCommercePreview } from "./preview";
import {
  buyerContext,
  checkCommerceOrigin,
  commerceFailure,
  commerceJson,
  readCommerceBody,
} from "./http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { downloadArtworkObject } from "@/services/storage/artwork-storage";
import { previewLibrarySelection, selectLibraryArtwork } from "./library";

export async function libraryStore(slug: string, preview: boolean) {
  if (preview) return requireCommercePreview(slug);
  const store = await getCommerceStore(slug);
  if (!store?.art_library_enabled)
    throw new CommerceError("Biblioteca indisponível.", 404);
  return store;
}
export async function libraryListing(
  request: Request,
  slug: string,
  preview = false,
) {
  try {
    const store = await libraryStore(slug, preview);
    const parsed = libraryQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success)
      throw new CommerceError("Confira os filtros da biblioteca.");
    const input = parsed.data;
    return commerceJson(
      await readCommerceLibrary(
        store.tenant_id,
        input,
        preview ? "preview" : "public",
      ),
    );
  } catch (error) {
    return commerceFailure(error, "library.list");
  }
}
export async function libraryThumbnail(
  _request: Request,
  slug: string,
  artworkId: string,
  preview = false,
) {
  try {
    if (!z.string().uuid().safeParse(artworkId).success)
      throw new CommerceError("Arte não encontrada.", 404);
    const store = await libraryStore(slug, preview);
    const art = await librarySource(
      store.tenant_id,
      artworkId,
      preview ? "preview" : "public",
    );
    const file = await downloadArtworkObject(art.thumbnail_path);
    if (!file) throw new CommerceError("Miniatura indisponível.", 404);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "content-type": "image/webp",
        "cache-control": preview ? "private, no-store" : "public, max-age=60",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    });
  } catch (error) {
    return commerceFailure(error, "library.thumbnail");
  }
}
export async function librarySelection(
  request: Request,
  slug: string,
  preview = false,
) {
  try {
    checkCommerceOrigin(request);
    const input = await readCommerceBody(
      request,
      z
        .object({ artworkId: z.string().uuid(), productId: z.string().uuid() })
        .strict(),
    );
    const store = await libraryStore(slug, preview);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, {
      action: "library.select",
      limit: 30,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    if (preview)
      return commerceJson(
        await previewLibrarySelection(
          store.tenant_id,
          input.artworkId,
          input.productId,
        ),
      );
    const { session } = await buyerContext(slug, true);
    return commerceJson(
      await selectLibraryArtwork(
        store.tenant_id,
        session,
        input.artworkId,
        input.productId,
      ),
      201,
    );
  } catch (error) {
    return commerceFailure(error, "library.select");
  }
}
