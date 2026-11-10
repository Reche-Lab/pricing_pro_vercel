"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { ArtworkStudioAsset } from "../quotes/artwork-studio-types";
import { Check, Crop, Eye, Paintbrush, Upload, Images } from "lucide-react";
import type { LibraryCrop } from "@/domain/commerce/library";
import { StoreProductMockup } from "./StoreProductMockup";
import type { publicCommerceProduct } from "@/repositories/commerce";
import { storeRequest } from "./store-http";
import { useCommercePreview } from "./CommercePreviewProvider";
import type { CartLine } from "@/domain/commerce/schemas";
import { StoreArtworkReward } from "./StoreArtworkReward";
const GuidedStudio = dynamic(
  () =>
    import("../quotes/ArtworkGuidedStudio").then((m) => m.ArtworkGuidedStudio),
  { ssr: false },
);
const LibraryPicker = dynamic(() => import("./StoreLibrary").then(m => m.LibraryArtworkPicker), { ssr: false });
export type StoreArtwork = {
  id: string;
  product_id: string;
  file_name: string;
  approved_at: string | null;
  initial_crop?: LibraryCrop | null;
  editing_allowed?: boolean;
  crop?: {
    scale: number;
    offsetX: number;
    offsetY: number;
    rotationDegrees: number;
  } | null;
};
export function StoreArtworkTools({
  slug,
  product,
  artwork,
  artworks,
  onSelect,
  onRefresh,
  preview = false,
  disabled = false,
  onBusyChange,
  uploadLabel = "Enviar arte",
  preparation = "customer",
  onPreparationChange,
  pricingLines,
  benefitContext = "selection",
  libraryEnabled = false,
  initialLibraryId,
}: {
  slug: string;
  product: ReturnType<typeof publicCommerceProduct>;
  artwork?: StoreArtwork;
  artworks: StoreArtwork[];
  onSelect: (id: string, title?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  preview?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  uploadLabel?: string;
  preparation?: "customer" | "team";
  onPreparationChange?: (value: "customer" | "team") => Promise<void> | void;
  pricingLines?: CartLine[];
  benefitContext?: "selection" | "cart";
  libraryEnabled?: boolean;
  initialLibraryId?: string;
}) {
  const simulation = useCommercePreview();
  const [libraryOpen, setLibraryOpen] = useState(Boolean(initialLibraryId && libraryEnabled));
  const [editor, setEditor] = useState<"crop" | "retouch" | "review" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [showProduct, setShowProduct] = useState(false);
  const [reward, setReward] = useState<{ discountCents: number | null; celebrate: boolean; refreshFailed: boolean } | null>(null);
  const celebrated = useRef(new Set<string>());
  const working = useRef(false);
  function setWorking(value: boolean) {
    working.current = value;
    setBusy(value);
    onBusyChange?.(value);
  }
  const [error, setError] = useState("");
  const base = `/api/store/${slug}/artworks`;
  const temporaryArt = preview
    ? simulation?.cart.artworks.find((a) => a.id === artwork?.id)
    : undefined;
  const sourceUrl = preview
    ? (temporaryArt?.source.dataUrl ?? "")
    : `${base}/${artwork?.id}`;
  function studioAsset(art: StoreArtwork): ArtworkStudioAsset {
    const temporary = preview ? simulation!.getArtwork(art.id) : undefined;
    return {
      id: art.id,
      name: product.name,
      fileName: art.file_name,
      sourceUrl: preview ? temporary!.source.dataUrl : `${base}/${art.id}`,
      preparedUrl: preview
        ? temporary?.preparedUrl
        : art.crop
          ? `${base}/${art.id}?prepared=1&v=${encodeURIComponent(JSON.stringify(art.crop))}`
          : undefined,
      geometry: product.geometry,
      margins: product.margins,
      crop: art.crop ?? art.initial_crop ?? {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotationDegrees: 0,
      },
      approved: Boolean(art.approved_at),
    };
  }
  async function saveFile(file: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    dataUrl: string;
  }) {
    if (preview && !simulation)
      throw new Error("Reabra a prévia para iniciar a simulação.");
    const result = preview
      ? { artwork: { id: await simulation!.upload(product.id, file) } }
      : await storeRequest(base, "POST", {
          productId: product.id,
          ...file,
        });
    await onSelect(result.artwork.id);
    await onRefresh();
    return result.artwork.id as string;
  }
  async function upload(file?: File) {
    if (!file || disabled || working.current) return;
    setWorking(true);
    setError("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use uma imagem PNG, JPEG ou WebP.");
      if (file.size === 0 || file.size > 3145728) throw new Error("Envie uma imagem de até 3 MB, que não esteja vazia.");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await saveFile({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        dataUrl,
      });
      if (preparation !== "team") setEditor("crop");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      {product.artworkOptions?.allowTeamPreparation && onPreparationChange ? <fieldset className="grid gap-2 rounded-md border border-current/20 p-3"><legend className="px-1 text-sm font-medium">Como deseja preparar esta arte?</legend>{([ ["team", "Prefiro que a equipe prepare"], ["customer", "Quero preparar e aprovar"] ] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-start gap-2 text-sm"><input type="radio" checked={preparation === value} disabled={busy || disabled} onChange={() => { setWorking(true); void Promise.resolve(onPreparationChange(value)).catch(e => setError(e.message)).finally(() => setWorking(false)); }} /><span>{label}{value === "customer" && product.artworkOptions!.discountFixedCents > 0 ? <small className="block text-emerald-600">Benefício de até {(product.artworkOptions!.discountFixedCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por arte, limitado a {product.artworkOptions!.maxDiscountPercent}% do grupo.</small> : null}</span></label>)}</fieldset> : null}
      <div className="flex flex-wrap items-center gap-2">
        {libraryEnabled ? <button type="button" disabled={busy || disabled} title="Escolher uma arte da biblioteca da loja" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-current/25 px-3 py-2 text-sm" onClick={() => setLibraryOpen(true)}><Images size={16}/>Escolher arte pronta</button> : null}
        <label className={`inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm ${busy || disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
          <Upload size={15} />
          {busy ? "Enviando…" : uploadLabel}
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy || disabled}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        {artworks.length > 0 ? (
          <select
            aria-label="Versão da arte"
            className="min-w-0 max-w-full rounded-md border border-zinc-300 p-2 text-sm"
            value={artwork?.id ?? ""}
            disabled={busy || disabled}
            onChange={(event) => {
              const id = event.target.value;
              if (working.current || disabled) return;
              setWorking(true);
              setError("");
              void onSelect(id).catch((e) =>
                setError(e.message),
              ).finally(() => setWorking(false));
            }}
          >
            <option value="" disabled>
              Escolha uma versão
            </option>
            {artworks.map((art, index) => (
              <option key={art.id} value={art.id}>
                {index + 1}. {art.file_name}
                {art.approved_at ? " · aprovada" : ""}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {artwork ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={artwork.file_name}
            width={80}
            height={80}
            className="h-20 w-20 rounded-md border border-zinc-200 bg-white object-contain"
            src={
              preview
                ? (temporaryArt?.preparedUrl ?? sourceUrl)
                : `${base}/${artwork.id}?prepared=1&v=${encodeURIComponent(JSON.stringify(artwork.crop))}`
            }
          />
          <div className="flex flex-wrap gap-2">
            {preparation === "team" ? <p className="text-sm">Arte enviada para preparação pela equipe. A prova será disponibilizada no seu pedido antes da impressão.</p> : <>
            {artwork.editing_allowed !== false ? <button
              type="button"
              disabled={busy || disabled}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              onClick={() => setEditor("retouch")}
            >
              <Paintbrush size={15} />
              Retocar
            </button> : null}
            <button
              type="button"
              disabled={busy || disabled}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              onClick={() => setEditor("crop")}
            >
              <Crop size={15} />
              Enquadrar
            </button>
            <button
              type="button"
              disabled={busy || disabled || !artwork.crop || Boolean(artwork.approved_at)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-600 px-3 py-2 text-sm text-emerald-800 disabled:opacity-50"
              onClick={() => setEditor("review")}
            >
              <Check size={15} />
              {artwork.approved_at ? "Aprovada" : "Aprovar arte"}
            </button>
            </>}
            {artwork.crop ? <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-current/25 px-3 text-sm" onClick={() => setShowProduct(!showProduct)}><Eye size={15} />Ver produto acabado</button> : null}
          </div>
        </div>
      ) : null}
      {showProduct && artwork?.crop && product.geometry ? <StoreProductMockup name={product.name} sourceUrl={preview ? temporaryArt?.preparedUrl ?? "" : `${base}/${artwork.id}?prepared=1&v=${encodeURIComponent(JSON.stringify(artwork.crop))}`} geometry={product.geometry} margins={product.margins} model={product.artworkOptions?.mockup} /> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {artwork && editor ? (
        <GuidedStudio
          allowRetouch={artwork.editing_allowed !== false}
          initialAsset={studioAsset(artwork)}
          initialStep={editor}
          renderApprovalSuccess={() => reward ? <StoreArtworkReward {...reward} context={benefitContext} /> : <p role="status">Arte aprovada!</p>}
          renderProductPreview={asset => asset.geometry && asset.preparedUrl ? <StoreProductMockup name={product.name} sourceUrl={asset.preparedUrl} geometry={asset.geometry} margins={asset.margins} model={product.artworkOptions?.mockup} /> : null}
          onClose={() => setEditor(null)}
          onRetouch={async (_asset, file) => {
            const id = await saveFile(file);
            return studioAsset({
              id,
              product_id: product.id,
              file_name: file.fileName,
              crop: null,
              approved_at: null,
            });
          }}
          onPrepare={async (asset, crop) => {
            if (preview) await simulation!.prepare(asset.id, crop);
            else
              await storeRequest(`${base}/${asset.id}`, "POST", {
                action: "prepare",
                ...crop,
              });
            await onRefresh();
            return {
              ...asset,
              crop,
              approved: false,
              preparedUrl: preview
                ? simulation!.getArtwork(asset.id).preparedUrl
                : `${base}/${asset.id}?prepared=1&v=${Date.now()}`,
            };
          }}
          onApprove={async (asset) => {
            const result = preview ? await simulation!.approve(asset.id, pricingLines) : await storeRequest(`${base}/${asset.id}`, "POST", {
              action: "approve", ...(pricingLines ? { lines: pricingLines } : {}),
            });
            const celebrate = result.newlyApproved === true && !celebrated.current.has(asset.id);
            if (celebrate) celebrated.current.add(asset.id);
            let refreshFailed = false;
            try { await onRefresh(); } catch { refreshFailed = true; }
            setReward({
              discountCents: Number.isSafeInteger(result.artworkDiscountCents) && result.artworkDiscountCents >= 0 ? result.artworkDiscountCents : null,
              celebrate, refreshFailed,
            });
          }}
        />
      ) : null}
      {libraryOpen && libraryEnabled ? <LibraryPicker slug={slug} productId={product.id} preview={preview} initialArtworkId={initialLibraryId} onClose={() => setLibraryOpen(false)} onSelect={async (id, title) => {
        setWorking(true);
        try { await onSelect(id, title); await onRefresh(); setLibraryOpen(false); setEditor("crop"); }
        finally { setWorking(false); }
      }}/> : null}
    </div>
  );
}
