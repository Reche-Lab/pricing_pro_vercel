import type { Metadata } from "next";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { BLOG_DESCRIPTION, blogPath, type BlogArticle } from "@/domain/commerce/blog";
import { groundShopArticles } from "@/content/ground-shop-blog";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { commerceSiteOrigin, storePageMetadata } from "./store-seo";
import type { PublicBlog } from "@/domain/commerce/blog-settings";

export function storeBlogMetadata(slug: string, settings: StoreSettings, published: boolean, article?: BlogArticle, origin = commerceSiteOrigin(), blog?: PublicBlog): Metadata {
  const base = commerceStoreUrl(slug, origin), url = blogPath(base, article?.slug);
  const blogTitle = blog?.settings.title ?? `Blog ${settings.name}`;
  const title = article ? `${article.title} | ${blogTitle}` : `${blogTitle} | Ideias para produtos personalizados`;
  const description = article?.description ?? blog?.settings.description ?? BLOG_DESCRIPTION;
  const featured = blog ? blog.articles.find(a => a.slug === blog.settings.featuredSlug) ?? blog.articles[0] : groundShopArticles[0];
  const imageUrl = article?.image || blog?.settings.heroImage || featured?.image || settings.logoUrl;
  const images = imageUrl ? [{ url: new URL(imageUrl, origin).toString(), ...(imageUrl.startsWith("/studio/blog/") ? { width: 1440, height: 960 } : {}), alt: article?.imageAlt || (blog?.settings.heroImage ? blog.settings.heroAlt : featured?.imageAlt) || blogTitle }] : [];
  return {
    ...storePageMetadata(slug, ["blog"], settings, published, origin),
    title: { absolute: title }, description,
    alternates: { canonical: url }, robots: { index: published, follow: true, googleBot: { index: published, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    openGraph: { type: article ? "article" : "website", locale: "pt_BR", siteName: settings.name, url, title, description, images, ...(article ? { publishedTime: article.published, modifiedTime: article.updated, authors: [base], section: article.category } : {}) },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images },
  };
}

export function storeBlogStructuredData(slug: string, settings: StoreSettings, article?: BlogArticle, origin = commerceSiteOrigin(), blog?: PublicBlog) {
  const base = commerceStoreUrl(slug, origin), url = blogPath(base, article?.slug), blogUrl = blogPath(base);
  const publisher = { "@type": "Organization", "@id": `${base}#organization`, name: settings.name, url: base, ...(settings.logoUrl ? { logo: { "@type": "ImageObject", url: new URL(settings.logoUrl, origin).toString() } } : {}) };
  const blogTitle = blog?.settings.title ?? `Blog ${settings.name}`;
  const breadcrumb = { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: settings.name, item: base }, { "@type": "ListItem", position: 2, name: blogTitle, item: blogUrl }, ...(article ? [{ "@type": "ListItem", position: 3, name: article.title, item: url }] : [])] };
  return { "@context": "https://schema.org", "@graph": [publisher, breadcrumb, article ? {
    "@type": "BlogPosting", "@id": `${url}#article`, url, mainEntityOfPage: { "@type": "WebPage", "@id": url }, headline: article.title, description: article.description,
    image: article.image ? [{ "@type": "ImageObject", url: new URL(article.image, origin).toString(), ...(article.image.startsWith("/studio/blog/") ? { width: 1440, height: 960, caption: article.imageCaption || "Composição ilustrativa" } : article.imageCaption ? { caption: article.imageCaption } : {}) }] : [],
    datePublished: article.published, dateModified: article.updated, inLanguage: "pt-BR", articleSection: article.category,
    author: { "@type": "Organization", name: `Equipe ${settings.name}`, url: base }, publisher: { "@id": `${base}#organization` },
    isPartOf: { "@type": "Blog", "@id": blogUrl, name: blogTitle },
    ...(article.sources ? { citation: article.sources.map(source => source.url) } : {}),
  } : {
    "@type": "Blog", "@id": blogUrl, url: blogUrl, name: blogTitle, description: blog?.settings.description ?? BLOG_DESCRIPTION, inLanguage: "pt-BR", publisher: { "@id": `${base}#organization` },
    ...(blog?.updated ? { dateModified: blog.updated } : {}),
    blogPost: (blog?.articles ?? groundShopArticles).map(a => ({ "@type": "BlogPosting", "@id": `${blogPath(base, a.slug)}#article`, url: blogPath(base, a.slug), headline: a.title, datePublished: a.published, dateModified: a.updated, ...(a.image ? { image: new URL(a.image, origin).toString() } : {}), author: { "@type": "Organization", name: `Equipe ${settings.name}`, url: base } })),
  }] };
}
