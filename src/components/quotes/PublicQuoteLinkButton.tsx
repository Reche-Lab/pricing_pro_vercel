"use client";

import { useState } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";

export function PublicQuoteLinkButton({ quoteId }: { quoteId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");

  async function createLink() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/quotes/${quoteId}/public-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ validDays: 15 })
    });
    setLoading(false);

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.url) {
      setMessage(data?.error ?? "Não foi possível gerar o link público.");
      return;
    }

    setUrl(data.url);
    try {
      await navigator.clipboard.writeText(data.url);
      setMessage("Link público copiado. O orçamento foi marcado como enviado.");
    } catch {
      setMessage("Link público criado. Copie manualmente abaixo.");
    }
  }

  return (
    <div className="grid gap-2">
      <button
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:opacity-60"
        disabled={loading}
        onClick={createLink}
        type="button"
      >
        <Link2 size={16} />
        {loading ? "Gerando link..." : "Link público para aceite"}
      </button>
      {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
      {url ? (
        <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Copy size={14} />
            <span className="break-all">{url}</span>
          </div>
          <a
            className="inline-flex w-fit items-center gap-2 text-xs font-medium text-cyan-200 hover:text-cyan-100"
            href={url}
            rel="noreferrer"
            target="_blank"
          >
            Abrir visualização pública
            <ExternalLink size={13} />
          </a>
        </div>
      ) : null}
    </div>
  );
}
