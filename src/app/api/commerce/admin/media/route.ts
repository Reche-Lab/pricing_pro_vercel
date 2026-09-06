import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import {
  commerceMediaSchema,
  uploadCommerceImage,
} from "@/services/commerce/media";
import {
  checkCommerceOrigin,
  requireCommerceAdmin,
  readCommerceBody,
  commerceJson,
  commerceFailure,
} from "@/services/commerce/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, {
      action: "commerce.media.upload",
      limit: 30,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, commerceMediaSchema, 4300000);
    return commerceJson(
      await uploadCommerceImage(session.tenantId, input),
      201,
    );
  } catch (error) {
    return commerceFailure(error, "admin.media.upload");
  }
}
