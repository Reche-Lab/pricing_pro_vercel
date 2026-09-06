"use client";
import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { CommerceImageUpload } from "./CommerceImageUpload";
type Banners = NonNullable<StoreSettings["banners"]>;
const input =
  "min-w-0 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";
export function StoreBannersEditor({
  banners,
  onChange,
  categories,
  uploading,
  onBusyChange,
}: {
  banners: Banners;
  onChange: (banners: Banners) => void;
  categories: string[];
  uploading: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  function update(id: string, patch: Partial<Banners[number]>) {
    onChange(
      banners.map((banner) =>
        banner.id === id ? { ...banner, ...patch } : banner,
      ),
    );
  }
  function move(index: number, direction: number) {
    const next = [...banners];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange(next);
  }
  return (
    <section className="min-w-0 space-y-4 border-t border-zinc-800 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          Banners da página inicial{" "}
          <span className="text-sm font-normal text-zinc-500">
            ({banners.length}/5)
          </span>
        </h2>
        <button
          type="button"
          className={button}
          disabled={banners.length >= 5 || uploading}
          onClick={() =>
            onChange([
              ...banners,
              {
                id: crypto.randomUUID(),
                imageUrl: "",
                mobileImageUrl: "",
                title: "",
                description: "",
                buttonLabel: "Conhecer produtos",
                category: "",
              },
            ])
          }
        >
          <Plus size={16} />
          Adicionar banner
        </button>
      </div>
      {banners.map((banner, index) => (
        <details
          key={banner.id}
          className="min-w-0 rounded-md border border-zinc-700"
          open={!banner.imageUrl}
        >
          <summary className="cursor-pointer p-4 text-sm font-medium">
            {index + 1}. {banner.title || "Novo banner"}
          </summary>
          <div className="grid min-w-0 gap-4 px-4 pb-4 sm:grid-cols-2">
            <CommerceImageUpload
              label={`Banner ${index + 1}`}
              purpose="cover"
              value={banner.imageUrl}
              onChange={(url) => update(banner.id, { imageUrl: url })}
              onBusyChange={onBusyChange}
            />
            <CommerceImageUpload
              label={`Banner ${index + 1} para celular (opcional)`}
              purpose="cover"
              value={banner.mobileImageUrl ?? ""}
              onChange={(url) => update(banner.id, { mobileImageUrl: url })}
              onBusyChange={onBusyChange}
            />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={banner.showText !== false}
                onChange={(event) =>
                  update(banner.id, { showText: event.target.checked })
                }
              />
              Exibir título, mensagem e botão sobre a imagem
            </label>
            <label className="grid gap-1 text-sm">
              Título
              <input
                className={input}
                maxLength={100}
                value={banner.title}
                onChange={(event) =>
                  update(banner.id, { title: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Texto do botão
              <input
                className={input}
                maxLength={40}
                value={banner.buttonLabel}
                onChange={(event) =>
                  update(banner.id, { buttonLabel: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Mensagem
              <textarea
                className={input}
                maxLength={200}
                value={banner.description}
                onChange={(event) =>
                  update(banner.id, { description: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Destino do botão
              <select
                className={input}
                value={banner.category}
                onChange={(event) =>
                  update(banner.id, { category: event.target.value })
                }
              >
                <option value="">Todos os produtos</option>
                {[
                  ...new Set([...categories, banner.category].filter(Boolean)),
                ].map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                className={button}
                title="Mover banner para cima"
                aria-label={`Mover banner ${index + 1} para cima`}
                disabled={index === 0 || uploading}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className={button}
                title="Mover banner para baixo"
                aria-label={`Mover banner ${index + 1} para baixo`}
                disabled={index === banners.length - 1 || uploading}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                className={button}
                disabled={uploading}
                onClick={() =>
                  onChange(banners.filter((b) => b.id !== banner.id))
                }
              >
                <Trash2 size={16} />
                Remover banner
              </button>
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
