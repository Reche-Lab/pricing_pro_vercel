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
    <div>
      <button
        className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:opacity-60"
        disabled={loading}
        onClick={createLink}
        type="button"
      >
        <Link2 size={16} />
        {loading ? "Gerando link..." : "Link público para aceite"}
      </button>
      {message || url ? (
        <div className="fixed bottom-4 right-4 z-50 grid max-w-sm gap-2 rounded-lg border border-zinc-800 bg-zinc-950/95 p-3 text-sm text-zinc-100 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-white">{message || "Link público criado."}</p>
              {url ? (
                <p className="mt-1 line-clamp-2 break-all text-xs text-zinc-500">{url}</p>
              ) : null}
            </div>
            <button
              className="focus-ring rounded-md p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              type="button"
              onClick={() => {
                setMessage("");
                setUrl("");
              }}
            >
              ×
            </button>
          </div>
          {url ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
                type="button"
                onClick={() => navigator.clipboard.writeText(url)}
              >
                <Copy size={13} />
                Copiar novamente
              </button>
              <a
                className="focus-ring inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20"
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
      ) : null}
    </div>
  );
}
