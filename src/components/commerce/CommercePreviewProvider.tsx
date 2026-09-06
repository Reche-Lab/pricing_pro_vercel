"use client";

import React, { createContext, useContext, useRef, useState } from "react";
import type { cartView } from "@/repositories/commerce";
import type { CartLine } from "@/domain/commerce/schemas";
import type { StoreArtwork } from "./StoreArtworkTools";
import { storeRequest } from "./store-http";

export type PreviewFile = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
};
export type PreviewCrop = NonNullable<StoreArtwork["crop"]>;
export type PreviewArtwork = StoreArtwork & {
  source: PreviewFile;
  preparedUrl?: string;
};
type Cart = Omit<Awaited<ReturnType<typeof cartView>>, "artworks"> & {
  artworks: PreviewArtwork[];
};
type PreviewSession = {
  cart: Cart;
  update: (lines: CartLine[]) => Promise<void>;
  upload: (productId: string, file: PreviewFile) => Promise<string>;
  prepare: (id: string, crop: PreviewCrop) => Promise<void>;
  approve: (id: string) => Promise<void>;
  reset: () => void;
};
const Context = createContext<PreviewSession | null>(null);
const emptyCart = (): Cart => ({
  lines: [],
  revision: 0,
  calculation: null,
  customer: null,
  artworks: [],
  payments: {
    mp_enabled: false,
    manual_enabled: true,
    manual_instructions: "Simulação sem cobrança.",
  },
});

// Kept only in this layout's memory: never localStorage, buyer cookies or real orders.
export function CommercePreviewProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const [cart, setCart] = useState<Cart>(emptyCart);
  const current = useRef(cart);
  const epoch = useRef(0);
  const api = `/api/commerce/${slug}/preview`;
  function commit(next: Cart) {
    current.current = next;
    setCart(next);
  }
  function saveArt(art: PreviewArtwork) {
    const artworks = [
      ...current.current.artworks.filter((old) => old.id !== art.id),
      art,
    ];
    const size = artworks.reduce(
      (sum, item) =>
        sum + item.source.dataUrl.length + (item.preparedUrl?.length ?? 0),
      0,
    );
    if (artworks.length > 20 || size > 24 * 1024 * 1024)
      throw new Error(
        "Limite de memória da prévia atingido. Reinicie a simulação para enviar novas artes.",
      );
    commit({ ...current.current, artworks });
  }
  function getArt(id: string) {
    const art = current.current.artworks.find((item) => item.id === id);
    if (!art)
      throw new Error("Esta arte não está mais disponível na simulação.");
    return art;
  }
  return (
    <Context.Provider
      value={{
        cart,
        reset() {
          epoch.current++;
          commit(emptyCart());
        },
        async update(lines) {
          const revision = current.current.revision;
          const version = epoch.current;
          const calculation = await storeRequest(`${api}/price`, "POST", {
            lines,
          });
          if (
            revision !== current.current.revision ||
            version !== epoch.current
          )
            throw new Error(
              "O carrinho mudou durante a atualização. Tente novamente.",
            );
          commit({
            ...current.current,
            lines,
            calculation,
            revision: revision + 1,
          });
        },
        async upload(productId, file) {
          const version = epoch.current;
          const source: PreviewFile = await storeRequest(
            `${api}/artworks`,
            "POST",
            { productId, ...file },
          );
          if (version !== epoch.current)
            throw new Error("A simulação foi reiniciada.");
          const id = crypto.randomUUID();
          saveArt({
            id,
            product_id: productId,
            file_name: source.fileName,
            approved_at: null,
            crop: null,
            source,
          });
          return id;
        },
        async prepare(id, crop) {
          const art = getArt(id);
          const version = epoch.current;
          const result = await storeRequest(`${api}/artworks`, "POST", {
            productId: art.product_id,
            ...art.source,
            crop,
          });
          if (version !== epoch.current)
            throw new Error("A simulação foi reiniciada.");
          saveArt({
            ...art,
            crop,
            approved_at: null,
            preparedUrl: result.dataUrl,
          });
        },
        async approve(id) {
          const art = getArt(id);
          if (!art.crop || !art.preparedUrl)
            throw new Error("Enquadre a arte antes de aprovar.");
          saveArt({ ...art, approved_at: new Date().toISOString() });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useCommercePreview() {
  return useContext(Context);
}
