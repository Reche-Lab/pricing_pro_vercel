import { buyerQuoteSchema } from "@/domain/commerce/buyer-quote";
import { createBuyerQuote, listBuyerQuotes } from "@/repositories/commerce-buyer-quotes";
import { buyerContext, checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const { store, session } = await buyerContext((await params).slug, false, true); return commerceJson({ quotes: await listBuyerQuotes(store.tenant_id, session) }); }
  catch (error) { return commerceFailure(error, "buyer.quotes.list"); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkCommerceOrigin(request);
    const { store, session } = await buyerContext((await params).slug);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, { action: "commerce.quote.create", limit: 15, windowSeconds: 600 });
    if (blocked) return blocked;
    return commerceJson(await createBuyerQuote(store, session, await readCommerceBody(request, buyerQuoteSchema)), 201);
  } catch (error) { return commerceFailure(error, "buyer.quotes.create"); }
}
