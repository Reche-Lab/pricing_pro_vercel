import type { Metadata } from "next";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { INSTITUTIONAL_UPDATED, storeInstitutionalPage } from "@/domain/commerce/institutional";

export function commerceSiteOrigin(appUrl = process.env.APP_URL || "https://liaflow-calcula.vercel.app") {
  const url = new URL(appUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("APP_URL deve utilizar HTTP ou HTTPS.");
  return url.origin;
}

export function storePageMetadata(slug: string, path: string[], settings: StoreSettings, published: boolean, origin = commerceSiteOrigin()): Metadata {
  const page = storeInstitutionalPage(slug, path);
  const url = `${origin}/loja/${encodeURIComponent(slug)}${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}`;
  const title = page ? `${page.title} | ${settings.name}` : settings.name;
  const description = page?.description ?? settings.description;
  const image = settings.bannerUrl || settings.logoUrl;
  const images = image ? [{ url: image, alt: settings.name }] : [];
  const index = published && (path.length === 0 || path[0] === "produto" || path[0] === "catalogo" || Boolean(page));
  return {
    title: { absolute: title }, description,
    applicationName: settings.name,
    authors: [{ name: settings.name }], creator: settings.name, publisher: settings.name,
    keywords: page ? [settings.name, page.title, "produtos personalizados", "bottons personalizados"] : undefined,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "pt_BR", siteName: settings.name, title, description, url, images },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: images.map(item => item.url) },
    robots: { index, follow: true },
  };
}

export function institutionalStructuredData(slug: string, pageSlug: string, settings: StoreSettings, origin = commerceSiteOrigin()) {
  const page = storeInstitutionalPage(slug, [pageSlug]);
  if (!page) return null;
  const base = `${origin}/loja/${encodeURIComponent(slug)}`;
  const url = `${base}/${page.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${base}#organization`, name: settings.name, url: base, email: settings.contactEmail, ...(settings.logoUrl ? { logo: settings.logoUrl } : {}) },
      { "@type": page.slug === "quem-somos" ? "AboutPage" : "WebPage", "@id": `${url}#webpage`, url, name: `${page.title} | ${settings.name}`, description: page.description,
        inLanguage: "pt-BR", dateModified: INSTITUTIONAL_UPDATED,
        about: { "@id": `${base}#organization` }, publisher: { "@id": `${base}#organization` },
        breadcrumb: { "@id": `${url}#breadcrumb` }, isPartOf: { "@type": "WebSite", "@id": `${base}#website`, url: base, name: settings.name } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: settings.name, item: base },
        { "@type": "ListItem", position: 2, name: page.title, item: url }
      ] }
    ]
  };
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
