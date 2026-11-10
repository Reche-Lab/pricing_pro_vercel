"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Images, Search, Sparkles } from "lucide-react";
import {
  libraryQuerySchema,
  type LibraryArtwork,
  type LibraryCampaign,
  type LibraryResult,
} from "@/domain/commerce/library";
import type { publicCommerceProduct } from "@/repositories/commerce";
import {
  LibraryCategoryOptions,
  LibraryDialog,
  LibraryPagination,
  LibraryPicture,
} from "./LibraryUI";
import { useCommerceLibrary } from "./use-commerce-library";
import { useCommercePreview } from "./CommercePreviewProvider";
import { storeRequest } from "./store-http";
import styles from "./library.module.css";
type Product = ReturnType<typeof publicCommerceProduct>;
export const libraryApi = (slug: string, preview: boolean) =>
  preview
    ? `/api/commerce/${slug}/preview/library`
    : `/api/store/${slug}/library`;
export function LibraryGallery({
  slug,
  preview,
  productId,
  fixedCampaign,
  initial,
  onInspect,
  initialArtworkId,
}: {
  slug: string;
  preview: boolean;
  productId?: string;
  fixedCampaign?: string;
  initial?: LibraryResult;
  onInspect: (art: LibraryArtwork) => void;
  initialArtworkId?: string;
}) {
  const [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [campaign, setCampaign] = useState(fixedCampaign ?? ""),
    [page, setPage] = useState(1);
  const [requestedArt, setRequestedArt] = useState(
    libraryQuerySchema.safeParse({ artwork: initialArtworkId }).success
      ? initialArtworkId
      : undefined,
  );
  const query = new URLSearchParams({
    q,
    page: String(page),
    ...(category ? { category } : {}),
    ...(campaign ? { campaign } : {}),
    ...(productId ? { product: productId } : {}),
    ...(requestedArt ? { artwork: requestedArt } : {}),
  }).toString();
  const { data, error, loading } = useCommerceLibrary(
    libraryApi(slug, preview),
    query,
    initial,
  );
  const api = libraryApi(slug, preview);
  return (
    <div className={styles.library}>
      <div className={styles.filters}>
        <label className={styles.field}>
          Encontrar uma arte
          <div className={styles.search}>
            <Search size={16} />
            <input
              maxLength={100}
              placeholder="Tema, nome ou palavra-chave"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </label>
        <label className={styles.field}>
          Categoria
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as categorias</option>
            <LibraryCategoryOptions categories={data?.categories ?? []} />
          </select>
        </label>
        {!fixedCampaign ? (
          <label className={styles.field}>
            Campanha
            <select
              value={campaign}
              onChange={(e) => {
                setCampaign(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os temas</option>
              {data?.campaigns.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className={styles.hint} role="status">
          {loading
            ? "Buscando inspiração…"
            : `${data?.total ?? 0} artes disponíveis`}
        </span>
      </div>
      {requestedArt ? (
        <div className={styles.actions}>
          <p className={styles.hint}>
            Confira sua escolha e confirme em “Usar esta arte”.
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={() => setRequestedArt(undefined)}
          >
            Ver todas as artes
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : (
        <div className={styles.grid} aria-busy={loading}>
          {data?.artworks.map((art) => (
            <article key={art.id} className={styles.card}>
              <button
                type="button"
                className={styles.cardButton}
                onClick={() => onInspect(art)}
                title={`Ver ${art.title}`}
              >
                <LibraryPicture
                  src={`${api}/thumbnail/${art.id}?v=${art.version}`}
                  alt={art.title}
                />
                <div className={styles.cardContent}>
                  {art.id === initialArtworkId ? (
                    <span className={styles.badge}>
                      <Sparkles size={13} />
                      Sua escolha
                    </span>
                  ) : null}
                  <h3>{art.title}</h3>
                  <p>
                    Escolher esta arte{" "}
                    <ArrowRight size={13} className="inline" />
                  </p>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && !data?.total ? (
        <div className={styles.empty}>
          <Images size={32} />
          <h3>Ainda não encontramos essa inspiração</h3>
          <p>
            Experimente outro tema ou categoria. Você também pode enviar sua
            própria arte na página do produto.
          </p>
        </div>
      ) : null}
      {data ? (
        <LibraryPagination
          page={page}
          total={data.total}
          pageSize={data.pageSize}
          onChange={setPage}
          loading={loading}
        />
      ) : null}
    </div>
  );
}
function CampaignCards({
  campaigns,
  base,
}: {
  campaigns: LibraryCampaign[];
  base: string;
}) {
  return (
    <div className={styles.collectionGrid}>
      {campaigns.map((campaign) => (
        <Link
          className={styles.card}
          key={campaign.id}
          href={`${base}/campanhas/${campaign.slug}`}
        >
          <div className={styles.campaignPicture}>
            {campaign.cover_url ? (
              <img
                src={campaign.cover_url}
                width={640}
                height={360}
                alt={campaign.name}
                loading="lazy"
              />
            ) : (
              <span className={styles.pictureFallback}>
                <Images size={28} />
                <span>Capa da campanha ainda não enviada</span>
              </span>
            )}
          </div>
          <div className={styles.cardContent}>
            <span className={styles.badge}>
              {campaign.artwork_count} artes para escolher
            </span>
            <h3>{campaign.name}</h3>
            <p>
              {campaign.description ||
                "Uma coleção de ideias para personalizar do seu jeito."}
            </p>
            <span className={styles.badge}>
              Explorar coleção <ArrowRight size={13} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function FeaturedLibraryCampaigns({
  slug,
  preview,
  base,
}: {
  slug: string;
  preview: boolean;
  base: string;
}) {
  const { data, error } = useCommerceLibrary(libraryApi(slug, preview), "");
  const campaigns = data?.campaigns.filter((c) => c.featured).slice(0, 6) ?? [];
  if (error || !campaigns.length) return null;
  return (
    <section className={styles.featured}>
      <div className={styles.toolbar}>
        <div>
          <span className={styles.eyebrow}>
            <Sparkles size={15} />
            Ideias que inspiram
          </span>
          <h2>Escolha uma causa. Personalize uma ideia.</h2>
        </div>
        <Link href={`${base}/campanhas`} className={styles.button}>
          Todas as campanhas <ArrowRight size={16} />
        </Link>
      </div>
      <CampaignCards campaigns={campaigns} base={base} />
    </section>
  );
}
export function StoreLibrary({
  slug,
  preview = false,
  base,
  products,
  initial,
  campaignSlug,
  campaignsOnly = false,
}: {
  slug: string;
  preview?: boolean;
  base: string;
  products: Product[];
  initial: LibraryResult;
  campaignSlug?: string;
  campaignsOnly?: boolean;
}) {
  const [selected, setSelected] = useState<LibraryArtwork | null>(null);
  const campaign = initial.campaigns.find((c) => c.slug === campaignSlug);
  return (
    <section className={styles.library}>
      <header className={styles.pageHeading}>
        <span className={styles.eyebrow}>
          <Sparkles size={16} />
          {campaignsOnly
            ? "Coleções da loja"
            : "Sua próxima criação começa aqui"}
        </span>
        <h1>
          {campaign?.name ??
            (campaignsOnly
              ? "Campanhas e inspirações"
              : "Artes prontas para personalizar")}
        </h1>
        <p>
          {campaign?.description ||
            (campaignsOnly
              ? "Encontre o tema da sua ação, escolha a arte e leve sua mensagem para os nossos produtos."
              : "Encontre uma arte que combine com sua ideia. Escolha o produto, confira o enquadramento e aprove antes de comprar.")}
        </p>
      </header>
      {campaign?.cover_url ? (
        <img
          className={styles.coverBanner}
          src={campaign.cover_url}
          alt={campaign.name}
          width={1200}
          height={300}
        />
      ) : null}
      {campaignsOnly ? (
        initial.campaigns.length ? (
          <CampaignCards campaigns={initial.campaigns} base={base} />
        ) : (
          <p className={styles.hint}>
            Novas campanhas estarão disponíveis em breve.
          </p>
        )
      ) : (
        <LibraryGallery
          slug={slug}
          preview={preview}
          initial={initial}
          fixedCampaign={campaignSlug}
          onInspect={setSelected}
        />
      )}
      {selected ? (
        <LibraryDialog
          title={selected.title}
          onClose={() => setSelected(null)}
          wide
        >
          <div className={styles.inspector}>
            <LibraryPicture
              src={`${libraryApi(slug, preview)}/thumbnail/${selected.id}?v=${selected.version}`}
              alt={selected.title}
            />
            <div>
              <h3>Em qual produto vamos usar?</h3>
              <p>
                {selected.description ||
                  "Escolha um produto compatível para conferir o enquadramento da sua arte."}
              </p>
              {products
                .filter((p) => selected.product_ids.includes(p.id))
                .map((p) => (
                  <Link
                    key={p.id}
                    href={`${base}/produto/${p.id}?arte=${selected.id}`}
                    className={styles.productChoice}
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" width={56} height={56} />
                    ) : null}
                    <span>{p.name}</span>
                    <ArrowRight size={17} />
                  </Link>
                ))}
            </div>
          </div>
        </LibraryDialog>
      ) : null}
    </section>
  );
}
export function LibraryArtworkPicker({
  slug,
  productId,
  preview,
  initialArtworkId,
  onSelect,
  onClose,
}: {
  slug: string;
  productId: string;
  preview: boolean;
  initialArtworkId?: string;
  onSelect: (id: string, title: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<LibraryArtwork | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = React.useRef(false);
  const simulation = useCommercePreview();
  return (
    <LibraryDialog
      title={selected?.title ?? "Escolha uma arte pronta"}
      onClose={onClose}
      busy={busy}
      wide
    >
      {selected ? (
        <>
          <button
            className={styles.button}
            disabled={busy}
            type="button"
            onClick={() => {
              setSelected(null);
              setError("");
            }}
          >
            <ArrowLeft size={16} />
            Voltar à galeria
          </button>
          <div className={`${styles.inspector} mt-4`}>
            <LibraryPicture
              src={`${libraryApi(slug, preview)}/thumbnail/${selected.id}?v=${selected.version}`}
              alt={selected.title}
            />
            <div>
              <h3>{selected.title}</h3>
              <p>
                {selected.description ||
                  "Use esta arte como ponto de partida. Na próxima etapa você poderá conferir o enquadramento e aprovar sua versão."}
              </p>
              <p className={styles.hint}>
                Sua escolha não altera o arquivo original da loja.
              </p>
              {error ? (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              ) : null}
              <button
                className={styles.primary}
                disabled={busy}
                type="button"
                onClick={async () => {
                  if (pending.current) return;
                  pending.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    let id: string;
                    if (preview) {
                      if (!simulation)
                        throw new Error("Reabra a prévia da loja.");
                      id = await simulation.chooseLibrary(
                        selected.id,
                        productId,
                      );
                    } else {
                      const result = await storeRequest(
                        `${libraryApi(slug, false)}/select`,
                        "POST",
                        { artworkId: selected.id, productId },
                      );
                      id = result.artwork.id;
                    }
                    await onSelect(id, selected.title);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Não foi possível selecionar esta arte.",
                    );
                  } finally {
                    pending.current = false;
                    setBusy(false);
                  }
                }}
              >
                <Sparkles size={16} />
                {busy ? "Preparando sua cópia…" : "Usar esta arte"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <LibraryGallery
          slug={slug}
          preview={preview}
          productId={productId}
          initialArtworkId={initialArtworkId}
          onInspect={setSelected}
        />
      )}
    </LibraryDialog>
  );
}
