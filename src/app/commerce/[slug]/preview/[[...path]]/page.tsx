import { notFound, redirect } from "next/navigation";
import React, { cache } from "react";
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
import { purchaseConditionsPage } from "@/domain/commerce/purchase-conditions";
import { readCommerceLibrary } from "@/repositories/commerce-library";
import { libraryQuerySchema } from "@/domain/commerce/library";
import { findCommerceProduct, productRedirectUrl } from "@/domain/commerce/product-urls";
import { readPublicBlog } from "@/repositories/commerce-blog";
import { blogCard } from "@/domain/commerce/blog";
import { StoreBlog, StoreBlogTeaser } from "@/components/commerce/blog/StoreBlog";

export const dynamic = "force-dynamic";
const previewStore = cache(requireCommercePreview);
const previewMetadata: Metadata = {
  title: { absolute: "Pré-visualização privada da loja" },
  robots: { index: false, follow: false, noarchive: true },
  icons: { icon: [], shortcut: [], apple: [] },
  manifest: null,
};
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await previewStore(slug).catch(() => null);
  const icon = store?.settings.faviconUrl || store?.settings.logoUrl;
  return { ...previewMetadata, ...(icon ? { icons: { icon: [{ url: icon }], shortcut: [{ url: icon }], apple: [{ url: icon }] } } : {}) };
}
export default async function CommercePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, path = [] } = await params;
  const page = storeInstitutionalPage(slug, path);
  const blogRequested = path[0] === "blog" && path.length <= 2;
  const libraryPath = (path.length === 1 && ["artes", "campanhas"].includes(path[0])) || (path.length === 2 && path[0] === "campanhas" && libraryQuerySchema.safeParse({ campaign: path[1] }).success);
  const valid = blogRequested || libraryPath || Boolean(page) ||
    path.length === 0 ||
    (path.length === 1 && ["catalogo", "condicoes", "carrinho", "checkout"].includes(path[0])) ||
    (path.length === 2 && path[0] === "produto");
  if (!valid) notFound();
  const store = await previewStore(slug).catch((error: unknown) => {
    if (error instanceof CommerceError) {
      if (error.status === 401) redirect("/login");
      if ([403, 404].includes(error.status)) notFound();
    }
    throw error;
  });
  const institutional = page ?? (path.length === 1 && path[0] === "condicoes" ? purchaseConditionsPage(slug, store.settings) : undefined);
  const blog = await readPublicBlog(store.tenant_id, slug, store.settings.name, true);
  const blogArticle = path.length === 2 && blogRequested ? blog.articles.find(a => a.slug === path[1]) : undefined;
  if (blogRequested && (!blog.articles.length || (path.length === 2 && !blogArticle))) notFound();
  const library = libraryPath ? await readCommerceLibrary(store.tenant_id, libraryQuerySchema.parse(path[1] ? { campaign: path[1] } : {}), "preview") : undefined;
  if (libraryPath && path[1] && !library?.campaigns.some(c => c.slug === path[1])) notFound();
  const products = (await commerceProducts(store.tenant_id)).map(
    publicCommerceProduct,
  );
  if (path[0] === "produto") {
    const product = findCommerceProduct(products, path[1]);
    if (!product) notFound();
    if (product.slug && path[1] !== product.slug) redirect(productRedirectUrl(`/commerce/${slug}/preview`, product, await searchParams ?? {}));
  }
  return (
    <Storefront
      slug={slug}
      settings={store.settings}
      products={products}
      libraryEnabled={Boolean(store.art_library_enabled) || libraryPath}
      libraryInitial={library}
      path={path}
      paused={false}
      preview
      blogEnabled={blog.articles.length > 0}
      blogTitle={blog.settings.title}
      blogArticles={blog.articles.map(blogCard)}
      editorial={path.length === 0 && blog.articles.length > 0 ? <StoreBlogTeaser base={`/commerce/${slug}/preview`} blog={blog}/> : undefined}
      institutionalLinks={storeInstitutionalPages(slug).map(({ slug, title }) => ({ slug, title }))}
    >
      {blogRequested ? <StoreBlog base={`/commerce/${slug}/preview`} article={blogArticle} products={products} blog={blog} name={store.settings.name} preview/> : institutional ? <StoreInstitutionalPage slug={slug} page={institutional} settings={store.settings} preview featuredProduct={products.find(product => Boolean(product.imageUrl))} /> : null}
    </Storefront>
  );
}
