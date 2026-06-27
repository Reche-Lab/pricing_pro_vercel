"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function QuoteWhatsAppButton({ quoteId }: { quoteId: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function copyText() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/quotes/${quoteId}/whatsapp`);
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.text) {
      setMessage("Nao foi possivel gerar o texto.");
      return;
    }

    await navigator.clipboard.writeText(data.text);
    setMessage("Texto copiado.");
  }

  return (
    <div className="grid gap-2">
      <button
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        onClick={copyText}
        type="button"
      >
        <Copy size={16} />
        {loading ? "Copiando..." : "Copiar WhatsApp"}
      </button>
      {message ? <p className="text-sm text-zinc-500">{message}</p> : null}
    </div>
  );
}
