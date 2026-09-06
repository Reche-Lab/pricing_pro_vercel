import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  commerceProducts,
  getCommerceStore,
  publicCommerceProduct,
} from "@/repositories/commerce";
import { Storefront } from "@/components/commerce/Storefront";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; path?: string[] }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const store = await getCommerceStore(slug, true);
  if (!store) return { title: "Loja indisponível", robots: { index: false } };
  const url = `/loja/${slug}/${path.join("/")}`;
  return {
    title: { absolute: store.settings.name },
    description: store.settings.description,
    alternates: { canonical: url },
    openGraph: {
      title: store.settings.name,
      description: store.settings.description,
      url,
      images: store.settings.bannerUrl ? [store.settings.bannerUrl] : [],
    },
    robots: { index: path.length === 0 || path[0] === "produto", follow: true },
  };
}
export default async function StorePage({ params }: Props) {
  const { slug, path = [] } = await params;
  const store = await getCommerceStore(slug, true);
  if (!store) notFound();
  const supported =
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
    />
  );
}
