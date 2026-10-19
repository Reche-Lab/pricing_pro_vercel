import type { MetadataRoute } from "next";
import { INSTITUTIONAL_UPDATED, storeInstitutionalPages } from "@/domain/commerce/institutional";
import { commerceSiteOrigin } from "./store-seo";

export function commerceSitemapEntries(slug: string, productIds: string[], origin = commerceSiteOrigin()): MetadataRoute.Sitemap {
  const base = `${origin}/loja/${encodeURIComponent(slug)}`;
  return [
    { url: base }, { url: `${base}/catalogo` },
    ...storeInstitutionalPages(slug).map(page => ({ url: `${base}/${page.slug}`, lastModified: INSTITUTIONAL_UPDATED })),
    ...productIds.map(id => ({ url: `${base}/produto/${encodeURIComponent(id)}` }))
  ];
}

export function commerceSitemapXml(entries: MetadataRoute.Sitemap) {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry => `<url><loc>${escape(entry.url)}</loc>${entry.lastModified ? `<lastmod>${escape(entry.lastModified instanceof Date ? entry.lastModified.toISOString() : entry.lastModified)}</lastmod>` : ""}</url>`).join("")}</urlset>`;
}
