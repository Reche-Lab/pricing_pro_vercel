import { z } from "zod";
import { cartLineSchema } from "@/domain/commerce/schemas";
import { calculateCart, CommerceError } from "@/domain/commerce/commerce";
import { commerceProducts, getCommerceStore } from "@/repositories/commerce";
import {
  checkCommerceOrigin,
  readCommerceBody,
  commerceJson,
  commerceFailure,
} from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    checkCommerceOrigin(request);
    const blocked = await enforcePublicRateLimit(request, "commerce", {
      action: "price",
      limit: 90,
      windowSeconds: 60,
    });
    if (blocked) return blocked;
    const store = await getCommerceStore((await params).slug);
    if (!store) throw new CommerceError("Loja indisponível.", 404);
    const input = await readCommerceBody(
      request,
      z.object({ lines: z.array(cartLineSchema).min(1).max(40) }).strict(),
    );
    return commerceJson(
      calculateCart(input.lines, await commerceProducts(store.tenant_id)),
    );
  } catch (error) {
    return commerceFailure(error, "price.calculate");
  }
}
