"use client";

import { useState } from "react";
import { Edit3, X } from "lucide-react";
import { QuoteEditPanel, QuoteItemEditPanel, type QuoteEditPricingContext, type QuoteEditVariant } from "@/components/quotes/QuoteEditPanel";
import type { QuoteDetail, QuoteEditLogRow, QuoteItemRow } from "@/repositories/quotes";

export function QuoteItemsEditModal({
  editLogs,
  items,
  pricingContext,
  quote,
  variants
}: {
  editLogs: QuoteEditLogRow[];
  items: QuoteItemRow[];
  pricingContext: QuoteEditPricingContext;
  quote: QuoteDetail;
  variants: QuoteEditVariant[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-950"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Edit3 size={14} />
        Editar
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
              <div>
                <h3 className="text-base font-semibold text-white">Editar orçamento</h3>
                <p className="mt-1 text-sm leading-5 text-zinc-500">
                  Ajuste condições gerais ou edite um item individual sem sair desta tela.
                </p>
              </div>
              <button
                className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid min-h-0 gap-3 overflow-y-auto overflow-x-hidden p-5">
              <QuoteEditPanel editLogs={editLogs} items={items} quote={quote} />
              <QuoteItemEditPanel
                items={items}
                pricingContext={pricingContext}
                quote={quote}
                variants={variants}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
