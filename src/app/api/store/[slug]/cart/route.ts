import { cartSchema } from "@/domain/commerce/schemas";
import { cartView, replaceCart } from "@/repositories/commerce";
import {
  buyerContext,
  checkCommerceOrigin,
  commerceFailure,
  commerceJson,
  readCommerceBody,
} from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
type Params = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const blocked = await enforcePublicRateLimit(request, "commerce", {
      action: "cart.read",
      limit: 120,
      windowSeconds: 60,
    });
    if (blocked) return blocked;
    const { store, session } = await buyerContext(slug, true, true);
    return commerceJson(await cartView(store, session));
  } catch (error) {
    return commerceFailure(error, "cart.read");
  }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    checkCommerceOrigin(request);
    const { slug } = await params;
    const { store, session } = await buyerContext(slug);
    const input = await readCommerceBody(request, cartSchema);
    await replaceCart(store, session, input.revision, input.lines);
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "cart.update");
  }
}
