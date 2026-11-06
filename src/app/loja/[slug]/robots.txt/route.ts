import { getCommerceStore } from "@/repositories/commerce";
import { commerceStoreUrl } from "@/domain/commerce/domains";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getCommerceStore(slug);
  if (!store) return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /conta\nDisallow: /carrinho\nDisallow: /checkout\nDisallow: /pedidos\nSitemap: ${commerceStoreUrl(slug)}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
