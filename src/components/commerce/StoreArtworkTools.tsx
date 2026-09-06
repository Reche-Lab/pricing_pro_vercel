"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Crop, Paintbrush, Upload } from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import { storeRequest } from "./store-http";
import { useCommercePreview } from "./CommercePreviewProvider";
const CropEditor = dynamic(
  () =>
    import("@/components/quotes/ArtworkCropEditor").then(
      (m) => m.ArtworkCropEditor,
    ),
  { ssr: false },
);
const RetouchEditor = dynamic(
  () =>
    import("@/components/quotes/ArtworkRetouchEditor").then(
      (m) => m.ArtworkRetouchEditor,
    ),
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
  const [editor, setEditor] = useState<"crop" | "retouch" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editor) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [editor]);
  const base = `/api/store/${slug}/artworks`;
  const temporaryArt = preview
    ? simulation?.cart.artworks.find((a) => a.id === artwork?.id)
    : undefined;
  const sourceUrl = preview
    ? (temporaryArt?.source.dataUrl ?? "")
    : `${base}/${artwork?.id}`;
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
    setEditor(null);
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
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  if (preview) await simulation!.approve(artwork.id);
                  else
                    await storeRequest(`${base}/${artwork.id}`, "POST", {
                      action: "approve",
                    });
                  await onRefresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Falha ao aprovar.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
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
      {artwork && editor === "crop" && product.geometry
        ? createPortal(
            <CropEditor
              artwork={{
                id: artwork.id,
                file_name: artwork.file_name,
                artwork_name: product.name,
                crop_scale: String(artwork.crop?.scale ?? 1),
                crop_offset_x: String(artwork.crop?.offsetX ?? 0),
                crop_offset_y: String(artwork.crop?.offsetY ?? 0),
                rotation_degrees: String(artwork.crop?.rotationDegrees ?? 0),
              }}
              geometry={product.geometry}
              {...product.margins}
              imageUrl={sourceUrl}
              itemId={product.id}
              quoteId=""
              prepareUrl={`${base}/${artwork.id}`}
              onPrepare={
                preview
                  ? (crop) => simulation!.prepare(artwork.id, crop)
                  : undefined
              }
              onClose={() => setEditor(null)}
              onSaved={() => {
                setEditor(null);
                void onRefresh();
              }}
            />,
            document.body,
          )
        : null}
      {artwork && editor === "retouch"
        ? createPortal(
            <RetouchEditor
              artworkName={product.name}
              fileName={artwork.file_name}
              imageUrl={sourceUrl}
              geometry={product.geometry}
              {...product.margins}
              onClose={() => setEditor(null)}
              onSave={saveFile}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
