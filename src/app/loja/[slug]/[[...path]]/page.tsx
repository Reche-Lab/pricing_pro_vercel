import { notFound } from "next/navigation";
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
import { institutionalStructuredData, serializeStructuredData, storePageMetadata } from "@/services/commerce/store-seo";
import { purchaseConditionsPage } from "@/domain/commerce/purchase-conditions";
export const dynamic = "force-dynamic";
const loadStore = cache(getCommerceStore);
type Props = { params: Promise<{ slug: string; path?: string[] }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const store = await loadStore(slug, true);
  if (!store) return { title: "Loja indisponível", robots: { index: false } };
  return storePageMetadata(slug, path, store.settings, store.status === "published");
}
export default async function StorePage({ params }: Props) {
  const { slug, path = [] } = await params;
  const store = await loadStore(slug, true);
  if (!store) notFound();
  const customDomain = commerceHostSlug((await headers()).get("host")) === slug;
  const institutional = storeInstitutionalPage(slug, path) ?? (path.length === 1 && path[0] === "condicoes" ? purchaseConditionsPage(slug, store.settings) : undefined);
  const supported = Boolean(institutional) ||
    path.length === 0 ||
    (path.length === 1 &&
      [
        "catalogo",
        "carrinho",
        "conta",
        "checkout",
        "pedidos",
        "condicoes",
      ].includes(path[0])) ||
    (path.length === 2 && ["produto", "pedidos"].includes(path[0]));
  if (!supported) notFound();
  const products = (await commerceProducts(store.tenant_id)).map(
    publicCommerceProduct,
  );
  if (path[0] === "produto" && !products.some((p) => p.id === path[1]))
    notFound();
  return (
    <Storefront
      slug={slug}
      settings={store.settings}
      products={products}
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
  );
}
