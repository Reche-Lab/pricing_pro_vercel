import { z } from "zod";
import { cartLineSchema } from "@/domain/commerce/schemas";
import { calculateCart } from "@/domain/commerce/commerce";
import { commerceProducts } from "@/repositories/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import {
  checkCommerceOrigin,
  readCommerceBody,
  commerceFailure,
  commerceJson,
} from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    checkCommerceOrigin(request);
    const store = await requireCommercePreview((await params).slug);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, {
      action: "commerce.preview.price",
      limit: 90,
      windowSeconds: 60,
    });
    if (blocked) return blocked;
    const input = await readCommerceBody(
      request,
      z.object({ lines: z.array(cartLineSchema).max(40) }).strict(),
    );
    return commerceJson(
      calculateCart(input.lines, await commerceProducts(store.tenant_id)),
    );
  } catch (error) {
    return commerceFailure(error, "preview.price");
  }
}
