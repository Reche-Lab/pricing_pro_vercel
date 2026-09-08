"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Play,
  Star,
  Trash2,
} from "lucide-react";
import {
  getProductMedia,
  PRODUCT_MEDIA_LIMIT,
  PRODUCT_VIDEO_LIMIT,
  type ProductMedia,
} from "@/domain/commerce/product-media";
import { productFileKind, uploadProductFile } from "./store-media-http";
const iconButton =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30";
export function CommerceProductMediaEditor({
  productId,
  media,
  imageUrl,
  onChange,
  onBusyChange,
}: {
  productId: string;
  media?: ProductMedia[];
  imageUrl: string;
  onChange: (patch: { media?: ProductMedia[]; imageUrl: string }) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const items = getProductMedia(media, imageUrl, productId);
  const videoCount = items.filter((item) => item.kind === "video").length;
  function change(next: ProductMedia[]) {
    const cover = next.find((item) => item.kind === "image");
    if (next.length && !cover) {
      setError(
        "Mantenha pelo menos uma imagem como capa. Remova os vídeos antes de remover a última imagem.",
      );
      return;
    }
    const ordered =
      cover && next[0].kind !== "image"
        ? [cover, ...next.filter((item) => item.id !== cover.id)]
        : next;
    onChange({
      media: ordered.length ? ordered : undefined,
      imageUrl: ordered[0]?.url ?? "",
    });
    setError("");
    setMessage("Galeria alterada. Salve a loja para aplicar.");
  }
  async function upload(files: File[]) {
    if (!files.length || pending.current) return;
    setError("");
    setMessage("");
    try {
      const kinds = files.map(productFileKind);
      if (items.length + files.length > PRODUCT_MEDIA_LIMIT)
        throw new Error("Cada produto aceita até 10 mídias, incluindo a capa.");
      if (
        videoCount + kinds.filter((kind) => kind === "video").length >
        PRODUCT_VIDEO_LIMIT
      )
        throw new Error("Cada produto aceita no máximo 2 vídeos.");
      if (!items.length && kinds[0] !== "image")
        throw new Error("Adicione primeiro uma imagem para a capa do produto.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Confira os arquivos selecionados.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    const next = [...items];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(0);
        setMessage(`Enviando ${i + 1} de ${files.length}: ${files[i].name}`);
        next.push(await uploadProductFile(files[i], setProgress));
        onChange({ media: [...next], imageUrl: next[0].url });
      }
      setMessage("Mídias enviadas. Salve a loja para aplicar.");
    } catch (cause) {
      setMessage("");
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar. As mídias já concluídas foram preservadas.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section aria-label="Galeria do produto" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Galeria{" "}
          <span className="font-normal text-zinc-400">
            {items.length}/10 mídias · {videoCount}/2 vídeos
          </span>
        </p>
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          className="sr-only"
          aria-label="Adicionar mídias do produto"
          disabled={busy || items.length >= 10}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(files);
          }}
        />
        <button
          type="button"
          title="Adicionar fotos de até 3 MB ou vídeos de até 20 MB. Até 10 mídias, incluindo no máximo 2 vídeos."
          disabled={busy || items.length >= 10}
          onClick={() => input.current?.click()}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ImagePlus size={16} />
          )}
          Adicionar mídias
        </button>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="min-w-0 overflow-hidden rounded-md border border-zinc-700"
          >
            <div className="relative aspect-square bg-zinc-950">
              {item.kind === "image" ? (
                <img
                  src={item.url}
                  alt={`Imagem ${index + 1} do produto`}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : previewVideo === item.id ? (
                <video
                  src={item.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                  aria-label={`Vídeo ${index + 1} do produto`}
                  onError={() =>
                    setError(
                      "Não foi possível reproduzir o vídeo. Prefira MP4 com vídeo H.264 para maior compatibilidade.",
                    )
                  }
                />
              ) : (
                <button
                  type="button"
                  className="grid h-full w-full place-content-center justify-items-center gap-2 text-zinc-300 hover:bg-zinc-900"
                  aria-label={`Visualizar vídeo ${index + 1}`}
                  onClick={() => setPreviewVideo(item.id)}
                >
                  <Play size={28} />
                  <span className="text-xs">Visualizar vídeo</span>
                </button>
              )}
              {index === 0 ? (
                <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-zinc-950/85 px-2 py-1 text-xs text-amber-200">
                  <Star size={12} />
                  Capa
                </span>
              ) : null}
            </div>
            <p className="flex items-center gap-1 px-2 pt-2 text-xs text-zinc-400">
              {item.kind === "video" ? <Play size={12} /> : null}
              {index + 1}. {item.kind === "video" ? "Vídeo" : "Imagem"}
            </p>
            <div className="flex flex-wrap gap-1 p-2">
              <button
                className={iconButton}
                type="button"
                disabled={
                  busy ||
                  index === 0 ||
                  (index === 1 && item.kind === "video") ||
                  (index === 1 && items[0].kind !== "image")
                }
                title="Mover para a esquerda"
                aria-label={`Mover mídia ${index + 1} para a esquerda`}
                onClick={() => {
                  const next = [...items];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  change(next);
                }}
              >
                <ArrowLeft size={14} />
              </button>
              <button
                className={iconButton}
                type="button"
                disabled={
                  busy ||
                  index === items.length - 1 ||
                  (index === 0 && items[1]?.kind === "video")
                }
                title="Mover para a direita"
                aria-label={`Mover mídia ${index + 1} para a direita`}
                onClick={() => {
                  const next = [...items];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  change(next);
                }}
              >
                <ArrowRight size={14} />
              </button>
              {item.kind === "image" ? (
                <button
                  className={iconButton}
                  type="button"
                  disabled={busy || index === 0}
                  title="Definir como capa"
                  aria-label={`Definir imagem ${index + 1} como capa`}
                  onClick={() =>
                    change([item, ...items.filter((m) => m.id !== item.id)])
                  }
                >
                  <Star size={14} />
                </button>
              ) : null}
              <button
                className={iconButton}
                type="button"
                disabled={busy}
                title="Remover mídia"
                aria-label={`Remover mídia ${index + 1}`}
                onClick={() => change(items.filter((m) => m.id !== item.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-400">
        Fotos: PNG, JPEG ou WebP, até 3 MB cada. Vídeos: MP4 ou WebM, até 20 MB
        cada. Máximo de 10 mídias, sendo até 2 vídeos.
      </p>
      {busy ? (
        <progress
          max={100}
          value={progress}
          aria-label="Progresso do envio"
          className="h-2 w-full accent-emerald-500"
        />
      ) : null}
      {message ? (
        <p role="status" className="break-words text-xs text-emerald-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
