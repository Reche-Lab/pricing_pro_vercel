import type { MetadataRoute } from "next";
import { INSTITUTIONAL_UPDATED, storeInstitutionalPages } from "@/domain/commerce/institutional";
import { commerceSiteOrigin } from "./store-seo";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { commerceProductPath, type CommerceProductLink } from "@/domain/commerce/product-urls";

export function commerceSitemapEntries(slug: string, products: (CommerceProductLink | string)[], origin = commerceSiteOrigin(), library?: { campaigns: string[] }): MetadataRoute.Sitemap {
  const base = commerceStoreUrl(slug, origin);
  return [
    { url: base }, { url: `${base}/catalogo` },
    ...(library ? [{ url: `${base}/artes` }, { url: `${base}/campanhas` }, ...library.campaigns.map(campaign => ({ url: `${base}/campanhas/${encodeURIComponent(campaign)}` }))] : []),
    ...storeInstitutionalPages(slug).map(page => ({ url: `${base}/${page.slug}`, lastModified: INSTITUTIONAL_UPDATED })),
    ...products.map(product => ({ url: commerceProductPath(base, typeof product === "string" ? { id: product } : product) }))
  ];
}

export function commerceSitemapXml(entries: MetadataRoute.Sitemap) {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry => `<url><loc>${escape(entry.url)}</loc>${entry.lastModified ? `<lastmod>${escape(entry.lastModified instanceof Date ? entry.lastModified.toISOString() : entry.lastModified)}</lastmod>` : ""}</url>`).join("")}</urlset>`;
}
