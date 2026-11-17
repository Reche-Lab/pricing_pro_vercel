import { commerceProducts, getCommerceStore, publicCommerceProduct } from "@/repositories/commerce";
import { commerceMerchantFeed } from "@/services/commerce/merchant-feed";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const store = await getCommerceStore(slug);
    if (!store || store.status !== "published") return new Response("Catálogo indisponível.", { status: 404, headers: { "cache-control": "no-store" } });
    const products = (await commerceProducts(store.tenant_id)).map(publicCommerceProduct);
    return new Response(commerceMerchantFeed(slug, store.settings, products), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" } });
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error("Commerce merchant feed failed.", { debugId, slug, message: error instanceof Error ? error.message : "Unknown error" });
    return new Response(`Catálogo temporariamente indisponível. Referência: ${debugId}`, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
