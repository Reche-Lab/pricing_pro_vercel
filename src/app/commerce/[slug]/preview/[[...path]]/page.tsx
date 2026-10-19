import { notFound, redirect } from "next/navigation";
import React from "react";
import type { Metadata } from "next";
import { Storefront } from "@/components/commerce/Storefront";
import {
  commerceProducts,
  publicCommerceProduct,
} from "@/repositories/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import { CommerceError } from "@/domain/commerce/commerce";
import { storeInstitutionalPage, storeInstitutionalPages } from "@/domain/commerce/institutional";
import { StoreInstitutionalPage } from "@/components/commerce/StoreInstitutionalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Pré-visualização privada da loja" },
  robots: { index: false, follow: false, noarchive: true },
};
export default async function CommercePreviewPage({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}) {
  const { slug, path = [] } = await params;
  const institutional = storeInstitutionalPage(slug, path);
  const valid = Boolean(institutional) ||
    path.length === 0 ||
    (path.length === 1 && ["catalogo", "condicoes", "carrinho", "checkout"].includes(path[0])) ||
    (path.length === 2 && path[0] === "produto");
  if (!valid) notFound();
  const store = await requireCommercePreview(slug).catch((error: unknown) => {
    if (error instanceof CommerceError) {
      if (error.status === 401) redirect("/login");
      if ([403, 404].includes(error.status)) notFound();
    }
    throw error;
  });
  const products = (await commerceProducts(store.tenant_id)).map(
    publicCommerceProduct,
  );
  if (
    path[0] === "produto" &&
    !products.some((product) => product.id === path[1])
  )
    notFound();
  return (
    <Storefront
      slug={slug}
      settings={store.settings}
      products={products}
      path={path}
      paused={false}
      preview
      institutionalLinks={storeInstitutionalPages(slug).map(({ slug, title }) => ({ slug, title }))}
    >
      {institutional ? <StoreInstitutionalPage slug={slug} page={institutional} settings={store.settings} preview featuredProduct={products.find(product => Boolean(product.imageUrl))} /> : null}
    </Storefront>
  );
}
