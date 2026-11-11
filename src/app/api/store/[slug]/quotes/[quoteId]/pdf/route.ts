import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { getBuyerQuote } from "@/repositories/commerce-buyer-quotes";
import { generateBuyerQuotePdf } from "@/services/pdf/commerce-buyer-quote-pdf";
import { buyerContext, commerceFailure } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; quoteId: string }> }) {
  try {
    const { slug, quoteId } = await params; const id = z.string().uuid().parse(quoteId);
    const { store, session } = await buyerContext(slug, false, true);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, { action: "commerce.quote.pdf", limit: 20, windowSeconds: 60 });
    if (blocked) return blocked;
    const quote = await getBuyerQuote(store.tenant_id, session, id);
    const tenant = (await getPool().query("select name,logo_url,company_phone,company_site,company_document from tenants where id=$1", [store.tenant_id])).rows[0];
    const pdf = await generateBuyerQuotePdf(quote, tenant);
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="orcamento-${id}.pdf"`, "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff" } });
  } catch (error) { return commerceFailure(error, "buyer.quotes.pdf"); }
}
