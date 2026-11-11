import { z } from "zod";
import { checkoutDraftSchema } from "@/domain/commerce/checkout-draft";
import { buyerContext, checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
import { readCheckoutDraft, saveCheckoutDraft } from "@/repositories/commerce-checkout-draft";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const { store, session } = await buyerContext((await params).slug); return commerceJson(await readCheckoutDraft(store.tenant_id, session)); }
  catch (error) { return commerceFailure(error, "checkout.draft.read"); }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    checkCommerceOrigin(request);
    const { store, session } = await buyerContext((await params).slug);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, { action: "commerce.checkout.draft", limit: 120, windowSeconds: 60 });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, z.object({ draft: checkoutDraftSchema, version: z.number().int().nonnegative() }).strict(), 16000);
    return commerceJson(await saveCheckoutDraft(store.tenant_id, session, input.draft, input.version));
  } catch (error) { return commerceFailure(error, "checkout.draft.save"); }
}
