"use client";
/* eslint-disable @next/next/no-img-element */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
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
  Moon,
  Sun,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Loader2,
  X,
  Download,
  FileText,
} from "lucide-react";
import dynamic from "next/dynamic";
import type {
  publicCommerceProduct,
  cartView,
  buyerOrders,
} from "@/repositories/commerce";
import type { CartLine, StoreSettings } from "@/domain/commerce/schemas";
import { artworkLimit, commerceSelectionError, distributeQuantity } from "@/domain/commerce/commerce";
import { normalizeProductSearchTerm } from "@/domain/products/product-search";
import { storeRequest, storeMoney } from "./store-http";
import styles from "./store.module.css";
import { StoreHome, StoreProductCard } from "./StoreHome";
import { StoreCategoryNavigation } from "./StoreCategoryNavigation";
import { StoreProductGallery } from "./StoreProductGallery";
import { StorePriceBreakdown } from "./StorePriceBreakdown";
import { StoreDeliveryInquiry } from "./StoreDeliveryInquiry";
import { StoreArtworkGuide } from "./StoreArtworkGuide";
import { CommerceOrderArtworks } from "./CommerceOrderArtworks";
import { StoreOrderSummary as Summary } from "./StoreOrderSummary";
import { StoreCheckout as Checkout } from "./StoreCheckout";
import { StoreOrderContactDetails } from "./StoreOrderContactDetails";
import { useStoreTheme, accentForeground } from "./use-store-theme";
import { useCommercePreview } from "./CommercePreviewProvider";
import type { StoreArtwork } from "./StoreArtworkTools";
import { libraryQuerySchema, type LibraryResult } from "@/domain/commerce/library";
import { pendingCartArtworks } from "@/domain/commerce/artwork-readiness";
import { formatDeliveryDate } from "@/domain/shipping/production-lead-time";
import { useQuoteJourney } from "./use-quote-journey";
import { StoreQuoteJourney } from "./StoreQuoteJourney";
import { StoreQuoteOverview } from "./StoreQuoteOverview";
import { quoteArtworkBenefits } from "@/domain/commerce/quote-artwork-benefit";
const StoreLibrary = dynamic(() => import("./StoreLibrary").then(m => m.StoreLibrary));
const FeaturedLibraryCampaigns = dynamic(() => import("./StoreLibrary").then(m => m.FeaturedLibraryCampaigns));
const StorePayment = dynamic(() => import("./StorePayment").then(module => module.StorePayment), { ssr: false });
const StoreBuyerQuotes = dynamic(() => import("./StoreBuyerQuotes").then(module => module.StoreBuyerQuotes));
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
  basePath?: string;
  institutionalLinks?: { slug: string; title: string }[];
  libraryEnabled?: boolean;
  libraryInitial?: LibraryResult;
  children?: ReactNode;
};

export function Storefront({
  slug,
  settings,
  products,
  path,
  paused,
  preview = false,
  basePath,
  institutionalLinks = [],
  libraryEnabled = false,
  libraryInitial,
  children,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedItem = searchParams.get("item");
  const { theme, toggle } = useStoreTheme(slug, settings.theme);
  const base = preview ? `/commerce/${slug}/preview` : (basePath ?? `/loja/${slug}`);
  const api = preview ? `/api/commerce/${slug}/preview` : `/api/store/${slug}`;
  const [buyerCart, setCart] = useState<Cart | null>(null);
  const simulation = useCommercePreview();
  const cart = preview ? (simulation?.cart ?? null) : buyerCart;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const refresh = useCallback(async () => {
    if (preview || children) return;
    const data = await storeRequest(`${api}/cart`);
    setCart(data);
  }, [api, preview, children]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const view = path[0] ?? "home";
  const { quoting, setQuoteMode } = useQuoteJourney(api, view, preview);
  const quoteDetails = view === "orcamento" && searchParams.get("etapa") === "dados";
  const [quoteStep, setQuoteStep] = useState<"details" | "review">("details");
  useEffect(() => { setQuoteStep("details"); }, [view, quoteDetails]);
  const savedQuote = !preview && Boolean(cart?.customer) && view === "orcamentos" && Boolean(path[1]);
  const showQuoteJourney = savedQuote || quoting && ["home", "catalogo", "produto", "carrinho", "orcamento", "artes", "campanhas"].includes(view);
  const storeHeader = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = storeHeader.current, root = header?.parentElement;
    if (!header || !root) return;
    const measure = () => root.style.setProperty("--store-header-offset", `${Math.ceil(header.getBoundingClientRect().height) + 16}px`);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(header); window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [showQuoteJourney]);
  const libraryFilters = libraryQuerySchema.safeParse({ category: searchParams.get("categoria") || undefined, artwork: searchParams.get("arte") || undefined });
  useEffect(() => {
    if (view !== "carrinho" || !focusedItem || !cart) return;
    const element = document.getElementById(`item-${focusedItem}`);
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" }); element?.focus();
  }, [view, focusedItem, cart]);
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
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
      return false;
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
      {!preview && cart?.payments?.payment_environment === "test" ? <div role="status" className={styles.testNotice}><strong>Loja em modo de teste</strong><span>Use somente dados e cartões de teste do Mercado Pago. Pedidos simulados não são enviados para produção.</span></div> : null}
      <header ref={storeHeader} className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href={base || "/"}>
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
                <Link href={`${base}/orcamentos`} title="Meus orçamentos" aria-label="Meus orçamentos"><FileText size={20}/></Link>
              </>
            ) : null}
            <Link
              className={styles.cartButton}
              href={`${base}/carrinho`}
              title={quoting ? "Itens do orçamento" : "Carrinho"}
              aria-label={quoting ? "Itens do orçamento" : "Carrinho"}
            >
              {quoting ? <FileText size={21}/> : <ShoppingBag size={21} />}
              <span className="text-sm">{cart?.lines.length ?? 0}</span>
            </Link>
          </nav>
        </div>
        <StoreCategoryNavigation products={products} base={base} preview={preview} view={view}
          activeCategory={selectedProduct?.category ?? (view === "catalogo" ? searchParams.get("categoria") : null)}
          quoteActive={quoting} libraryEnabled={libraryEnabled} libraryApi={`${api}/library`} navigationKey={`${base}/${path.join("/")}?${searchParams.toString()}`}/>
        {showQuoteJourney ? <StoreQuoteJourney base={base} step={savedQuote ? 4 : quoteDetails ? quoteStep === "review" ? 3 : 2 : 1} count={cart?.lines.length ?? 0} totalCents={cart?.calculation?.totalCents ?? 0} identified={Boolean(cart?.customer)} onPurchase={() => { setQuoteMode(false); router.push(`${base}/carrinho`); }}/>: null}
      </header>
      {view === "home" ? (
        <StoreHome settings={settings} products={products} base={base} />
      ) : null}
      <div
        className={
          view === "home" && !libraryEnabled && !error && !message && !paused
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
        {children}
        {view === "home" && libraryEnabled ? <FeaturedLibraryCampaigns slug={slug} preview={preview} base={base}/> : null}
        {libraryInitial && ["artes", "campanhas"].includes(view) ? <StoreLibrary key={`${view}/${path[1] ?? ""}?${searchParams.toString()}`} slug={slug} preview={preview} base={base} products={products} initial={libraryInitial} campaignSlug={view === "campanhas" ? path[1] : undefined} campaignsOnly={view === "campanhas" && !path[1]} initialCategoryId={libraryFilters.success ? libraryFilters.data.category : undefined} initialArtworkId={libraryFilters.success ? libraryFilters.data.artwork : undefined}/> : null}
        {view === "catalogo" ? (
          <Catalog
            products={products}
            base={base}
            title="Encontre a sua próxima ideia"
          />
        ) : null}
        {selectedProduct ? (
          <ProductDetail
            settings={settings}
            key={selectedProduct.id}
            product={selectedProduct}
            slug={slug}
            preview={preview}
            artworks={cart?.artworks ?? []}
            libraryEnabled={libraryEnabled}
            quoting={quoting}
            onArtworkRefresh={refresh}
            base={base}
            api={api}
            disabled={busy || !cart || paused}
            onAdd={(lines) =>
              action(async () => {
                await update([...(cart?.lines ?? []), ...lines]);
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
                <Link className={styles.secondary} href={`${base}/orcamentos`}><FileText size={17}/>Meus orçamentos</Link>
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
            <h1 className={styles.title}>{quoting ? "Itens do seu orçamento" : "Seu carrinho"}</h1>
            {quoting ? <p className={`${styles.muted} mb-4`}>Ajuste os produtos e quantidades. Enviar e aprovar artes não é obrigatório para gerar o orçamento.</p> : null}
            {!cart ? (
              <p>Carregando…</p>
            ) : !cart.lines.length ? (
              <Empty
                text={quoting ? "Seu orçamento ainda não tem produtos." : "Seu carrinho ainda está vazio."}
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
                      <div key={line.id} id={`item-${line.id}`} tabIndex={-1} className={`${styles.line} scroll-mt-24 ${focusedItem === line.id ? "rounded-md ring-2 ring-amber-400 ring-offset-4" : ""}`}>
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
                            {priced && product ? <StorePriceBreakdown compact quantity={line.quantity} originalUnitCents={product.offer.originalUnitCents} price={{ totalCents: priced.totalCents, artworkDiscountCents: priced.artworkDiscountCents, items: [priced] }} /> : <p>Remova o item indisponível para continuar.</p>}
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
                            storeName={settings.name}
                            libraryEnabled={libraryEnabled}
                            product={product}
                            artwork={cart.artworks.find(
                              (a) => a.id === line.artworkId,
                            )}
                            artworks={cart.artworks.filter(
                              (a) => a.product_id === product.id,
                            )}
                            onRefresh={refresh}
                            pricingLines={cart.lines}
                            benefitContext="cart"
                            preparation={line.preparation ?? "customer"}
                            onPreparationChange={preparation => update(cart.lines.map(item => item.id === line.id ? { ...item, preparation } : item))}
                            onSelect={(id, title) =>
                              update(
                                cart.lines.map((item) =>
                                  item.id === line.id
                                    ? { ...item, artworkId: id, ...(title ? { artworkName: title, preparation: "customer" as const } : {}) }
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
                  <h2 className="text-xl font-semibold">{quoting ? "Resumo do orçamento" : "Resumo"}</h2>
                  <Summary subtotal={cart.calculation?.totalCents ?? 0} artworkDiscountCents={cart.calculation?.artworkDiscountCents} />
                  <Link
                    className={`${styles.primary} mt-5 w-full`}
                    href={quoting ? `${base}/orcamento?etapa=dados` : `${base}/checkout`}
                  >
                    {quoting ? "Continuar para dados e entrega" : "Continuar para entrega"}
                    <ArrowRight size={17} />
                  </Link>
                  <Link
                    className="mt-4 block text-center text-sm underline"
                    href={`${base}/catalogo`}
                  >
                    {quoting ? "Adicionar mais produtos ao orçamento" : "Continuar comprando"}
                  </Link>
                  {!preview && !quoting ? <Link href={`${base}/orcamento`} className={`${styles.secondary} mt-4 w-full`}><FileText size={17}/>Gerar orçamento sem comprar</Link> : null}
                </aside>
              </div>
            )}
          </>
        ) : null}
        {view === "orcamento" && !quoteDetails ? cart ? <StoreQuoteOverview cart={cart} products={products} base={base} storeName={settings.name} busy={busy || paused} onRemove={id => void action(() => update(cart.lines.filter(line => line.id !== id)))}/> : <p role="status">Recuperando seu orçamento…</p> : null}
        {view === "checkout" || quoteDetails ? (
          <>
            <h1 className={styles.title}>{view === "orcamento" ? "Preparar orçamento" : "Finalizar pedido"}</h1>
            {!cart ? (
              <p>Carregando…</p>
            ) : !cart.lines.length ? (
              <Empty
                text={quoteDetails ? "Seu orçamento precisa de ao menos um produto." : "Adicione produtos antes de concluir."}
                href={`${base}/catalogo`}
                label={quoteDetails ? "Escolher produtos para o orçamento" : "Ver produtos"}
              />
            ) : !cart.customer && !preview ? (
              <BuyerLogin api={api} onLogged={refresh} disabled={false} forQuote={quoteDetails}/>
            ) : preview ? (
              <PreviewCheckout
                cart={cart}
                settings={settings}
                base={base}
                products={products}
              />
            ) : (
              <Checkout
                intent={view === "orcamento" ? "quote" : "purchase"}
                onQuoteStepChange={setQuoteStep}
                quoteBenefits={quoteDetails ? quoteArtworkBenefits(cart.lines, products, cart.calculation) : []}
                artworkIssues={pendingCartArtworks(cart.lines, products, cart.artworks)}
                cart={cart}
                api={api}
                settings={settings}
                base={base}
                disabled={busy || paused}
                onSubmit={async (input) => {
                  setBusy(true);
                  try {
                    const result = await storeRequest(
                      `${api}/${view === "orcamento" ? "quotes" : "orders"}`,
                      "POST",
                      input,
                    );
                    await refresh();
                    router.push(`${base}/${view === "orcamento" ? "orcamentos" : "pedidos"}/${result.id}`);
                  } finally { setBusy(false); }
                }}
              />
            )}
          </>
        ) : null}
        {view === "orcamentos" ? (!cart?.customer ? <BuyerLogin api={api} onLogged={refresh} disabled={!cart}/> : <StoreBuyerQuotes api={api} base={base} quoteId={path[1]} revision={cart.revision} hasCart={cart.lines.length > 0} onRestored={async () => { setQuoteMode(false); await refresh(); }}/>) : null}
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
                  api={api}
                  instructions={cart.payments.manual_instructions}
                  busy={busy}
                  onRefresh={async () => { await action(refreshOrders); }}
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
                        · {item.payment_environment === "test" ? "TESTE · " : ""}{paymentLabel(item.payment_status)}
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
          {institutionalLinks.length ? <nav aria-label="Institucional" className="flex flex-col gap-3 text-sm"><p className="mb-1 font-semibold">Institucional</p>{institutionalLinks.map(link => <Link key={link.slug} href={`${base}/${link.slug}`} aria-current={view === link.slug ? "page" : undefined}>{link.title}</Link>)}</nav> : null}
          <nav aria-label="Atendimento" className="flex flex-col gap-3 text-sm">
            <p className="mb-1 font-semibold">Sua compra</p>
            <Link href={`${base}/condicoes`}>Condições de compra</Link>
            {!preview ? (
              <Link href={`${base}/pedidos`}>Acompanhar pedido</Link>
            ) : null}
          </nav>
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
  settings,
  product,
  slug,
  preview,
  artworks,
  onArtworkRefresh,
  base,
  api,
  disabled,
  onAdd,
  libraryEnabled,
  quoting = false,
}: {
  settings: StoreSettings;
  product: Product;
  slug: string;
  preview: boolean;
  artworks: StoreArtwork[];
  onArtworkRefresh: () => Promise<void>;
  base: string;
  api: string;
  disabled: boolean;
  onAdd: (lines: CartLine[]) => Promise<boolean>;
  libraryEnabled: boolean;
  quoting?: boolean;
}) {
  const [quantity, setQuantity] = useState(String(product.minQuantity));
  const [groups, setGroups] = useState("1");
  const [draftArtworks, setDraftArtworks] = useState<Record<number, string>>({});
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const initialLibraryId = useSearchParams().get("arte") ?? undefined;
  const [draftPreparation, setDraftPreparation] = useState<Record<number, "team" | "customer">>({});
  const [artworksOpen, setArtworksOpen] = useState(Boolean(initialLibraryId && libraryEnabled));
  const [uploadingGroups, setUploadingGroups] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const [confirmation, setConfirmation] = useState<{ quantity: number; groups: number; artworks: number } | null>(null);
  const artworkPanelId = useId();
  const artworkBusy = uploadingGroups.size > 0;
  const allowedArtworks = artworkLimit(Number(quantity), product.maxArtworks);
  const unusedArtworks = Object.entries(draftArtworks).filter(([index, id]) => id && Number(index) >= Number(groups || "1")).length;
  const [allowUnused, setAllowUnused] = useState(false);
  useEffect(() => setAllowUnused(false), [quantity, groups]);
  const [priced, setPrice] = useState<{ lines: CartLine[]; calculation: {
    totalCents: number;
    artworkDiscountCents?: number;
    items: { unitCents: number; quantity?: number; artworkName?: string }[];
  } } | null>(null);
  const [error, setError] = useState("");
  const lines = useMemo(() => {
    try {
      return distributeQuantity(
        Number(quantity),
        product.personalized ? Number(groups || "1") : 1,
      ).map((q, i) => ({
        id: crypto.randomUUID(),
        productId: product.id,
        quantity: q,
        artworkName: product.personalized ? draftNames[i] ?? `Arte ${i + 1}` : "",
        artworkId: product.personalized ? draftArtworks[i] ?? null : null,
        preparation: draftPreparation[i] ?? (product.artworkOptions?.allowTeamPreparation ? "team" as const : "customer" as const),
      }));
    } catch {
      return [];
    }
  }, [quantity, groups, product.id, product.personalized, product.artworkOptions, draftArtworks, draftPreparation, draftNames]);
  const approvalRevision = artworks.map(art => `${art.id}:${art.approved_at ?? ""}:${JSON.stringify(art.crop)}`).join("|");
  const previewPriceEvidence = JSON.stringify({ readyArtworkIds: artworks.filter(art => art.approved_at && art.crop).map(art => art.id) });
  const attachedCount = lines.filter(line => line.artworkId).length;
  const price = priced?.lines === lines ? priced.calculation : null;
  const deliveryIssue = commerceSelectionError(lines, product);
  async function addToCart() {
    if (disabled || !price || deliveryIssue || artworkBusy || addingRef.current || (unusedArtworks > 0 && !allowUnused)) return;
    addingRef.current = true;
    setAdding(true);
    setConfirmation(null);
    try {
      const added = await onAdd(lines);
      if (!added) return;
      setConfirmation({ quantity: lines.reduce((sum, line) => sum + line.quantity, 0), groups: lines.length, artworks: attachedCount });
      setQuantity("");
      setGroups("");
      setDraftArtworks({});
      setDraftNames({});
      setDraftPreparation({});
      setArtworksOpen(false);
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }
  useEffect(() => {
    let active = true;
    setPrice(null);
    setError("");
    if (!lines.length) return;
    const timer = setTimeout(() => {
      void storeRequest(`${api}/price`, "POST", { lines, ...(preview ? JSON.parse(previewPriceEvidence) : {}) })
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
  }, [api, lines, approvalRevision, preview, previewPriceEvidence]);
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
                placeholder={String(product.minQuantity)}
                disabled={adding || artworkBusy}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            {product.personalized ? (
              <label>
                Quantidade de artes
                <input
                  inputMode="numeric"
                  placeholder="1"
                  disabled={adding || artworkBusy}
                  value={groups}
                  aria-invalid={Number(groups) > allowedArtworks || Number(groups) < 1}
                  onChange={(e) => setGroups(e.target.value)}
                />
              </label>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            De {product.minQuantity} a {product.maxQuantity} unidades
            {product.personalized ? ` · Até ${allowedArtworks} ${allowedArtworks === 1 ? "arte" : "artes"} para esta quantidade` : ""}
          </p>
          {Number(groups) > allowedArtworks ? <p role="alert" className="mt-2 text-sm text-amber-700">Ajuste para até {allowedArtworks} artes ou aumente a quantidade de produtos. Nenhuma arte enviada foi apagada.</p> : null}
          {unusedArtworks > 0 ? <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={allowUnused} onChange={event => setAllowUnused(event.target.checked)}/>Confirmo que {unusedArtworks} arte(s) dos grupos anteriores não serão incluídas nesta seleção. Os arquivos continuam disponíveis.</label> : null}
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
          {product.personalized ? <StoreArtworkGuide productName={product.name} geometry={product.geometry} margins={product.margins} /> : null}
          {product.personalized ? (
            <section className={styles.productPersonalization}>
              <button type="button" className={styles.personalizationToggle}
                disabled={artworkBusy || adding}
                aria-expanded={artworksOpen} aria-controls={artworkPanelId}
                onClick={() => setArtworksOpen(open => !open)}>
                <ImagePlus size={21} aria-hidden="true" />
                <span><strong>{attachedCount ? "Suas artes" : "Adicionar sua arte"}</strong>
                  <small>{attachedCount ? `${attachedCount} de ${lines.length} ${lines.length === 1 ? "arte anexada" : "artes anexadas"}` : "Opcional · envie agora ou no carrinho"}</small>
                </span>
                <ChevronDown size={18} className={artworksOpen ? styles.chevronOpen : undefined} aria-hidden="true" />
              </button>
              {artworksOpen ? <div id={artworkPanelId} className={styles.personalizationContent}>
                <p className={styles.muted}>PNG, JPEG ou WebP de até 3 MB por arte.</p>
                {lines.length && !deliveryIssue ? lines.map((line, index) => (
                  <div className={styles.productArtworkGroup} key={index}>
                    <div className={styles.artworkGroupHeading}><strong>{line.artworkName}</strong><span>{line.quantity} un.</span></div>
                    <ArtworkTools slug={slug} storeName={settings.name} product={product} preview={preview}
                      libraryEnabled={libraryEnabled}
                      initialLibraryId={index === 0 ? initialLibraryId : undefined}
                      uploadLabel={`Enviar ${line.artworkName.toLowerCase()}`}
                      artwork={artworks.find(art => art.id === line.artworkId)}
                      artworks={artworks.filter(art => art.product_id === product.id)}
                      disabled={disabled || adding}
                      onBusyChange={busy => setUploadingGroups(current => {
                        const next = new Set(current);
                        if (busy) next.add(index); else next.delete(index);
                        return next;
                      })}
                      onRefresh={onArtworkRefresh}
                      pricingLines={lines}
                      benefitContext="selection"
                      preparation={line.preparation}
                      onPreparationChange={value => setDraftPreparation(current => ({ ...current, [index]: value }))}
                      onSelect={async (id, title) => { setDraftArtworks(current => ({ ...current, [index]: id })); if (title) { setDraftNames(current => ({ ...current, [index]: title })); setDraftPreparation(current => ({ ...current, [index]: "customer" })); } }}
                    />
                  </div>
                )) : <p className={styles.muted}>Informe a quantidade de produtos para anexar sua arte.</p>}
              </div> : null}
            </section>
          ) : null}
          <button
            className={`${styles.primary} w-full`}
            disabled={disabled || !price || Boolean(deliveryIssue) || artworkBusy || adding || (unusedArtworks > 0 && !allowUnused)}
            onClick={() => void addToCart()}
          >
            {adding || artworkBusy ? <Loader2 className="animate-spin motion-reduce:animate-none" size={18} /> : <ShoppingBag size={18} />}
            {adding ? "Adicionando..." : artworkBusy ? "Salvando sua arte..." : quoting ? "Adicionar ao orçamento" : "Adicionar ao carrinho"}
          </button>
          {product.personalized ? (
            <p className="mt-3 text-sm text-zinc-500">
              {quoting ? "A arte é opcional para orçar. Você pode enviá-la e aprová-la antes de comprar." : product.artworkOptions?.allowTeamPreparation ? "Envie sua arte para a equipe preparar ou enquadre e aprove para receber o benefício disponível." : "O enquadramento e a aprovação de cada arte podem ser concluídos no carrinho."}
            </p>
          ) : null}
          {quantity.trim() ? <StoreDeliveryInquiry api={api} lines={lines} production={settings.production} disabled={Boolean(deliveryIssue)} disabledReason={deliveryIssue ?? undefined} /> : null}
        </section>
      </div>
      {confirmation ? <aside className={styles.cartConfirmation} aria-label={quoting ? "Item adicionado ao orçamento" : "Confirmação do carrinho"}>
        <button type="button" className={styles.confirmationClose} title="Fechar confirmação" aria-label="Fechar confirmação" onClick={() => setConfirmation(null)}><X size={18} /></button>
        <img className={styles.confirmationImage} src={product.imageUrl} alt="" width={64} height={64} />
        <div role="status" aria-live="polite" className={styles.confirmationMessage}>
          <span className={styles.confirmationHeading}><CheckCircle2 size={20} aria-hidden="true" />{quoting ? "Produto adicionado ao orçamento" : "Produto adicionado ao carrinho"}</span>
          <strong>{product.name}</strong>
          <p>{confirmation.quantity.toLocaleString("pt-BR")} {confirmation.quantity === 1 ? "unidade" : "unidades"}{product.personalized ? ` · ${confirmation.groups} ${confirmation.groups === 1 ? "arte" : "artes"}` : ""}</p>
          {confirmation.artworks ? <small>{confirmation.artworks} {confirmation.artworks === 1 ? "arte já anexada" : "artes já anexadas"}</small> : null}
        </div>
        <Link href={quoting ? `${base}/orcamento` : `${base}/carrinho`} className={`${styles.primary} ${styles.confirmationLink}`}>{quoting ? "Ver meu orçamento" : "Ver carrinho"}<ArrowRight size={17} /></Link>
      </aside> : null}
    </>
  );
}
function BuyerLogin({
  api,
  onLogged,
  disabled,
  forQuote = false,
}: {
  api: string;
  onLogged: () => Promise<void>;
  disabled: boolean;
  forQuote?: boolean;
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
        {challenge ? "Confira seu e-mail" : forQuote ? "Valide seu e-mail para salvar o orçamento" : "Entre ou crie sua conta"}
      </h2>
      <p className={styles.muted}>
        {challenge
          ? `Enviamos um código para ${email}. Ele é válido por 10 minutos.`
          : forQuote ? "Seus produtos continuam no rascunho. Receba um código por e-mail, sem senha, para guardar o orçamento na sua conta e comprar depois." : "Acesse com um código por e-mail, sem precisar criar uma senha."}
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
        {busy ? "Aguarde…" : challenge ? forQuote ? "Validar e continuar orçamento" : "Confirmar acesso" : "Receber código"}
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
        api={`/api${base}`}
        settings={settings}
        base={base}
        preview
        disabled={false}
        onSubmit={async () => {
          const missing = cart.lines.some(
            (line) =>
              products.find((p) => p.id === line.productId)?.personalized &&
              !(line.preparation === "team" && products.find(p => p.id === line.productId)?.artworkOptions?.allowTeamPreparation && cart.artworks.some(a => a.id === line.artworkId && a.product_id === line.productId)) &&
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

function OrderDetail({
  order,
  instructions,
  busy,
  onRefresh,
  api,
}: {
  order: Order;
  instructions: string;
  busy: boolean;
  onRefresh: () => Promise<void>;
  api: string;
}) {
  return (
    <div className={styles.columns}>
      <div>
        {order.payment_environment === "test" ? <p className={styles.testNotice}>Pedido de teste · Validação de pagamento, sem produção ou envio.</p> : null}
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
        <CommerceOrderArtworks endpoint={`${api}/orders/${order.id}/artworks`} />
        <StoreOrderContactDetails billing={order.billing} address={order.address} same={order.deliveryAddressSameAsBilling} shippingOption={order.shippingOption}/>
        {order.production ? <p className="mt-4 text-sm">Previsão registrada: produção de <strong>{order.production.productionDays} dias úteis</strong>{order.production.transportDays !== null ? ` + ${order.production.transportDays} dias úteis de transporte` : " · transporte a confirmar"}.{order.production.deliveryDate ? <span className="mt-1 block font-semibold">{order.delivery === "pickup" ? "Retirada" : "Recebimento"} estimado: {formatDeliveryDate(order.production.deliveryDate)}</span> : null}<small className="mt-1 block opacity-70">Condicionada ao pagamento e à aprovação das artes na data de criação. Confirmações posteriores alteram a previsão.</small></p> : null}
        {order.hasTerms ? <section className="mt-6 space-y-3 border-t border-current/10 pt-5"><h2 className="text-sm font-semibold">Condições desta compra</h2><p className={styles.muted}>Consulte o texto registrado neste pedido{order.termsVersion ? `, versão ${order.termsVersion}` : ""}. Alterações posteriores na loja não mudam este registro.</p><a href={`${api}/orders/${order.id}/conditions`} className={styles.secondary}><Download size={16}/>Baixar condições aceitas</a></section> : null}
      </div>
      <aside className={styles.summary}>
        <Summary
          subtotal={order.subtotal_cents}
          shipping={order.shipping_cents}
          artworkDiscountCents={order.artworkDiscountCents}
        />
        {order.payment_status === "pending" ? (
          order.provider === "mercado_pago" ? (
            <StorePayment key={order.id} api={api} orderId={order.id} onConfirmed={onRefresh}/>
          ) : (
            <p className="my-5 whitespace-pre-wrap text-sm">{instructions}</p>
          )
        ) : null}
        {!(order.payment_status === "pending" && order.provider === "mercado_pago") ? <button
          className={`${styles.secondary} mt-3 w-full`}
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          Atualizar situação
        </button> : null}
      </aside>
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
