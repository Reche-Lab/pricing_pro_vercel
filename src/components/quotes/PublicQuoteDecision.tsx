"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export function PublicQuoteDecision({
  token,
  disabled
}: {
  token: string;
  disabled: boolean;
}) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<"accepted" | "rejected" | "">("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function decide(decision: "accepted" | "rejected") {
    setLoading(decision);
    setMessage("");
    const response = await fetch(`/api/public/quotes/${token}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note })
    });
    setLoading("");

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data?.error ?? "Não foi possível registrar sua decisão.");
      return;
    }

    setDone(true);
    setMessage(decision === "accepted" ? "Orçamento aceito. Obrigado!" : "Orçamento recusado. Obrigado pelo retorno.");
  }

  if (disabled || done) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-sm font-medium text-white">{message || "Este orçamento já recebeu uma decisão."}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
      <h2 className="text-base font-semibold text-white">Decisão do orçamento</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Confirme sua decisão abaixo. Se quiser, deixe uma observação para a equipe.
      </p>
      <textarea
        className="focus-ring mt-4 min-h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
        maxLength={1000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Observação opcional"
        value={note}
      />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-300 disabled:opacity-60"
          disabled={Boolean(loading)}
          onClick={() => decide("accepted")}
          type="button"
        >
          <CheckCircle2 size={17} />
          {loading === "accepted" ? "Confirmando..." : "Aceitar orçamento"}
        </button>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-400/20 disabled:opacity-60"
          disabled={Boolean(loading)}
          onClick={() => decide("rejected")}
          type="button"
        >
          <XCircle size={17} />
          {loading === "rejected" ? "Enviando..." : "Recusar"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
    </div>
  );
}
