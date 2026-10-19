import type { MetadataRoute } from "next";
import { commerceProducts, getCommerceStore, publishedCommerceSitemapStores } from "@/repositories/commerce";
import { commerceSitemapEntries } from "@/services/commerce/sitemap";
import { commerceSiteOrigin } from "@/services/commerce/store-seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = commerceSiteOrigin();
  const entries: MetadataRoute.Sitemap = [{ url: origin }];
  for (const { slug } of await publishedCommerceSitemapStores()) {
    const store = await getCommerceStore(slug);
    if (!store) continue;
    const products = await commerceProducts(store.tenant_id);
    entries.push(...commerceSitemapEntries(slug, products.map(product => product.id), origin));
  }
  return entries;
}
