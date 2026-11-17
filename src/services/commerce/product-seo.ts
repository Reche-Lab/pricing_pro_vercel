import type { Metadata } from "next";
import type { publicCommerceProduct } from "@/repositories/commerce";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { commerceProductPath } from "@/domain/commerce/product-urls";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { commerceSiteOrigin, storePageMetadata } from "./store-seo";

type Product = ReturnType<typeof publicCommerceProduct>;
function productSeo(slug: string, product: Product, settings: StoreSettings, origin: string) {
  const base = commerceStoreUrl(slug, origin), url = commerceProductPath(base, product);
  const description = (product.description.trim() || `${product.name}. Confira opções, quantidades e preços na ${settings.name}.`).replace(/\s+/g, " ").slice(0, 300);
  const images = [product.imageUrl, ...(product.media ?? []).filter(media => media.kind === "image").map(media => media.url)]
    .filter(Boolean).map(image => new URL(image, `${base}/`).href);
  return { base, url, description, images: [...new Set(images)] };
}

export function storeProductMetadata(slug: string, product: Product, settings: StoreSettings, published: boolean, origin = commerceSiteOrigin()): Metadata {
  const { url, description, images } = productSeo(slug, product, settings, origin);
  const title = `${product.name} | ${settings.name}`;
  return {
    ...storePageMetadata(slug, ["produto", product.slug || product.id], settings, published, origin),
    title: { absolute: title }, description, alternates: { canonical: url },
    openGraph: { type: "website", locale: "pt_BR", siteName: settings.name, title, description, url, images: images.map(image => ({ url: image, alt: product.name })) },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images },
  };
}

export function storeProductStructuredData(slug: string, product: Product, settings: StoreSettings, origin = commerceSiteOrigin()) {
  const { base, url, description, images } = productSeo(slug, product, settings, origin);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Product", "@id": `${url}#product`, url, name: product.name, description, category: product.category,
        ...(images.length ? { image: images } : {}),
        offers: { "@type": "Offer", url, priceCurrency: "BRL", price: (product.unitCents / 100).toFixed(2),
          name: `Preço unitário a partir de ${product.minQuantity} unidades`,
          eligibleQuantity: { "@type": "QuantitativeValue", minValue: product.minQuantity, maxValue: product.maxQuantity, unitCode: "C62" },
          seller: { "@type": "Organization", name: settings.name, url: base } } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: settings.name, item: base },
        { "@type": "ListItem", position: 2, name: "Produtos", item: `${base}/catalogo` },
        { "@type": "ListItem", position: 3, name: product.name, item: url },
      ] },
    ] as const,
  };
}
