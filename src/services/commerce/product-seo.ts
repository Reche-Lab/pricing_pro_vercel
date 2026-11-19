import type { Metadata } from "next";
import type { publicCommerceProduct } from "@/repositories/commerce";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { commerceProductPath } from "@/domain/commerce/product-urls";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { commerceSiteOrigin, storePageMetadata } from "./store-seo";
import { quantityPriceDescription, quantitySelection, publicPriceMoney } from "@/domain/commerce/quantity-pricing";
import { commerceMerchantSchema } from "@/domain/commerce/merchant";

type Product = ReturnType<typeof publicCommerceProduct>;
function productSeo(slug: string, product: Product, settings: StoreSettings, origin: string) {
  const base = commerceStoreUrl(slug, origin), url = commerceProductPath(base, product);
  const description = [quantityPriceDescription(product), product.description.trim() || `${product.name} na ${settings.name}.`].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 500);
  const images = [product.imageUrl, ...(product.media ?? []).filter(media => media.kind === "image").map(media => media.url)]
    .filter(Boolean).map(image => new URL(image, `${base}/`).href);
  return { base, url, description, images: [...new Set(images)] };
}

export function storeProductMetadata(slug: string, product: Product, settings: StoreSettings, published: boolean, origin = commerceSiteOrigin()): Metadata {
  const { url, description, images } = productSeo(slug, product, settings, origin);
  const title = `${product.name}${(product.quantityPricing?.bestPrice.discountPercent ?? 0) > 0 ? " com desconto por quantidade" : ""} | ${settings.name}`;
  return {
    ...storePageMetadata(slug, ["produto", product.slug || product.id], settings, published, origin),
    title: { absolute: title }, description, alternates: { canonical: url },
    openGraph: { type: "website", locale: "pt_BR", siteName: settings.name, title, description, url, images: images.map(image => ({ url: image, alt: product.name })) },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images },
  };
}

export function storeProductStructuredData(slug: string, product: Product, settings: StoreSettings, origin = commerceSiteOrigin(), selection?: string | null) {
  const { base, url, description, images } = productSeo(slug, product, settings, origin);
  const quantity = quantitySelection(selection, product);
  const row = product.quantityPricing?.rows.find(row => row.quantity === quantity) ?? { quantity: product.minQuantity, totalCents: product.unitCents * product.minQuantity };
  const offerPrice = (row.totalCents / 100).toFixed(2);
  const offerUrl = row.quantity === product.minQuantity ? url : `${url}?quantidade=${row.quantity}`;
  const merchant = commerceMerchantSchema.safeParse(product.merchant);
  const configured = merchant.success && merchant.data.enabled ? merchant.data : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Product", "@id": `${url}#product`, url, name: product.name, description, category: product.category,
        ...(images.length ? { image: images } : {}),
        ...(configured?.brand ? { brand: { "@type": "Brand", name: configured.brand } } : {}),
        ...(configured?.gtin ? { gtin: configured.gtin } : {}), ...(configured?.mpn ? { mpn: configured.mpn } : {}),
        ...(product.quantityPricing ? { additionalProperty: [
          { "@type": "PropertyValue", name: "Menor preço unitário por quantidade", value: `${publicPriceMoney(product.quantityPricing.bestPrice.unitCents)} em ${product.quantityPricing.bestPrice.quantity} unidades${product.personalized ? " com uma mesma arte" : ""}` },
          { "@type": "PropertyValue", name: "Economia máxima por quantidade", value: `${product.quantityPricing.bestPrice.discountPercent}% em relação à referência de uma unidade; sem benefícios condicionais` },
        ] } : {}),
        offers: { "@type": "Offer", url: offerUrl, price: offerPrice, priceCurrency: "BRL",
          name: `${row.quantity} unidades${product.personalized ? " com uma arte" : ""} · preço total sem frete`,
          eligibleQuantity: { "@type": "QuantitativeValue", minValue: row.quantity, maxValue: row.quantity, unitCode: "C62" },
          priceSpecification: { "@type": "UnitPriceSpecification", price: offerPrice, priceCurrency: "BRL", referenceQuantity: { "@type": "QuantitativeValue", value: row.quantity, unitCode: "C62", valueReference: { "@type": "QuantitativeValue", value: 1, unitCode: "C62" } } },
          ...(configured ? { availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition" } : {}),
          seller: { "@type": "Organization", name: settings.name, url: base } } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: settings.name, item: base },
        { "@type": "ListItem", position: 2, name: "Produtos", item: `${base}/catalogo` },
        { "@type": "ListItem", position: 3, name: product.name, item: url },
      ] },
    ] as const,
  };
}
