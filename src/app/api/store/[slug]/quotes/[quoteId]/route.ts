import { z } from "zod";
import { getBuyerQuote, restoreBuyerQuote } from "@/repositories/commerce-buyer-quotes";
import { buyerContext, checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
type Context = { params: Promise<{ slug: string; quoteId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const { slug, quoteId } = await params; const id = z.string().uuid().parse(quoteId); const { store, session } = await buyerContext(slug, false, true); return commerceJson({ quote: await getBuyerQuote(store.tenant_id, session, id) }); }
  catch (error) { return commerceFailure(error, "buyer.quotes.read"); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkCommerceOrigin(request); const { slug, quoteId } = await params; const id = z.string().uuid().parse(quoteId);
    const { store, session } = await buyerContext(slug);
    const input = await readCommerceBody(request, z.object({ revision: z.number().int().nonnegative(), confirmReplace: z.literal(true) }).strict());
    return commerceJson(await restoreBuyerQuote(store, session, id, input.revision));
  } catch (error) { return commerceFailure(error, "buyer.quotes.restore"); }
}
