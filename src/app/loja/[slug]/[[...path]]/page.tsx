import { notFound, permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import { commerceHostSlug } from "@/domain/commerce/domains";
import type { Metadata } from "next";
import {
  commerceProducts,
  getCommerceStore,
  publicCommerceProduct,
} from "@/repositories/commerce";
import { Storefront } from "@/components/commerce/Storefront";
import React, { cache } from "react";
import { storeInstitutionalPage, storeInstitutionalPages } from "@/domain/commerce/institutional";
import { StoreInstitutionalPage } from "@/components/commerce/StoreInstitutionalPage";
import { institutionalStructuredData, serializeStructuredData, storePageMetadata, storeIdentityStructuredData } from "@/services/commerce/store-seo";
import { purchaseConditionsPage } from "@/domain/commerce/purchase-conditions";
import { readCommerceLibrary } from "@/repositories/commerce-library";
import { libraryQuerySchema } from "@/domain/commerce/library";
import { findCommerceProduct, productRedirectUrl } from "@/domain/commerce/product-urls";
import { storeProductMetadata, storeProductStructuredData } from "@/services/commerce/product-seo";
import { publicAnalyticsSettings } from "@/domain/commerce/analytics";
export const dynamic = "force-dynamic";
const loadStore = cache(getCommerceStore);
const loadProducts = cache(async (tenantId: string) => (await commerceProducts(tenantId)).map(publicCommerceProduct));
const loadLibrary = cache(async (tenantId: string, campaign?: string) => readCommerceLibrary(tenantId, libraryQuerySchema.parse({ ...(campaign ? { campaign } : {}) })));
type Props = { params: Promise<{ slug: string; path?: string[] }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const store = await loadStore(slug, true);
  if (!store) return { title: "Loja indisponível", robots: { index: false } };
  const metadata = storePageMetadata(slug, path, store.settings, store.status === "published");
  if (path[0] === "produto") {
    const product = path.length === 2 ? findCommerceProduct(await loadProducts(store.tenant_id), path[1]) : undefined;
    return product ? storeProductMetadata(slug, product, store.settings, store.status === "published") : { title: "Produto não encontrado", robots: { index: false, follow: false } };
  }
  if (store.art_library_enabled && ["artes", "campanhas"].includes(path[0])) {
    const parsed = libraryQuerySchema.safeParse(path[1] ? { campaign: path[1] } : {});
    if (parsed.success) {
      const library = await loadLibrary(store.tenant_id, path[1]);
      const campaign = library.campaigns.find(c => c.slug === path[1]);
      const title = `${campaign?.name ?? (path[0] === "campanhas" ? "Campanhas e inspirações" : "Artes prontas para personalizar")} | ${store.settings.name}`;
      const description = campaign?.description || "Escolha uma arte, personalize seu produto e aprove o enquadramento antes de comprar.";
      return { ...metadata, title: { absolute: title }, description, robots: { index: store.status === "published", follow: true }, openGraph: { ...metadata.openGraph, title, description, ...(campaign?.cover_url ? { images: [{ url: campaign.cover_url, alt: campaign.name }] } : {}) }, twitter: { ...metadata.twitter, title, description } };
    }
  }
  return metadata;
}
export default async function StorePage({ params, searchParams }: Props) {
  const { slug, path = [] } = await params;
  const store = await loadStore(slug, true);
  if (!store) notFound();
  const customDomain = commerceHostSlug((await headers()).get("host")) === slug;
  const institutional = storeInstitutionalPage(slug, path) ?? (path.length === 1 && path[0] === "condicoes" ? purchaseConditionsPage(slug, store.settings) : undefined);
  const libraryPath = Boolean(store.art_library_enabled) && store.status === "published" && ((path.length === 1 && ["artes", "campanhas"].includes(path[0])) || (path.length === 2 && path[0] === "campanhas" && libraryQuerySchema.safeParse({ campaign: path[1] }).success));
  const supported = libraryPath || Boolean(institutional) ||
    path.length === 0 ||
    (path.length === 1 &&
      [
        "catalogo",
        "carrinho",
        "conta",
        "checkout",
        "orcamento",
        "orcamentos",
        "pedidos",
        "condicoes",
      ].includes(path[0])) ||
    (path.length === 2 && ["produto", "pedidos", "orcamentos"].includes(path[0]));
  if (!supported) notFound();
  const library = libraryPath ? await loadLibrary(store.tenant_id, path[1]) : undefined;
  if (libraryPath && path[1] && !library?.campaigns.some(c => c.slug === path[1])) notFound();
  const products = await loadProducts(store.tenant_id);
  const product = path[0] === "produto" ? findCommerceProduct(products, path[1]) : undefined;
  const query = await searchParams ?? {};
  if (path[0] === "produto") {
    if (!product) notFound();
    if (product.slug && path[1] !== product.slug) permanentRedirect(productRedirectUrl(customDomain ? "" : `/loja/${slug}`, product, query));
  }
  return (
    <>
    {path.length === 0 && store.status === "published" ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(storeIdentityStructuredData(slug, store.settings)) }} /> : null}
    {product && store.status === "published" ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(storeProductStructuredData(slug, product, store.settings, undefined, typeof query.quantidade === "string" ? query.quantidade : undefined)) }} /> : null}
    <Storefront
      analytics={store.payment_environment === "test" ? undefined : publicAnalyticsSettings(store.analytics_settings)}
      slug={slug}
      settings={store.settings}
      products={products}
      libraryEnabled={Boolean(store.art_library_enabled) && store.status === "published"}
      libraryInitial={library}
      path={path}
      paused={store.status !== "published"}
      basePath={customDomain ? "" : undefined}
      institutionalLinks={storeInstitutionalPages(slug).map(({ slug, title }) => ({ slug, title }))}
    >
      {institutional ? <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(institutionalStructuredData(slug, institutional.slug, store.settings)) }} />
        <StoreInstitutionalPage slug={slug} page={institutional} settings={store.settings} basePath={customDomain ? "" : undefined} featuredProduct={products.find(product => Boolean(product.imageUrl))} />
      </> : null}
    </Storefront>
    </>
  );
}
