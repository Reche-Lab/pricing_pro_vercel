import {
  commerceVideoInputSchema,
  commerceVideoCompleteSchema,
} from "@/domain/commerce/product-media";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import {
  beginCommerceVideo,
  completeCommerceVideo,
} from "@/services/commerce/video-media";
import {
  checkCommerceOrigin,
  requireCommerceAdmin,
  readCommerceBody,
  commerceJson,
  commerceFailure,
} from "@/services/commerce/http";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(request: Request, complete: boolean) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, {
      action: complete ? "commerce.video.complete" : "commerce.video.begin",
      limit: complete ? 30 : 10,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    if (complete) {
      const input = await readCommerceBody(
        request,
        commerceVideoCompleteSchema,
        4096,
      );
      return commerceJson(
        await completeCommerceVideo(
          session.tenantId,
          session.userId,
          input.uploadId,
        ),
      );
    }
    const input = await readCommerceBody(
      request,
      commerceVideoInputSchema,
      4096,
    );
    return commerceJson(
      await beginCommerceVideo(session.tenantId, session.userId, input),
      201,
    );
  } catch (error) {
    return commerceFailure(
      error,
      complete ? "admin.video.complete" : "admin.video.begin",
    );
  }
}
export const POST = (request: Request) => handle(request, false);
export const PUT = (request: Request) => handle(request, true);
