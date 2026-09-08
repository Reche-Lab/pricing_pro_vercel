"use client";
/* eslint-disable @next/next/no-img-element */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LogOut,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  Truck,
  Moon,
  Sun,
  RefreshCw,
} from "lucide-react";
import dynamic from "next/dynamic";
import type {
  publicCommerceProduct,
  cartView,
  buyerOrders,
} from "@/repositories/commerce";
import type { CartLine, StoreSettings } from "@/domain/commerce/schemas";
import { commerceSelectionError, distributeQuantity } from "@/domain/commerce/commerce";
import { normalizeProductSearchTerm } from "@/domain/products/product-search";
import { fetchCepAddress, normalizeCep } from "@/lib/cep";
import { storeRequest, storeMoney } from "./store-http";
import styles from "./store.module.css";
import { StoreHome, StoreProductCard } from "./StoreHome";
import { StoreProductGallery } from "./StoreProductGallery";
import { StorePriceBreakdown } from "./StorePriceBreakdown";
import { StoreDeliveryInquiry } from "./StoreDeliveryInquiry";
import { useStoreTheme, accentForeground } from "./use-store-theme";
import { useCommercePreview } from "./CommercePreviewProvider";
const ArtworkTools = dynamic(
  () => import("./StoreArtworkTools").then((m) => m.StoreArtworkTools),
  { ssr: false },
);
type Product = ReturnType<typeof publicCommerceProduct>;
type Cart = Awaited<ReturnType<typeof cartView>>;
type Order = Awaited<ReturnType<typeof buyerOrders>>[number];
type Props = {
  slug: string;
  settings: StoreSettings;
  products: Product[];
  path: string[];
  paused: boolean;
  preview?: boolean;
};

export function Storefront({
  slug,
  settings,
  products,
  path,
  paused,
  preview = false,
}: Props) {
  const router = useRouter();
  const { theme, toggle } = useStoreTheme(slug, settings.theme);
  const base = preview ? `/commerce/${slug}/preview` : `/loja/${slug}`;
  const api = preview ? `/api/commerce/${slug}/preview` : `/api/store/${slug}`;
  const [buyerCart, setCart] = useState<Cart | null>(null);
  const simulation = useCommercePreview();
  const cart = preview ? (simulation?.cart ?? null) : buyerCart;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const refresh = useCallback(async () => {
    if (preview) return;
    const data = await storeRequest(`${api}/cart`);
    setCart(data);
  }, [api, preview]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const view = path[0] ?? "home";
  const refreshOrders = useCallback(async () => {
    if (preview) return;
    const data = await storeRequest(`${api}/orders`);
    setOrders(data.orders);
  }, [api, preview]);
  useEffect(() => {
    if (view === "pedidos" && cart?.customer)
      void refreshOrders().catch((e) => setError(e.message));
  }, [view, cart?.customer?.id, refreshOrders, cart?.customer]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  async function update(lines: CartLine[]) {
    if (preview) {
      if (!simulation)
        throw new Error("Reabra a prévia para iniciar a simulação.");
      return simulation.update(lines);
    }
    if (!cart) throw new Error("O carrinho ainda está carregando.");
    await storeRequest(`${api}/cart`, "PUT", {
      revision: cart.revision,
      lines,
    });
    await refresh();
  }
  const selectedProduct =
    view === "produto" ? products.find((p) => p.id === path[1]) : undefined;
  const order = orders.find((o) => o.id === path[1]);
  return (
    <main
      className={styles.store}
      data-theme={theme}
      style={
        {
          "--accent": theme === "dark" ? "#79d8d0" : settings.accent,
          "--accent-ink": theme === "dark" ? "#081311" : accentForeground(settings.accent),
        } as CSSProperties
      }
    >
      {preview ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            <strong>Pré-visualização privada</strong> · Compra simulada, sem
            cobrança. Artes e carrinho temporários: serão apagados ao recarregar
            ou sair da prévia.
          </p>
          {preview && simulation?.cart.lines.length ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 underline"
              onClick={() => {
                simulation.reset();
                setMessage("");
                setError("");
              }}
            >
              <Trash2 size={16} /> Limpar simulação
            </button>
          ) : null}
          <Link
            href="/commerce"
            className="inline-flex items-center gap-2 underline"
          >
            <ArrowLeft size={16} /> Voltar às configurações
          </Link>
        </div>
      ) : null}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href={base}>
            {settings.logoUrl ? (
              <img
                alt=""
                src={settings.logoUrl}
                width={44}
                height={44}
                className="h-11 w-11 object-contain"
              />
            ) : null}
            <span>{settings.name}</span>
          </Link>
          <form
            className={styles.headerSearch}
            onSubmit={(event) => {
              event.preventDefault();
              const query = String(
                new FormData(event.currentTarget).get("q") ?? "",
              ).trim();
              router.push(
                `${base}/catalogo${query ? `?q=${encodeURIComponent(query)}` : ""}`,
              );
            }}
          >
            <input
              name="q"
              aria-label="Buscar no catálogo"
              placeholder="O que vamos criar hoje?"
              maxLength={100}
            />
            <button type="submit" title="Buscar" aria-label="Buscar">
              <Search size={20} />
            </button>
          </form>
          <nav aria-label="Loja" className={styles.navigation}>
            <button
              className={styles.iconButton}
              type="button"
              onClick={toggle}
              title={
                theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
              }
              aria-label={
                theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
              }
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {!preview ? (
              <>
                <Link
                  href={`${base}/conta`}
                  title="Minha conta"
                  aria-label="Minha conta"
                >
                  <UserRound size={21} />
                </Link>
              </>
            ) : null}
            <Link
              className={styles.cartButton}
              href={`${base}/carrinho`}
              title="Carrinho"
            >
              <ShoppingBag size={21} />
              <span className="text-sm">{cart?.lines.length ?? 0}</span>
            </Link>
          </nav>
        </div>
        <nav aria-label="Categorias de produtos" className={styles.categoryNav}>
          <Link href={`${base}/catalogo`} aria-label="Pesquisar produtos">
            Todos os produtos
          </Link>
          {[...new Set(products.map((product) => product.category))].map(
            (category) => (
              <Link
                key={category}
                href={`${base}/catalogo?categoria=${encodeURIComponent(category)}`}
              >
                {category}
              </Link>
            ),
          )}
        </nav>
      </header>
      {view === "home" ? (
        <StoreHome settings={settings} products={products} base={base} />
      ) : null}
      <div
        className={
          view === "home" && !error && !message && !paused
            ? styles.emptyWrap
            : styles.wrap
        }
      >
        {paused && !preview ? (
          <p className={styles.message}>
            A loja está temporariamente pausada. Seus pedidos continuam
            disponíveis em sua conta.
          </p>
        ) : null}
        {error ? (
          <div role="alert" className={`${styles.message} ${styles.error}`}>
            {error}
            <button
              className="ml-3 underline"
              onClick={() => {
                setError("");
                void refresh().catch((e) => setError(e.message));
              }}
            >
              Atualizar
            </button>
          </div>
        ) : null}
        {message ? (
          <p role="status" className={styles.message}>
            {message}{" "}
            <Link className="underline" href={`${base}/carrinho`}>
              {preview ? "Abrir carrinho e preparar artes" : "Ver carrinho"}
            </Link>
          </p>
        ) : null}
        {view === "catalogo" ? (
          <Catalog
            products={products}
            base={base}
            title="Encontre a sua próxima ideia"
          />
        ) : null}
        {selectedProduct ? (
          <ProductDetail
            key={selectedProduct.id}
            product={selectedProduct}
            base={base}
            api={api}
            disabled={busy || !cart || paused}
            onAdd={(lines) =>
              action(async () => {
                await update([...(cart?.lines ?? []), ...lines]);
                setMessage(
                  "Produtos adicionados. Suas artes podem ser preparadas no carrinho.",
                );
              })
            }
          />
        ) : null}
        {view === "conta" ? (
          <>
            {cart?.customer ? (
              <div className="max-w-xl space-y-5">
                <h1 className={styles.title}>Olá, {cart.customer.name}</h1>
                <p>{cart.customer.email}</p>
                <Link className={styles.primary} href={`${base}/pedidos`}>
                  Meus pedidos
                  <ArrowRight size={17} />
                </Link>
                <button
                  className={`${styles.secondary} ml-3`}
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await storeRequest(`${api}/auth`, "POST", {
                        action: "logout",
                      });
                      setOrders([]);
                      await refresh();
                    })
                  }
                >
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            ) : (
              <BuyerLogin api={api} onLogged={refresh} disabled={!cart} />
            )}
          </>
        ) : null}
        {view === "carrinho" ? (
          <>
            <h1 className={styles.title}>Seu carrinho</h1>
            {!cart ? (
              <p>Carregando…</p>
            ) : !cart.lines.length ? (
              <Empty
                text="Seu carrinho ainda está vazio."
                href={`${base}/catalogo`}
                label="Escolher produtos"
              />
            ) : (
              <div className={styles.columns}>
                <div>
                  {cart.lines.map((line) => {
                    const product = products.find(
                      (p) => p.id === line.productId,
                    );
                    const priced = cart.calculation?.items.find(
                      (i) => i.id === line.id,
                    );
                    return (
                      <div key={line.id} className={styles.line}>
                        <div className="flex gap-4">
                          {product ? (
                            <img
                              alt={product.name}
                              src={product.imageUrl}
                              className={`${styles.productThumbnail} h-20 w-20 shrink-0 rounded-md object-contain`}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <h2 className="font-semibold">
                              {product?.name ?? "Produto indisponível"}
                            </h2>
                            <p className={styles.muted}>
                              {line.artworkName || "Sem personalização"}
                            </p>
                            {priced && product ? <StorePriceBreakdown compact quantity={line.quantity} originalUnitCents={product.offer.originalUnitCents} price={{ totalCents: priced.totalCents, items: [priced] }} /> : <p>Remova o item indisponível para continuar.</p>}
                          </div>
                          <button
                            aria-label="Remover item"
                            title="Remover item"
                            disabled={busy}
                            className="self-start rounded-md p-2 text-zinc-500 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() =>
                              action(() =>
                                update(
                                  cart.lines.filter(
                                    (item) => item.id !== line.id,
                                  ),
                                ),
                              )
                            }
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <form
                          className="mt-3 flex max-w-xs items-end gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            void action(() =>
                              update(
                                cart.lines.map((item) =>
                                  item.id === line.id
                                    ? {
                                        ...item,
                                        quantity: Number(form.get("quantity")),
                                      }
                                    : item,
                                ),
                              ),
                            );
                          }}
                        >
                          <label className="min-w-0 text-sm">
                            Quantidade
                            <input
                              name="quantity"
                              inputMode="numeric"
                              key={line.quantity}
                              defaultValue={line.quantity}
                              required
                              pattern="[0-9]+"
                            />
                          </label>
                          <button
                            className={`${styles.secondary} shrink-0`}
                            disabled={busy || paused}
                            type="submit"
                            title="Atualizar quantidade"
                            aria-label="Atualizar quantidade"
                          >
                            <RefreshCw size={18} />
                          </button>
                        </form>
                        {product?.personalized ? (
                          <ArtworkTools
                            preview={preview}
                            slug={slug}
                            product={product}
                            artwork={cart.artworks.find(
                              (a) => a.id === line.artworkId,
                            )}
                            artworks={cart.artworks.filter(
                              (a) => a.product_id === product.id,
                            )}
                            onRefresh={refresh}
                            onSelect={(id) =>
                              update(
                                cart.lines.map((item) =>
                                  item.id === line.id
                                    ? { ...item, artworkId: id }
                                    : item,
                                ),
                              )
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <aside className={styles.summary}>
                  <h2 className="text-xl font-semibold">Resumo</h2>
                  <Summary subtotal={cart.calculation?.totalCents ?? 0} />
                  <Link
                    className={`${styles.primary} mt-5 w-full`}
                    href={`${base}/checkout`}
                  >
                    Continuar para entrega
                    <ArrowRight size={17} />
                  </Link>
                  <Link
                    className="mt-4 block text-center text-sm underline"
                    href={`${base}/catalogo`}
                  >
                    Continuar comprando
                  </Link>
                </aside>
              </div>
            )}
          </>
        ) : null}
        {view === "checkout" ? (
          <>
            <h1 className={styles.title}>Finalizar pedido</h1>
            {!cart ? (
              <p>Carregando…</p>
            ) : !cart.customer && !preview ? (
              <BuyerLogin api={api} onLogged={refresh} disabled={false} />
            ) : !cart.lines.length ? (
              <Empty
                text="Adicione produtos antes de concluir."
                href={`${base}/catalogo`}
                label="Ver produtos"
              />
            ) : preview ? (
              <PreviewCheckout
                cart={cart}
                settings={settings}
                base={base}
                products={products}
              />
            ) : (
              <Checkout
                cart={cart}
                settings={settings}
                base={base}
                disabled={busy || paused}
                onSubmit={(input) =>
                  action(async () => {
                    const result = await storeRequest(
                      `${api}/orders`,
                      "POST",
                      input,
                    );
                    await refresh();
                    router.push(`${base}/pedidos/${result.id}`);
                  })
                }
              />
            )}
          </>
        ) : null}
        {view === "pedidos" ? (
          <>
            <h1 className={styles.title}>
              {path[1] ? "Seu pedido" : "Meus pedidos"}
            </h1>
            {!cart?.customer ? (
              <BuyerLogin api={api} onLogged={refresh} disabled={!cart} />
            ) : path[1] ? (
              order ? (
                <OrderDetail
                  order={order}
                  instructions={cart.payments.manual_instructions}
                  busy={busy}
                  onRefresh={() => action(refreshOrders)}
                  onPay={() =>
                    action(async () => {
                      const result = await storeRequest(
                        `${api}/payment`,
                        "POST",
                        { orderId: order.id },
                      );
                      window.location.assign(result.url);
                    })
                  }
                />
              ) : (
                <p>Carregando pedido ou pedido não encontrado nesta conta.</p>
              )
            ) : orders.length ? (
              <div className="divide-y divide-zinc-200">
                {orders.map((item) => (
                  <Link
                    className="flex flex-wrap items-center justify-between gap-3 py-5"
                    key={item.id}
                    href={`${base}/pedidos/${item.id}`}
                  >
                    <span>
                      <strong>
                        Pedido {item.id.slice(0, 8).toUpperCase()}
                      </strong>
                      <span className="mt-1 block text-sm text-zinc-500">
                        {new Date(item.created_at).toLocaleDateString("pt-BR")}{" "}
                        · {paymentLabel(item.payment_status)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 font-semibold">
                      {storeMoney(item.total_cents)}
                      <ArrowRight size={18} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                text="Nenhum pedido nesta conta ainda."
                href={`${base}/catalogo`}
                label="Ver produtos"
              />
            )}
          </>
        ) : null}
        {view === "condicoes" ? (
          <>
            <h1 className={styles.title}>Condições de compra</h1>
            <div className="max-w-3xl whitespace-pre-wrap leading-7">
              {settings.terms}
            </div>
          </>
        ) : null}
      </div>
      <footer className={styles.footer}>
        <div className={`${styles.wrap} flex flex-wrap justify-between gap-6`}>
          <div>
            <p className="font-semibold">{settings.name}</p>
            <p className="mt-2 text-sm text-zinc-500">
              {settings.contactPhone}
            </p>
            <a
              className="text-sm underline"
              href={`mailto:${settings.contactEmail}`}
            >
              {settings.contactEmail}
            </a>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <Link href={`${base}/condicoes`}>Condições de compra</Link>
            {!preview ? (
              <Link href={`${base}/pedidos`}>Acompanhar pedido</Link>
            ) : null}
          </div>
        </div>
      </footer>
    </main>
  );
}
function Catalog({
  products,
  base,
  title,
}: {
  products: Product[];
  base: string;
  title: string;
}) {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("categoria") ?? "");
  const [sort, setSort] = useState("featured");
  useEffect(() => {
    setQuery(params.get("q") ?? "");
    setCategory(params.get("categoria") ?? "");
    setPage(1);
  }, [params]);
  const [page, setPage] = useState(1);
  const categories = [...new Set(products.map((p) => p.category))];
  const filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      normalizeProductSearchTerm(`${p.name} ${p.description}`).includes(
        normalizeProductSearchTerm(query),
      ),
  );
  const sorted = [...filtered].sort((a, b) => sort === "price_asc" ? a.unitCents - b.unitCents : sort === "price_desc" ? b.unitCents - a.unitCents : sort === "name" ? a.name.localeCompare(b.name, "pt-BR") : 0);
  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <h1 className={`${styles.title} !mb-0`}>{title}</h1>
        <p className={styles.muted}>{filtered.length} produtos</p>
      </div>
      <div className={styles.catalogToolbar}>
        <label className="relative">
          <span className="sr-only">Pesquisar produtos</span>
          <input
            placeholder="Qual produto você procura?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Categoria"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Ordenar produtos" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}>
          <option value="featured">Destaques</option>
          <option value="price_asc">Menor preço unitário</option>
          <option value="price_desc">Maior preço unitário</option>
          <option value="name">Nome: A a Z</option>
        </select>
      </div>
      <div className={styles.grid}>
        {sorted.slice(0, page * 12).map((p) => (
          <StoreProductCard key={p.id} product={p} base={base} />
        ))}
      </div>
      {!filtered.length ? (
        <p className="py-12 text-center text-zinc-500">
          Nenhum produto encontrado.
        </p>
      ) : null}
      {filtered.length > page * 12 ? (
        <button
          className={`${styles.secondary} mx-auto mt-8 flex`}
          onClick={() => setPage(page + 1)}
        >
          Mostrar mais produtos
        </button>
      ) : null}
    </>
  );
}
function ProductDetail({
  product,
  base,
  api,
  disabled,
  onAdd,
}: {
  product: Product;
  base: string;
  api: string;
  disabled: boolean;
  onAdd: (lines: CartLine[]) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(String(product.minQuantity));
  const [groups, setGroups] = useState("1");
  const [priced, setPrice] = useState<{ lines: CartLine[]; calculation: {
    totalCents: number;
    items: { unitCents: number; quantity?: number; artworkName?: string }[];
  } } | null>(null);
  const [error, setError] = useState("");
  const lines = useMemo(() => {
    try {
      return distributeQuantity(
        Number(quantity),
        product.personalized ? Number(groups) : 1,
      ).map((q, i) => ({
        id: crypto.randomUUID(),
        productId: product.id,
        quantity: q,
        artworkName: product.personalized ? `Arte ${i + 1}` : "",
        artworkId: null,
      }));
    } catch {
      return [];
    }
  }, [quantity, groups, product.id, product.personalized]);
  const price = priced?.lines === lines ? priced.calculation : null;
  const deliveryIssue = commerceSelectionError(lines, product);
  useEffect(() => {
    let active = true;
    setPrice(null);
    setError("");
    if (!lines.length) return;
    const timer = setTimeout(() => {
      void storeRequest(`${api}/price`, "POST", { lines })
        .then((result) => {
          if (active) setPrice({ lines, calculation: result });
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, lines]);
  return (
    <>
      <Link
        href={`${base}/catalogo`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500"
      >
        <ArrowLeft size={15} />
        Todos os produtos
      </Link>
      <div className={styles.columns}>
        <StoreProductGallery
          id={product.id}
          name={product.name}
          imageUrl={product.imageUrl}
          media={product.media}
        />
        <section>
          <p className="mb-3 text-sm text-zinc-500">{product.category}</p>
          <h1 className={styles.title}>{product.name}</h1>
          <p className="whitespace-pre-wrap text-zinc-600">
            {product.description}
          </p>
          <div className={`${styles.form} mt-7 sm:grid-cols-2`}>
            <label>
              Quantidade de produtos
              <input
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            {product.personalized ? (
              <label>
                Quantidade de artes
                <input
                  inputMode="numeric"
                  value={groups}
                  onChange={(e) => setGroups(e.target.value)}
                />
              </label>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            De {product.minQuantity} a {product.maxQuantity} unidades
            {product.personalized ? ` · Até ${product.maxArtworks} ${product.maxArtworks === 1 ? "arte" : "artes"}` : ""}
          </p>
          {product.personalized && lines.length ? (
            <p className="mt-3 text-sm">
              {lines
                .map((l) => `${l.artworkName}: ${l.quantity} un.`)
                .join(" · ")}
            </p>
          ) : null}
          <div className="my-6 border-y border-zinc-200 py-5">
            <StorePriceBreakdown originalUnitCents={product.offer.originalUnitCents} quantity={Number(quantity) || 0} price={price} pending={lines.length > 0 && !error} />
            {price ? (
              <p className="mt-2 text-sm text-zinc-500">
                {product.pricingRule === "per_art"
                  ? "Preço calculado pela quantidade de cada arte."
                  : product.pricingRule === "total"
                    ? "Preço calculado pela quantidade total deste produto."
                    : "Preço calculado pela média de unidades por arte."}
              </p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mb-4 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            className={`${styles.primary} w-full`}
            disabled={disabled || !price}
            onClick={() => void onAdd(lines)}
          >
            <ShoppingBag size={18} />
            Adicionar ao carrinho
          </button>
          {product.personalized ? (
            <p className="mt-3 text-sm text-zinc-500">
              No carrinho, envie, ajuste e aprove a imagem de cada arte antes de
              concluir.
            </p>
          ) : null}
          <StoreDeliveryInquiry api={api} lines={lines} disabled={Boolean(deliveryIssue)} disabledReason={deliveryIssue ?? undefined} />
        </section>
      </div>
    </>
  );
}
function BuyerLogin({
  api,
  onLogged,
  disabled,
}: {
  api: string;
  onLogged: () => Promise<void>;
  disabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await storeRequest(`${api}/auth`, "POST", {
          action: "verify",
          challengeId: challenge,
          code,
        });
        await onLogged();
      } else {
        const result = await storeRequest(`${api}/auth`, "POST", {
          action: "request",
          name,
          email,
        });
        setChallenge(result.challengeId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={`${styles.form} mx-auto max-w-md py-8`}>
      <h2 className={styles.title}>
        {challenge ? "Confira seu e-mail" : "Entre ou crie sua conta"}
      </h2>
      <p className={styles.muted}>
        {challenge
          ? `Enviamos um código para ${email}. Ele é válido por 10 minutos.`
          : "Acesse com um código por e-mail, sem precisar criar uma senha."}
      </p>
      {!challenge ? (
        <>
          <label>
            Seu nome
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          </label>
        </>
      ) : (
        <label>
          Código de acesso
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            pattern="[0-9]{6}"
          />
        </label>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button className={styles.primary} disabled={busy || disabled}>
        {busy ? "Aguarde…" : challenge ? "Confirmar acesso" : "Receber código"}
      </button>
      {challenge ? (
        <button
          type="button"
          className="text-sm underline"
          disabled={busy}
          onClick={() => {
            setChallenge("");
            setCode("");
          }}
        >
          Trocar e-mail ou solicitar outro código
        </button>
      ) : null}
    </form>
  );
}
function PreviewCheckout({
  cart,
  settings,
  base,
  products,
}: {
  cart: Cart;
  settings: StoreSettings;
  base: string;
  products: Product[];
}) {
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  if (complete)
    return (
      <section className="max-w-xl space-y-4" role="status">
        <Check className="text-emerald-600" size={32} />
        <h2 className="text-xl font-semibold">Simulação concluída</h2>
        <p>
          Nenhum pedido ou cobrança foi criado. As artes aprovadas continuam no
          carrinho desta prévia.
        </p>
        <Link className={styles.primary} href={`${base}/carrinho`}>
          Voltar às artes <ArrowRight size={17} />
        </Link>
      </section>
    );
  return (
    <>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}{" "}
          <Link className="underline" href={`${base}/carrinho`}>
            Revisar artes
          </Link>
        </p>
      ) : null}
      <Checkout
        cart={cart}
        settings={settings}
        base={base}
        preview
        disabled={false}
        onSubmit={async () => {
          const missing = cart.lines.some(
            (line) =>
              products.find((p) => p.id === line.productId)?.personalized &&
              !cart.artworks.some(
                (art) =>
                  art.id === line.artworkId &&
                  art.product_id === line.productId &&
                  art.approved_at &&
                  art.crop,
              ),
          );
          if (missing) {
            setError(
              "Envie, enquadre e aprove a arte de cada produto personalizado antes de concluir.",
            );
            return;
          }
          setError("");
          setComplete(true);
        }}
      />
    </>
  );
}

function Checkout({
  cart,
  settings,
  base,
  disabled,
  onSubmit,
  preview = false,
}: {
  cart: Cart;
  settings: StoreSettings;
  base: string;
  disabled: boolean;
  onSubmit: (input: unknown) => Promise<void>;
  preview?: boolean;
}) {
  const [delivery, setDelivery] = useState(
    settings.pickupEnabled ? "pickup" : "delivery",
  );
  const [provider, setProvider] = useState(
    cart.payments.mp_enabled ? "mercado_pago" : "manual",
  );
  const [accepted, setAccepted] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [cepError, setCepError] = useState("");
  const [address, setAddress] = useState({
    name: cart.customer?.name ?? "",
    phone: "",
    document: "",
    postalCode: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    attention: "",
  });
  const shipping = delivery === "pickup" ? 0 : settings.deliveryCents;
  const fields: {
    key: keyof typeof address;
    label: string;
    required?: boolean;
  }[] = [
    { key: "name", label: "Destinatário", required: true },
    { key: "phone", label: "Telefone com DDD", required: true },
    { key: "document", label: "CPF/CNPJ" },
    { key: "street", label: "Endereço", required: true },
    { key: "number", label: "Número", required: true },
    { key: "complement", label: "Complemento" },
    { key: "district", label: "Bairro", required: true },
    { key: "city", label: "Cidade", required: true },
    { key: "state", label: "UF", required: true },
    { key: "attention", label: "Aos cuidados de" },
  ];
  async function lookupCep() {
    if (address.postalCode.length !== 8) return;
    const requested = address.postalCode;
    setCepBusy(true);
    setCepError("");
    try {
      const result = await fetchCepAddress(requested);
      if (result)
        setAddress((old) =>
          old.postalCode === requested
            ? {
                ...old,
                street: result.street,
                district: result.district,
                city: result.city,
                state: result.state,
              }
            : old,
        );
      else setCepError("CEP não encontrado. Preencha o endereço.");
    } catch {
      setCepError("Não foi possível consultar o CEP. Preencha o endereço.");
    } finally {
      setCepBusy(false);
    }
  }
  return (
    <form
      className={styles.columns}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          revision: cart.revision,
          expectedTotalCents: (cart.calculation?.totalCents ?? 0) + shipping,
          delivery,
          address: delivery === "delivery" ? address : null,
          provider,
          acceptedTerms: accepted,
        });
      }}
    >
      <div className={styles.form}>
        {preview && delivery === "delivery" ? (
          <button
            type="button"
            className={`${styles.secondary} justify-self-start`}
            onClick={() =>
              setAddress({
                name: "Cliente de teste",
                phone: "11999990000",
                document: "",
                postalCode: "01001000",
                street: "Praça de teste",
                number: "100",
                complement: "",
                district: "Centro",
                city: "São Paulo",
                state: "SP",
                attention: "",
              })
            }
          >
            Preencher dados de teste
          </button>
        ) : null}
        <h2 className="text-lg font-semibold">1. Como deseja receber?</h2>
        {settings.pickupEnabled ? (
          <label className="!flex items-start gap-3 border-b border-zinc-200 pb-4">
            <input
              type="radio"
              checked={delivery === "pickup"}
              onChange={() => setDelivery("pickup")}
            />
            <span>
              Retirar pessoalmente · Grátis
              <small className="mt-1 block text-zinc-500">
                {settings.pickupAddress}
              </small>
            </span>
          </label>
        ) : null}
        {settings.deliveryEnabled ? (
          <label className="!flex items-start gap-3 border-b border-zinc-200 pb-4">
            <input
              type="radio"
              checked={delivery === "delivery"}
              onChange={() => setDelivery("delivery")}
            />
            <span>
              Entrega · {storeMoney(settings.deliveryCents)}
              <small className="mt-1 block text-zinc-500">
                {settings.deliveryDescription}
              </small>
            </span>
          </label>
        ) : null}
        {delivery === "delivery" ? (
          <>
            <div className="flex items-end gap-2">
              <label className="flex-1">
                CEP
                <input
                  inputMode="numeric"
                  value={address.postalCode}
                  onChange={(e) =>
                    setAddress({
                      ...address,
                      postalCode: normalizeCep(e.target.value),
                    })
                  }
                  required
                  pattern="[0-9]{8}"
                />
              </label>
              <button
                className={styles.secondary}
                type="button"
                disabled={cepBusy}
                onClick={() => void lookupCep()}
              >
                {cepBusy ? "Consultando…" : "Buscar CEP"}
              </button>
            </div>
            {cepError ? (
              <p className="text-sm text-amber-800">{cepError}</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    required={field.required}
                    value={address[field.key]}
                    onChange={(e) =>
                      setAddress({
                        ...address,
                        [field.key]:
                          field.key === "state"
                            ? e.target.value.toUpperCase()
                            : e.target.value,
                      })
                    }
                    maxLength={field.key === "state" ? 2 : 150}
                  />
                </label>
              ))}
            </div>
          </>
        ) : null}
        <h2 className="mt-5 text-lg font-semibold">2. Forma de pagamento</h2>
        {preview ? (
          <p className="text-sm">
            Pagamento simulado · Nenhum valor será cobrado.
          </p>
        ) : (
          <>
            {cart.payments.mp_enabled ? (
              <label className="!flex items-center gap-3">
                <input
                  type="radio"
                  checked={provider === "mercado_pago"}
                  onChange={() => setProvider("mercado_pago")}
                />
                Mercado Pago · Métodos disponíveis no checkout seguro
              </label>
            ) : null}
            {cart.payments.manual_enabled ? (
              <label className="!flex items-center gap-3">
                <input
                  type="radio"
                  checked={provider === "manual"}
                  onChange={() => setProvider("manual")}
                />
                Pagamento combinado com a loja
              </label>
            ) : null}
            {!cart.payments.mp_enabled && !cart.payments.manual_enabled ? (
              <p className="text-sm text-red-700">
                A loja ainda não habilitou formas de pagamento.
              </p>
            ) : null}
            {provider === "manual" ? (
              <p className="whitespace-pre-wrap text-sm text-zinc-500">
                {cart.payments.manual_instructions}
              </p>
            ) : null}
          </>
        )}
      </div>
      <aside className={styles.summary}>
        <h2 className="mb-4 text-lg font-semibold">3. Revise seu pedido</h2>
        {cart.calculation?.items.map((item) => (
          <div
            className="mb-3 flex justify-between gap-3 text-sm"
            key={item.id}
          >
            <span>
              {item.quantity} × {item.name}
              <small className="block text-zinc-500">{item.artworkName}</small>
            </span>
            <span>{storeMoney(item.totalCents)}</span>
          </div>
        ))}
        <Summary
          subtotal={cart.calculation?.totalCents ?? 0}
          shipping={shipping}
        />
        <label className="my-5 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
          />
          <span>
            Li e aceito as{" "}
            <Link
              target="_blank"
              href={`${base}/condicoes`}
              className="underline"
            >
              condições de compra
            </Link>
            .
          </span>
        </label>
        <button
          className={`${styles.primary} w-full`}
          disabled={
            disabled ||
            !accepted ||
            !cart.calculation ||
            (!cart.payments.mp_enabled && !cart.payments.manual_enabled)
          }
        >
          <Check size={17} />
          {preview ? "Concluir simulação" : "Confirmar pedido"}
        </button>
        <p className="mt-3 text-sm text-zinc-500">
          {preview
            ? "Prévia privada. Nenhum pedido real será criado."
            : provider === "mercado_pago"
              ? "Após confirmar, abra o pagamento seguro no detalhe do pedido."
              : "A produção começa após a confirmação do pagamento pela loja."}
        </p>
      </aside>
    </form>
  );
}
function OrderDetail({
  order,
  instructions,
  busy,
  onPay,
  onRefresh,
}: {
  order: Order;
  instructions: string;
  busy: boolean;
  onPay: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className={styles.columns}>
      <div>
        <p className="mb-5 text-sm text-zinc-500">
          Pedido {order.id.toUpperCase()}
        </p>
        <div className="mb-6 flex flex-wrap gap-3">
          <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {paymentLabel(order.payment_status)}
          </span>
          <span className="rounded-md bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
            {
              (
                {
                  received: "Pedido recebido",
                  production: "Em produção",
                  shipped: "Enviado",
                  completed: "Concluído",
                } as Record<string, string>
              )[order.fulfillment_status]
            }
          </span>
        </div>
        {order.items.map((item) => (
          <div
            className={`${styles.line} flex justify-between gap-4`}
            key={item.id}
          >
            <div>
              <strong>{item.name}</strong>
              <p className={styles.muted}>
                {item.quantity} unidades · {item.artworkName}
              </p>
            </div>
            <span>{storeMoney(item.totalCents)}</span>
          </div>
        ))}
        {order.address ? (
          <p className="mt-5 text-sm">
            <Truck className="mr-2 inline" size={17} />
            {order.address.street}, {order.address.number} ·{" "}
            {order.address.city}/{order.address.state}
          </p>
        ) : (
          <p className="mt-5 text-sm">Retirada pessoalmente.</p>
        )}
      </div>
      <aside className={styles.summary}>
        <Summary
          subtotal={order.subtotal_cents}
          shipping={order.shipping_cents}
        />
        {order.payment_status === "pending" ? (
          order.provider === "mercado_pago" ? (
            <button
              className={`${styles.primary} mt-5 w-full`}
              disabled={busy}
              onClick={() => void onPay()}
            >
              Abrir pagamento seguro
              <ArrowRight size={17} />
            </button>
          ) : (
            <p className="my-5 whitespace-pre-wrap text-sm">{instructions}</p>
          )
        ) : null}
        <button
          className={`${styles.secondary} mt-3 w-full`}
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          Atualizar situação
        </button>
      </aside>
    </div>
  );
}
function Summary({
  subtotal,
  shipping,
}: {
  subtotal: number;
  shipping?: number;
}) {
  return (
    <div className="space-y-3 pt-4">
      <div className="flex justify-between">
        <span>Produtos</span>
        <span>{storeMoney(subtotal)}</span>
      </div>
      <div className="flex justify-between text-sm text-zinc-500">
        <span>Entrega</span>
        <span>
          {shipping === undefined ? "Na próxima etapa" : storeMoney(shipping)}
        </span>
      </div>
      <div className="flex justify-between border-t border-zinc-200 pt-4 text-xl font-semibold">
        <span>Total</span>
        <span>{storeMoney(subtotal + (shipping ?? 0))}</span>
      </div>
    </div>
  );
}
function Empty({
  text,
  href,
  label,
}: {
  text: string;
  href: string;
  label: string;
}) {
  return (
    <div className="py-14 text-center">
      <ShoppingBag className="mx-auto mb-5 text-zinc-400" size={40} />
      <p className="mb-6 text-zinc-500">{text}</p>
      <Link href={href} className={styles.primary}>
        {label}
      </Link>
    </div>
  );
}
function paymentLabel(status: string) {
  return status === "paid"
    ? "Pagamento confirmado"
    : status === "refunded"
      ? "Pagamento estornado"
      : "Aguardando pagamento";
}
