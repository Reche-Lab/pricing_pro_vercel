"use client";
import React, { useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Crop,
  Eye,
  FolderTree,
  Images,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type { getCommerceAdmin } from "@/repositories/commerce";
import {
  librarySlug,
  type LibraryArtwork,
  type LibraryCampaign,
  type LibraryCategory,
  type LibraryCommand,
  type LibraryResult,
} from "@/domain/commerce/library";
import {
  LibraryCategoryOptions,
  LibraryDialog,
  LibraryPagination,
  LibraryPicture,
} from "./LibraryUI";
import { useCommerceLibrary } from "./use-commerce-library";
import { CommerceImageUpload } from "./CommerceImageUpload";
import { storeRequest } from "./store-http";
import styles from "./library.module.css";
type Product = Awaited<ReturnType<typeof getCommerceAdmin>>["products"][number];
type Editor =
  | { kind: "artwork"; item: LibraryArtwork }
  | { kind: "category"; item?: LibraryCategory }
  | { kind: "campaign"; item?: LibraryCampaign };
const CropEditor = dynamic(
  () => import("../quotes/ArtworkCropEditor").then((m) => m.ArtworkCropEditor),
  { ssr: false },
);
const api = "/api/commerce/admin/library";
const statusName = (status: string) =>
  ({ draft: "Rascunho", published: "Publicado", archived: "Arquivado" })[
    status
  ] ?? status;
const datetimeInput = (value: string | null) =>
  value
    ? new Date(
        new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
export function CommerceLibraryAdmin({
  products,
  slug,
  onBusyChange,
}: {
  products: Product[];
  slug?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [tab, setTab] = useState("artworks"),
    [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [campaign, setCampaign] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const query = new URLSearchParams({
    q,
    status,
    page: String(page),
    ...(category ? { category } : {}),
    ...(campaign ? { campaign } : {}),
  }).toString();
  const { data, error, loading, reload } = useCommerceLibrary(api, query);
  const [modal, setModal] = useState<
    | Editor
    | { kind: "upload" }
    | {
        kind: "delete";
        item: LibraryCategory | LibraryCampaign;
        type: "category" | "campaign";
      }
    | null
  >(null);
  const [busy, updateBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [failure, setFailure] = useState("");
  const [framing, setFraming] = useState<{
    art: LibraryArtwork;
    product: Product;
  } | null>(null);
  function setBusy(value: boolean) {
    updateBusy(value);
    onBusyChange?.(value);
  }
  const eligible = products;
  async function command(input: LibraryCommand) {
    await storeRequest(api, "POST", input);
    reload();
  }
  async function perform(input: LibraryCommand) {
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      await command(input);
      setNotice("Alterações salvas.");
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  function move(
    kind: "category" | "campaign",
    index: number,
    direction: number,
  ) {
    const ids = (kind === "category" ? data!.categories : data!.campaigns).map(
      (item) => item.id,
    );
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void perform({ action: "reorder", kind, ids });
  }
  return (
    <section className={styles.admin} aria-label="Campanhas e artes">
      <div className={styles.toolbar}>
        <div>
          <h2>Campanhas e artes</h2>
          <p>Artes prontas para personalizar os produtos da sua loja.</p>
        </div>
        <div className={styles.actions}>
          {slug ? (
            <Link
              className={styles.button}
              href={`/commerce/${slug}/preview/artes`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Eye size={16} />
              Pré-visualizar acervo
            </Link>
          ) : null}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={data?.enabled ?? false}
              disabled={!data || busy || loading}
              onChange={(event) =>
                void perform({
                  action: "settings",
                  enabled: event.target.checked,
                })
              }
            />
            <span>Exibir biblioteca na loja</span>
          </label>
        </div>
      </div>
      {error || failure ? (
        <p role="alert" className={styles.error}>
          {error || failure}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className={styles.message}>
          {notice}
        </p>
      ) : null}
      <nav className={styles.tabs} aria-label="Biblioteca da loja">
        {(
          [
            ["artworks", "Artes", Images],
            ["campaigns", "Campanhas", Sparkles],
            ["categories", "Categorias", FolderTree],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      {!data ? (
        <p role="status" className={styles.hint}>
          {loading ? "Carregando biblioteca…" : "Biblioteca indisponível."}
        </p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <p className={styles.hint}>
              {tab === "artworks"
                ? "Envie as imagens, escolha os produtos compatíveis e publique quando estiver tudo pronto."
                : tab === "campaigns"
                  ? "Coleções temáticas, com capa, destaque na home e período opcional de publicação."
                  : "Categorias e subcategorias de artes, independentes das categorias dos produtos."}
            </p>
            <div className={styles.actions}>
              {!data.categories.length && !data.campaigns.length ? (
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => void perform({ action: "starter" })}
                >
                  <Sparkles size={16} />
                  Criar estrutura sugerida
                </button>
              ) : null}
              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  setModal(
                    tab === "artworks"
                      ? { kind: "upload" }
                      : tab === "categories"
                        ? { kind: "category" }
                        : { kind: "campaign" },
                  )
                }
              >
                <Plus size={17} />
                {tab === "artworks"
                  ? "Enviar artes"
                  : tab === "categories"
                    ? "Nova categoria"
                    : "Nova campanha"}
              </button>
            </div>
          </div>
          {tab === "artworks" ? (
            <>
              <div className={styles.filters}>
                <label className={styles.field}>
                  Pesquisar
                  <div className={styles.search}>
                    <Search size={16} />
                    <input
                      value={q}
                      placeholder="Nome ou palavra-chave"
                      maxLength={100}
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
                    <option value="">Todas</option>
                    <LibraryCategoryOptions categories={data.categories} />
                  </select>
                </label>
                <label className={styles.field}>
                  Campanha
                  <select
                    value={campaign}
                    onChange={(e) => {
                      setCampaign(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Todas</option>
                    {data.campaigns.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Publicação
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    {["all", "draft", "published", "archived"].map((s) => (
                      <option key={s} value={s}>
                        {s === "all" ? "Todas" : statusName(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.grid} aria-busy={loading}>
                {!error &&
                  data.artworks.map((art) => (
                    <article key={art.id} className={styles.card}>
                      <button
                        type="button"
                        className={styles.cardButton}
                        onClick={() => setModal({ kind: "artwork", item: art })}
                      >
                        <LibraryPicture
                          src={`${api}/assets/${art.id}?thumbnail&v=${art.version}`}
                          alt={art.title}
                        />
                        <div className={styles.cardContent}>
                          <span
                            className={styles.badge}
                            data-status={art.status}
                          >
                            {statusName(art.status)}
                          </span>
                          <h3>{art.title}</h3>
                          <p>
                            {art.product_ids.length} produtos · {art.width} ×{" "}
                            {art.height} px
                          </p>
                          <span className={styles.badge}>
                            <Pencil size={13} />
                            Editar arte e vínculos
                          </span>
                        </div>
                      </button>
                    </article>
                  ))}
              </div>
              {!loading && !data.artworks.length ? (
                <div className={styles.empty}>
                  <Images size={30} />
                  <h3>Sua próxima coleção começa aqui</h3>
                  <p>
                    Envie uma arte ou ajuste os filtros para encontrar suas
                    imagens.
                  </p>
                </div>
              ) : null}
              <LibraryPagination
                page={page}
                total={data.total}
                pageSize={data.pageSize}
                onChange={setPage}
                loading={loading}
              />
            </>
          ) : (
            (tab === "categories" ? data.categories : data.campaigns).map(
              (item, index, list) => (
                <div
                  key={item.id}
                  className={`${styles.listRow} ${"parent_id" in item && item.parent_id ? styles.childRow : ""}`}
                >
                  <div>
                    <h3>{item.name}</h3>
                    <p>
                      {"status" in item
                        ? `${statusName(item.status)} · ${item.artwork_count ?? 0} artes${item.featured ? " · Em destaque" : ""}`
                        : `${item.active ? "Ativa" : "Oculta"}${item.parent_id ? " · Subcategoria" : ""}`}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title="Mover para cima"
                      disabled={busy || index === 0}
                      onClick={() =>
                        move(
                          tab === "categories" ? "category" : "campaign",
                          index,
                          -1,
                        )
                      }
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title="Mover para baixo"
                      disabled={busy || index === list.length - 1}
                      onClick={() =>
                        move(
                          tab === "categories" ? "category" : "campaign",
                          index,
                          1,
                        )
                      }
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title={`Editar ${item.name}`}
                      onClick={() =>
                        setModal(
                          "status" in item
                            ? { kind: "campaign", item }
                            : { kind: "category", item },
                        )
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title={`Excluir ${item.name}`}
                      onClick={() =>
                        setModal({
                          kind: "delete",
                          item,
                          type: tab === "categories" ? "category" : "campaign",
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ),
            )
          )}
        </>
      )}
      {modal && data ? (
        <LibraryDialog
          title={
            modal.kind === "upload"
              ? "Enviar artes para a biblioteca"
              : modal.kind === "artwork"
                ? "Editar arte"
                : modal.kind === "delete"
                  ? `Excluir ${modal.item.name}?`
                  : `${modal.item ? "Editar" : "Nova"} ${modal.kind === "category" ? "categoria" : "campanha"}`
          }
          onClose={() => setModal(null)}
          busy={busy}
          wide={modal.kind === "artwork" || modal.kind === "upload"}
        >
          {modal.kind === "upload" ? (
            <LibraryUpload
              data={data}
              products={eligible}
              onBusy={setBusy}
              onSaved={reload}
            />
          ) : modal.kind === "delete" ? (
            <LibraryDelete
              onBusy={setBusy}
              onDelete={async () => {
                await command({
                  action: "delete",
                  kind: modal.type,
                  id: modal.item.id,
                  revision: modal.item.revision,
                });
                setModal(null);
                setNotice("Registro excluído.");
              }}
            />
          ) : (
            <LibraryEditor
              key={modal.kind + (modal.item?.id ?? "new")}
              modal={modal}
              data={data}
              products={eligible}
              onBusy={setBusy}
              onFrame={(art, product) => {
                setModal(null);
                setFraming({ art, product });
              }}
              onSave={async (input) => {
                await command(input);
                setModal(null);
                setNotice("Alterações salvas.");
              }}
            />
          )}
        </LibraryDialog>
      ) : null}
      {framing?.product.snapshot.geometry
        ? createPortal(
            <CropEditor
              artwork={{
                id: framing.art.id,
                artwork_name: framing.art.title,
                file_name: framing.art.file_name,
                crop_background_color: framing.art.bindings?.find(b => b.product_id === framing.product.id)?.initial_crop?.backgroundColor,
                crop_scale: String(
                  framing.art.bindings?.find(
                    (b) => b.product_id === framing.product.id,
                  )?.initial_crop?.scale ?? 1,
                ),
                crop_offset_x: String(
                  framing.art.bindings?.find(
                    (b) => b.product_id === framing.product.id,
                  )?.initial_crop?.offsetX ?? 0,
                ),
                crop_offset_y: String(
                  framing.art.bindings?.find(
                    (b) => b.product_id === framing.product.id,
                  )?.initial_crop?.offsetY ?? 0,
                ),
                rotation_degrees: String(
                  framing.art.bindings?.find(
                    (b) => b.product_id === framing.product.id,
                  )?.initial_crop?.rotationDegrees ?? 0,
                ),
              }}
              geometry={framing.product.snapshot.geometry}
              {...framing.product.snapshot.margins}
              imageUrl={`${api}/assets/${framing.art.id}`}
              quoteId=""
              itemId=""
              onPrepare={async (crop) => {
                await command({
                  action: "binding.save",
                  artworkId: framing.art.id,
                  productId: framing.product.id,
                  revision: framing.art.revision,
                  crop,
                });
              }}
              onClose={() => setFraming(null)}
              onSaved={() => {
                setFraming(null);
                setNotice(
                  "Enquadramento inicial salvo. O cliente ainda deverá conferir e aprovar a própria cópia.",
                );
              }}
            />,
            document.body,
          )
        : null}
    </section>
  );
}
function LibraryDelete({
  onDelete,
  onBusy,
}: {
  onDelete: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className={styles.form}>
      <p className={styles.hint}>
        A exclusão é definitiva. Categorias com artes ou subcategorias precisam
        ser reorganizadas antes de excluir. As artes de uma campanha não serão
        apagadas.
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <button
        className={`${styles.button} ${styles.danger}`}
        type="button"
        onClick={async () => {
          onBusy(true);
          try {
            await onDelete();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Não foi possível excluir.",
            );
          } finally {
            onBusy(false);
          }
        }}
      >
        <Trash2 size={16} />
        Confirmar exclusão
      </button>
    </div>
  );
}
function LibraryLinks({
  data,
  products,
  categoryId,
  campaignIds,
  productIds,
  onCategory,
  onCampaigns,
  onProducts,
}: {
  data: LibraryResult;
  products: Product[];
  categoryId: string;
  campaignIds: string[];
  productIds: string[];
  onCategory: (id: string) => void;
  onCampaigns: (ids: string[]) => void;
  onProducts: (ids: string[]) => void;
}) {
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  return (
    <>
      <label className={styles.field}>
        Categoria
        <select value={categoryId} onChange={(e) => onCategory(e.target.value)}>
          <option value="">Sem categoria</option>
          <LibraryCategoryOptions categories={data.categories} />
        </select>
      </label>
      <fieldset className={styles.fieldSet}>
        <legend>Campanhas</legend>
        <div className={styles.checks}>
          {data.campaigns.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={campaignIds.includes(c.id)}
                onChange={() => onCampaigns(toggle(campaignIds, c.id))}
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
        {!data.campaigns.length ? (
          <p className={styles.hint}>
            Crie uma campanha para agrupar suas artes temáticas.
          </p>
        ) : null}
      </fieldset>
      <fieldset className={styles.fieldSet}>
        <legend>Produtos compatíveis</legend>
        <div className={styles.checks}>
          {products
            .filter(
              (p) =>
                productIds.includes(p.id) ||
                (p.active && p.snapshot.personalized && p.snapshot.geometry),
            )
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  onChange={() => onProducts(toggle(productIds, p.id))}
                />
                <span>
                  {p.snapshot.name}
                  {!p.active || !p.snapshot.personalized || !p.snapshot.geometry
                    ? " · Indisponível no catálogo"
                    : ""}
                </span>
              </label>
            ))}
        </div>
        {!products.some(
          (p) => p.active && p.snapshot.personalized && p.snapshot.geometry,
        ) ? (
          <p className={styles.hint}>
            Publique um produto personalizado com geometria de corte para criar
            vínculos.
          </p>
        ) : null}
      </fieldset>
    </>
  );
}
function LibraryEditor({
  modal,
  data,
  products,
  onSave,
  onBusy,
  onFrame,
}: {
  modal: Editor;
  data: LibraryResult;
  products: Product[];
  onSave: (command: LibraryCommand) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onFrame: (art: LibraryArtwork, product: Product) => void;
}) {
  const art = modal.kind === "artwork" ? modal.item : undefined,
    collection = modal.kind === "campaign" ? modal.item : undefined,
    category = modal.kind === "category" ? modal.item : undefined;
  const [name, setName] = useState(
      art?.title ?? collection?.name ?? category?.name ?? "",
    ),
    [slug, setSlug] = useState(collection?.slug ?? category?.slug ?? ""),
    [description, setDescription] = useState(
      art?.description ?? collection?.description ?? "",
    ),
    [status, setStatus] = useState(
      art?.status ?? collection?.status ?? "draft",
    );
  const [parentId, setParentId] = useState(category?.parent_id ?? ""),
    [active, setActive] = useState(category?.active ?? true),
    [cover, setCover] = useState(collection?.cover_url ?? ""),
    [featured, setFeatured] = useState(collection?.featured ?? false),
    [start, setStart] = useState(datetimeInput(collection?.starts_at ?? null)),
    [end, setEnd] = useState(datetimeInput(collection?.ends_at ?? null));
  const [categoryId, setCategoryId] = useState(art?.category_id ?? ""),
    [campaignIds, setCampaignIds] = useState(art?.campaign_ids ?? []),
    [productIds, setProductIds] = useState(art?.product_ids ?? []),
    [tags, setTags] = useState(art?.tags.join(", ") ?? ""),
    [license, setLicense] = useState(art?.license_note ?? ""),
    [editable, setEditable] = useState(art?.editable ?? true),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const unsavedArtwork = Boolean(
    art &&
    (name !== art.title ||
      description !== art.description ||
      status !== art.status ||
      categoryId !== (art.category_id ?? "") ||
      tags !== art.tags.join(", ") ||
      license !== art.license_note ||
      editable !== art.editable ||
      JSON.stringify(campaignIds) !== JSON.stringify(art.campaign_ids) ||
      JSON.stringify(productIds) !== JSON.stringify(art.product_ids)),
  );
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || uploading) return;
        setBusy(true);
        onBusy(true);
        setError("");
        try {
          const identity = modal.item
            ? { id: modal.item.id, revision: modal.item.revision }
            : {};
          const input: LibraryCommand =
            modal.kind === "category"
              ? {
                  action: "category.save",
                  ...identity,
                  name,
                  slug,
                  parentId: parentId || null,
                  active,
                }
              : modal.kind === "campaign"
                ? {
                    action: "campaign.save",
                    ...identity,
                    name,
                    slug,
                    description,
                    coverUrl: cover,
                    status: status as "draft" | "published" | "archived",
                    featured,
                    startsAt: start ? new Date(start).toISOString() : null,
                    endsAt: end ? new Date(end).toISOString() : null,
                  }
                : {
                    action: "artwork.save",
                    id: art!.id,
                    revision: art!.revision,
                    title: name,
                    description,
                    tags: [
                      ...new Set(
                        tags
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      ),
                    ],
                    categoryId: categoryId || null,
                    campaignIds,
                    productIds,
                    status: status as "draft" | "published" | "archived",
                    editable,
                    licenseNote: license,
                  };
          await onSave(input);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Não foi possível salvar.",
          );
        } finally {
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className={styles.form}>
        <div className={styles.formColumns}>
          <label className={styles.field}>
            Nome
            <input
              required
              minLength={2}
              maxLength={
                modal.kind === "artwork"
                  ? 120
                  : modal.kind === "campaign"
                    ? 100
                    : 80
              }
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!modal.item) setSlug(librarySlug(e.target.value));
              }}
            />
          </label>
          {modal.kind !== "artwork" ? (
            <label className={styles.field}>
              Identificador na URL
              <input
                required
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
          ) : (
            <label className={styles.field}>
              Palavras-chave
              <input
                value={tags}
                maxLength={800}
                placeholder="rosa, prevenção, flores"
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
          )}
        </div>
        {modal.kind === "category" ? (
          <>
            <label className={styles.field}>
              Categoria principal
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Esta é uma categoria principal</option>
                {data.categories
                  .filter((c) => !c.parent_id && c.id !== category?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Visível na loja
            </label>
          </>
        ) : (
          <>
            <label className={styles.field}>
              Descrição
              <textarea
                value={description}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              Publicação
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {["draft", "published", "archived"].map((s) => (
                  <option key={s} value={s}>
                    {statusName(s)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {modal.kind === "campaign" ? (
          <>
            <CommerceImageUpload
              label="Capa da campanha"
              saveHint="Salve a campanha para aplicar."
              purpose="cover"
              value={cover}
              onChange={setCover}
              onBusyChange={(value) => {
                setUploading(value);
                onBusy(value);
              }}
            />
            <div className={styles.formColumns}>
              <label className={styles.field}>
                Publicar a partir de (opcional)
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                Ocultar a partir de (opcional)
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
              />
              Destacar na página inicial
            </label>
            <p className={styles.hint}>
              Salve como rascunho, vincule suas artes e publique. Para aparecer,
              a campanha precisa de capa e ao menos uma arte publicada
              compatível com um produto disponível.
            </p>
          </>
        ) : null}
        {art ? (
          <>
            <LibraryLinks
              data={data}
              products={products}
              categoryId={categoryId}
              campaignIds={campaignIds}
              productIds={productIds}
              onCategory={setCategoryId}
              onCampaigns={setCampaignIds}
              onProducts={setProductIds}
            />
            <label className={styles.field}>
              Origem e autorização de uso
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={license}
                onChange={(e) => setLicense(e.target.value)}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={editable}
                onChange={(e) => setEditable(e.target.checked)}
              />
              Oferecer retoque ao cliente, além do enquadramento
            </label>
          </>
        ) : null}
        {art?.product_ids.length ? (
          <fieldset className={styles.fieldSet}>
            <legend>Enquadramento inicial por produto</legend>
            <p className={styles.hint}>
              Salve as alterações antes de enquadrar. O enquadramento utiliza os
              vínculos e as medidas já salvos.
            </p>
            <div className={styles.actions}>
              {products
                .filter(
                  (p) =>
                    art.product_ids.includes(p.id) &&
                    p.active &&
                    p.snapshot.personalized &&
                    p.snapshot.geometry,
                )
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={styles.button}
                    disabled={unsavedArtwork}
                    title={
                      unsavedArtwork
                        ? "Salve as alterações antes de configurar o enquadramento"
                        : `Enquadramento inicial para ${product.snapshot.name}`
                    }
                    onClick={() => onFrame(art, product)}
                  >
                    <Crop size={16} />
                    {product.snapshot.name}
                  </button>
                ))}
            </div>
          </fieldset>
        ) : null}
      </fieldset>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <footer className={styles.formFooter}>
        <button
          type="submit"
          disabled={busy || uploading}
          className={styles.primary}
        >
          <Save size={16} />
          {busy ? "Salvando…" : "Salvar alterações"}
        </button>
      </footer>
    </form>
  );
}
function LibraryUpload({
  data,
  products,
  onBusy,
  onSaved,
}: {
  data: LibraryResult;
  products: Product[];
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [categoryId, setCategoryId] = useState(""),
    [campaignIds, setCampaignIds] = useState<string[]>([]),
    [productIds, setProductIds] = useState<string[]>([]),
    [license, setLicense] = useState(""),
    [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<Record<number, string>>({}),
    [error, setError] = useState("");
  const completed = useRef(new Set<number>());
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!files.length) {
          setError("Selecione ao menos uma imagem.");
          return;
        }
        setBusy(true);
        onBusy(true);
        setError("");
        try {
          for (let index = 0; index < files.length; index++) {
            if (completed.current.has(index)) continue;
            const file = files[index];
            setResults((old) => ({ ...old, [index]: "Enviando…" }));
            try {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () =>
                  reject(new Error("Falha ao ler o arquivo."));
                reader.readAsDataURL(file);
              });
              await storeRequest(`${api}/upload`, "POST", {
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                dataUrl,
                categoryId: categoryId || null,
                campaignIds,
                productIds,
                licenseNote: license,
                rightsConfirmed: rights,
              });
              completed.current.add(index);
              setResults((old) => ({
                ...old,
                [index]: "Enviada como rascunho",
              }));
            } catch (cause) {
              setResults((old) => ({
                ...old,
                [index]:
                  cause instanceof Error ? cause.message : "Falha no envio",
              }));
            }
          }
          onSaved();
        } finally {
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <fieldset className={styles.form} disabled={busy}>
        <label className={styles.field}>
          Imagens da coleção
          <input
            type="file"
            aria-label="Imagens da coleção"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const next = Array.from(e.target.files ?? []);
              if (
                next.length > 10 ||
                next.some(
                  (f) =>
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      f.type,
                    ) ||
                    !f.size ||
                    f.size > 3145728,
                )
              ) {
                setError(
                  "Selecione até 10 imagens PNG, JPEG ou WebP, de até 3 MB cada.",
                );
                e.target.value = "";
                return;
              }
              setFiles(next);
              setResults({});
              completed.current.clear();
              setError("");
            }}
          />
          <span className={styles.hint}>
            Até 10 imagens por lote · 3 MB por imagem. Os arquivos originais
            permanecem privados.
          </span>
        </label>
        <LibraryLinks
          data={data}
          products={products}
          categoryId={categoryId}
          campaignIds={campaignIds}
          productIds={productIds}
          onCategory={setCategoryId}
          onCampaigns={setCampaignIds}
          onProducts={setProductIds}
        />
        <label className={styles.field}>
          Origem e autorização de uso
          <textarea
            required
            minLength={5}
            maxLength={1000}
            placeholder="Ex.: criação própria, com uso comercial autorizado."
            value={license}
            onChange={(e) => setLicense(e.target.value)}
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            required
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
          />
          <span>
            Tenho autorização para disponibilizar estas artes nesta loja.
          </span>
        </label>
      </fieldset>
      {files.length ? (
        <ul className={styles.fileList}>
          {files.map((file, index) => (
            <li key={`${index}-${file.name}`}>
              <span>{file.name}</span>
              <span className={styles.hint}>
                {completed.current.has(index) ? <Check size={14} /> : null}
                {results[index] ?? "Aguardando envio"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <footer className={styles.formFooter}>
        <button
          className={styles.primary}
          type="submit"
          disabled={
            busy || !files.length || completed.current.size === files.length
          }
        >
          <Upload size={16} />
          {busy ? "Enviando coleção…" : "Enviar como rascunho"}
        </button>
      </footer>
    </form>
  );
}
