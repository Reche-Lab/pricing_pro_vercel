import { libraryUploadSchema } from "@/domain/commerce/library";
import { uploadLibraryArtwork } from "@/services/commerce/library";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { checkCommerceOrigin, requireCommerceAdmin, readCommerceBody, commerceJson, commerceFailure } from "@/services/commerce/http";
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "library.upload", limit: 40, windowSeconds: 600 });
    if (blocked) return blocked;
    return commerceJson(await uploadLibraryArtwork(session.tenantId, session.userId, await readCommerceBody(request, libraryUploadSchema, 4300000)), 201);
  } catch (error) { return commerceFailure(error, "admin.library.upload"); }
}
