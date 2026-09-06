"use client";
import React, { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { storeRequest } from "./store-http";

export function CommerceImageUpload({
  label,
  purpose,
  value,
  onChange,
  onBusyChange,
}: {
  label: string;
  purpose: "logo" | "cover" | "product";
  value: string;
  onChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function upload(file?: File) {
    if (!file || pending.current) return;
    setError("");
    setMessage("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 3145728
    ) {
      setError("Selecione uma imagem PNG, JPEG ou WebP de até 3 MB.");
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });
      const result = await storeRequest("/api/commerce/admin/media", "POST", {
        purpose,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        dataUrl,
      });
      onChange(result.url);
      setMessage("Imagem enviada. Salve a loja para aplicar.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar a imagem.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className="min-w-0 space-y-2"
    >
      <p id={`${id}-label`} className="text-sm">
        {label}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div
          className={`${purpose === "cover" ? "h-24 w-48" : "h-24 w-24"} flex max-w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-900`}
        >
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={`Prévia: ${label}`}
                className="h-full w-full object-contain"
              />
            </>
          ) : (
            <ImagePlus size={24} className="text-zinc-500" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            id={id}
            aria-label={`Enviar ${label}`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void upload(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {busy ? "Enviando…" : value ? "Substituir imagem" : "Enviar imagem"}
          </button>
          {value ? (
            <button
              type="button"
              disabled={busy}
              title={`Remover ${label}`}
              aria-label={`Remover ${label}`}
              className="rounded-md border border-zinc-700 p-2 text-zinc-400 hover:text-rose-300 disabled:opacity-50"
              onClick={() => {
                onChange("");
                setError("");
                setMessage(
                  "Imagem removida da seleção. Salve a loja para aplicar.",
                );
              }}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-zinc-500">PNG, JPEG ou WebP · até 3 MB</p>
      {busy ? (
        <p role="status" className="text-xs text-zinc-400">
          Enviando imagem…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-emerald-300">
          {message}
        </p>
      ) : null}
    </div>
  );
}
