"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { ArtworkStudioAsset } from "../quotes/artwork-studio-types";
import { Check, Crop, Paintbrush, Upload } from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import { storeRequest } from "./store-http";
import { useCommercePreview } from "./CommercePreviewProvider";
const GuidedStudio = dynamic(
  () =>
    import("../quotes/ArtworkGuidedStudio").then((m) => m.ArtworkGuidedStudio),
  { ssr: false },
);
export type StoreArtwork = {
  id: string;
  product_id: string;
  file_name: string;
  approved_at: string | null;
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
}: {
  slug: string;
  product: ReturnType<typeof publicCommerceProduct>;
  artwork?: StoreArtwork;
  artworks: StoreArtwork[];
  onSelect: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  preview?: boolean;
}) {
  const simulation = useCommercePreview();
  const [editor, setEditor] = useState<"crop" | "retouch" | "review" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
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
      crop: art.crop ?? {
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
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 3145728) throw new Error("Envie uma imagem de até 3 MB.");
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
      setEditor("crop");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <Upload size={15} />
          {busy ? "Enviando…" : "Enviar arte"}
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
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
            onChange={(event) => {
              setError("");
              void onSelect(event.target.value).catch((e) =>
                setError(e.message),
              );
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
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              onClick={() => setEditor("retouch")}
            >
              <Paintbrush size={15} />
              Retocar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              onClick={() => setEditor("crop")}
            >
              <Crop size={15} />
              Enquadrar
            </button>
            <button
              type="button"
              disabled={busy || !artwork.crop || Boolean(artwork.approved_at)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-600 px-3 py-2 text-sm text-emerald-800 disabled:opacity-50"
              onClick={() => setEditor("review")}
            >
              <Check size={15} />
              {artwork.approved_at ? "Aprovada" : "Aprovar arte"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {artwork && editor ? (
        <GuidedStudio
          initialAsset={studioAsset(artwork)}
          initialStep={editor}
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
            if (preview) await simulation!.approve(asset.id);
            else
              await storeRequest(`${base}/${asset.id}`, "POST", {
                action: "approve",
              });
            await onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}
