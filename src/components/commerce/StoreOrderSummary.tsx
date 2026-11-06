import React from "react";
import { storeMoney } from "./store-http";

export function StoreOrderSummary({ subtotal, shipping, artworkDiscountCents = 0 }: {
  subtotal: number;
  shipping?: number;
  artworkDiscountCents?: number;
}) {
  return <dl className="space-y-3 pt-4">
    <div className="flex justify-between gap-3">
      <dt>{artworkDiscountCents > 0 ? "Produtos antes do benefício" : "Produtos"}</dt>
      <dd className="shrink-0 tabular-nums">{storeMoney(subtotal + artworkDiscountCents)}</dd>
    </div>
    {artworkDiscountCents > 0 ? <div className="flex justify-between gap-3 font-medium" style={{ color: "var(--highlight, #047857)" }}>
      <dt>Desconto por arte pronta</dt><dd className="shrink-0 tabular-nums">−{storeMoney(artworkDiscountCents)}</dd>
    </div> : null}
    <div className="flex justify-between gap-3 text-sm text-zinc-500">
      <dt>Entrega</dt><dd className="shrink-0 tabular-nums">{shipping === undefined ? "Na próxima etapa" : storeMoney(shipping)}</dd>
    </div>
    <div className="flex justify-between gap-3 border-t border-current/15 pt-4 text-xl font-semibold">
      <dt>Total</dt><dd className="shrink-0 tabular-nums">{storeMoney(subtotal + (shipping ?? 0))}</dd>
    </div>
  </dl>;
}
