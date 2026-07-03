"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

export function DeleteQuoteButton({
  quoteId,
  customerName,
  total,
  redirectTo
}: {
  quoteId: string;
  customerName?: string | null;
  total?: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function deleteQuote() {
    setError("");
    setLoading(true);
    const response = await fetch(`/api/quotes/${quoteId}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setError(data?.error ?? "Não foi possível excluir o orçamento.");
      return;
    }

    setOpen(false);
    if (redirectTo) {
      router.push(redirectTo);
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button
        className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-400/20"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Trash2 size={16} />
        Excluir
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
              <div>
                <h3 className="text-base font-semibold text-white">Excluir orçamento</h3>
                <p className="mt-1 text-sm leading-5 text-zinc-500">
                  Esta ação remove o orçamento, seus itens e snapshots de cálculo. Envios vinculados serão apenas desvinculados.
                </p>
              </div>
              <button
                className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 p-5">
              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-sm">
                <p className="font-medium text-white">{customerName || "Cliente não informado"}</p>
                <p className="mt-1 text-zinc-500">Orçamento: {quoteId}</p>
                {total ? <p className="mt-1 text-zinc-500">Total: {total}</p> : null}
              </div>
              <p className="text-sm leading-5 text-rose-100">
                Confirme apenas se este orçamento antigo não deve mais aparecer no histórico.
              </p>
              {error ? (
                <p className="rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 p-5 sm:flex-row sm:justify-end">
              <button
                className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
                disabled={loading}
                onClick={() => setOpen(false)}
                type="button"
              >
                Manter orçamento
              </button>
              <button
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-rose-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-rose-300 disabled:opacity-60"
                disabled={loading}
                onClick={deleteQuote}
                type="button"
              >
                <Trash2 size={16} />
                {loading ? "Excluindo..." : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

