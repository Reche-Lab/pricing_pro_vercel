import { commerceProducts, getCommerceStore } from "@/repositories/commerce";
import { commerceSitemapEntries, commerceSitemapXml } from "@/services/commerce/sitemap";
import { readCommerceLibrary } from "@/repositories/commerce-library";
import { libraryQuerySchema } from "@/domain/commerce/library";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getCommerceStore(slug);
  if (!store) return new Response("Loja não encontrada.", { status: 404, headers: { "cache-control": "no-store" } });
  const products = await commerceProducts(store.tenant_id);
  const library = store.art_library_enabled ? await readCommerceLibrary(store.tenant_id, libraryQuerySchema.parse({})) : undefined;
  return new Response(commerceSitemapXml(commerceSitemapEntries(slug, products.map(product => product.id), undefined, library ? { campaigns: library.campaigns.map(c => c.slug) } : undefined)), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" }
  });
}
