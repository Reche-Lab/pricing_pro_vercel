import { z } from "zod";
import { deleteBuyerQuote, getBuyerQuote, restoreBuyerQuote } from "@/repositories/commerce-buyer-quotes";
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
export async function DELETE(request: Request, { params }: Context) {
  try {
    checkCommerceOrigin(request);
    const { slug, quoteId } = await params;
    if (!z.string().uuid().safeParse(quoteId).success) return commerceJson({ error: "Orçamento não encontrado." }, 404);
    const { store, session } = await buyerContext(slug, false, true);
    await readCommerceBody(request, z.object({ confirmDelete: z.literal(true) }).strict());
    return commerceJson(await deleteBuyerQuote(store.tenant_id, session, quoteId));
  } catch (error) { return commerceFailure(error, "buyer.quotes.delete"); }
}
