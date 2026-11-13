import { z } from "zod";
import { getCommerceStore } from "@/repositories/commerce";
import { loadGoogleReviews } from "@/repositories/commerce-google-reviews";
import { googleMapsPlaceUrl } from "@/domain/commerce/google-reviews";
import { CommerceError } from "@/domain/commerce/commerce";
import { checkCommerceOrigin, commerceJson, commerceFailure, readCommerceBody } from "./http";
import { requireCommercePreview } from "./preview";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { fetchGoogleReviews } from "./google-reviews";
export async function googleReviewsHttp(request: Request, slug: string, preview = false) {
  try {
    if (request.method === "POST") checkCommerceOrigin(request);
    const store = preview ? await requireCommercePreview(slug) : await getCommerceStore(slug);
    if (!store) throw new CommerceError("Loja indisponível.", 404);
    const row = await loadGoogleReviews(store.tenant_id);
    if (request.method === "GET") return commerceJson(row?.enabled && row.api_key_encrypted ? { enabled: true, title: row.title, sourceUrl: googleMapsPlaceUrl(row.place_id) } : { enabled: false });
    if (!row?.enabled) throw new CommerceError("As avaliações desta loja estão desativadas.", 404);
    await readCommerceBody(request, z.object({}).strict(), 512);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, { action: "commerce.google_reviews.read", limit: 10, windowSeconds: 60 }); if (blocked) return blocked;
    return commerceJson({ data: await fetchGoogleReviews(row, { signal: request.signal }) });
  } catch (error) { return commerceFailure(error, "google_reviews.read"); }
}
