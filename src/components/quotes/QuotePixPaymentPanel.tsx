"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, WalletCards, X } from "lucide-react";
import type { PixPaymentSnapshot } from "@/domain/payments/pix";
import { PixPaymentCard } from "@/components/quotes/PixPaymentCard";

export function QuotePixPaymentPanel({
  configured,
  disabled,
  initialSnapshot,
  quoteId
}: {
  configured: boolean;
  disabled: boolean;
  initialSnapshot: PixPaymentSnapshot | null;
  quoteId: string;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function update(include: boolean) {
    setLoading(true);
    setMessage("");
    setError(false);
    const response = await fetch(`/api/quotes/${quoteId}/pix-payment`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ include })
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      error?: string;
      pixPayment?: PixPaymentSnapshot | null;
    } | null;
    setLoading(false);

    if (!response.ok || !payload?.ok) {
      setError(true);
      setMessage(typeof payload?.error === "string" ? payload.error : "Não foi possível atualizar o Pix do orçamento.");
      return;
    }

    setSnapshot(payload.pixPayment ?? null);
    setMessage(include ? "Chave Pix incluída neste orçamento." : "Chave Pix removida deste orçamento.");
    router.refresh();
  }

  return (
    <section className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <WalletCards className="mt-0.5 shrink-0 text-emerald-300" size={17} />
          <div>
            <h2 className="text-sm font-semibold text-white">Pix no orçamento</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {snapshot ? "A chave abaixo aparece no PDF, WhatsApp e link público." : "Inclua a chave cadastrada apenas quando este orçamento aceitar Pix."}
            </p>
          </div>
        </div>
        {configured || snapshot ? (
          <button
            className={`focus-ring inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${snapshot ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"}`}
            disabled={disabled || loading}
            type="button"
            onClick={() => update(!snapshot)}
          >
            {loading ? <LoaderCircle className="animate-spin" size={14} /> : snapshot ? <X size={14} /> : <WalletCards size={14} />}
            {loading ? "Atualizando..." : snapshot ? "Remover" : "Incluir Pix"}
          </button>
        ) : (
          <Link className="text-xs font-medium text-amber-300 hover:text-amber-200" href="/settings?section=general">
            Cadastrar chave
          </Link>
        )}
      </div>
      {snapshot ? <div className="mt-3"><PixPaymentCard compact snapshot={snapshot} /></div> : null}
      {message ? <p className={`mt-3 text-xs ${error ? "text-rose-300" : "text-emerald-300"}`}>{message}</p> : null}
    </section>
  );
}
