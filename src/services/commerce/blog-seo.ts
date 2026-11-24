import type { Metadata } from "next";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { BLOG_DESCRIPTION, blogPath, type BlogArticle } from "@/domain/commerce/blog";
import { groundShopArticles } from "@/content/ground-shop-blog";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { commerceSiteOrigin, storePageMetadata } from "./store-seo";

export function storeBlogMetadata(slug: string, settings: StoreSettings, published: boolean, article?: BlogArticle, origin = commerceSiteOrigin()): Metadata {
  const base = commerceStoreUrl(slug, origin), url = blogPath(base, article?.slug);
  const title = article ? `${article.title} | Blog Ground Shop` : "Blog Ground Shop | Ideias para produtos personalizados";
  const description = article?.description ?? BLOG_DESCRIPTION;
  const image = { url: new URL(article?.image ?? groundShopArticles[0].image, origin).toString(), width: 1440, height: 960, alt: article?.imageAlt ?? groundShopArticles[0].imageAlt };
  return {
    ...storePageMetadata(slug, ["blog"], settings, published, origin),
    title: { absolute: title }, description,
    alternates: { canonical: url }, robots: { index: published, follow: true, googleBot: { index: published, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    openGraph: { type: article ? "article" : "website", locale: "pt_BR", siteName: settings.name, url, title, description, images: [image], ...(article ? { publishedTime: article.published, modifiedTime: article.updated, authors: [base], section: article.category } : {}) },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export function storeBlogStructuredData(slug: string, settings: StoreSettings, article?: BlogArticle, origin = commerceSiteOrigin()) {
  const base = commerceStoreUrl(slug, origin), url = blogPath(base, article?.slug), blogUrl = blogPath(base);
  const publisher = { "@type": "Organization", "@id": `${base}#organization`, name: settings.name, url: base, ...(settings.logoUrl ? { logo: { "@type": "ImageObject", url: new URL(settings.logoUrl, origin).toString() } } : {}) };
  const breadcrumb = { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: settings.name, item: base }, { "@type": "ListItem", position: 2, name: "Blog Ground Shop", item: blogUrl }, ...(article ? [{ "@type": "ListItem", position: 3, name: article.title, item: url }] : [])] };
  return { "@context": "https://schema.org", "@graph": [publisher, breadcrumb, article ? {
    "@type": "BlogPosting", "@id": `${url}#article`, url, mainEntityOfPage: { "@type": "WebPage", "@id": url }, headline: article.title, description: article.description,
    image: [{ "@type": "ImageObject", url: new URL(article.image, origin).toString(), width: 1440, height: 960, caption: "Composição ilustrativa" }],
    datePublished: article.published, dateModified: article.updated, inLanguage: "pt-BR", articleSection: article.category,
    author: { "@type": "Organization", name: "Equipe Ground Shop", url: base }, publisher: { "@id": `${base}#organization` },
    isPartOf: { "@type": "Blog", "@id": blogUrl, name: "Blog Ground Shop" },
    ...(article.sources ? { citation: article.sources.map(source => source.url) } : {}),
  } : {
    "@type": "Blog", "@id": blogUrl, url: blogUrl, name: "Blog Ground Shop", description: BLOG_DESCRIPTION, inLanguage: "pt-BR", publisher: { "@id": `${base}#organization` },
    blogPost: groundShopArticles.map(a => ({ "@type": "BlogPosting", "@id": `${blogPath(base, a.slug)}#article`, url: blogPath(base, a.slug), headline: a.title, datePublished: a.published, dateModified: a.updated, image: new URL(a.image, origin).toString(), author: { "@type": "Organization", name: "Equipe Ground Shop", url: base } })),
  }] };
}
