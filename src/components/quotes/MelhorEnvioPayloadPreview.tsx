"use client";

import { useState } from "react";
import { Clipboard, RefreshCw } from "lucide-react";

type PayloadResponse = {
  ok: boolean;
  payload?: unknown;
  missingFields?: string[];
  warnings?: string[];
  error?: string;
};

export function MelhorEnvioPayloadPreview({ quoteId }: { quoteId: string }) {
  const [payload, setPayload] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadPayload() {
    setMessage("");
    setLoading(true);
    const response = await fetch(`/api/quotes/${quoteId}/melhor-envio/payload`);
    const data = (await response.json().catch(() => null)) as PayloadResponse | null;
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel gerar o payload.");
      return;
    }

    setPayload(JSON.stringify(data.payload, null, 2));
    setMissingFields(data.missingFields ?? []);
    setWarnings(data.warnings ?? []);
  }

  async function copyPayload() {
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    setMessage("Payload copiado.");
  }

  return (
    <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
      <div>
        <h2 className="font-semibold">Payload Melhor Envio</h2>
        <p className="text-sm text-zinc-500">Rascunho para carrinho gerado a partir do orcamento.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-950/60 disabled:opacity-60"
          disabled={loading}
          onClick={loadPayload}
          type="button"
        >
          <RefreshCw size={16} />
          {loading ? "Gerando..." : "Gerar"}
        </button>
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-950/60 disabled:opacity-60"
          disabled={!payload}
          onClick={copyPayload}
          type="button"
        >
          <Clipboard size={16} />
          Copiar
        </button>
      </div>
      {missingFields.length > 0 ? (
        <div className="rounded-md bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Pendencias: {missingFields.join(", ")}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Avisos: {warnings.join(", ")}
        </div>
      ) : null}
      {payload ? (
        <textarea
          className="focus-ring min-h-64 w-full rounded-md border border-zinc-700 px-3 py-2 font-mono text-xs"
          onChange={(event) => setPayload(event.target.value)}
          value={payload}
        />
      ) : null}
      {message ? <p className="text-xs text-zinc-500">{message}</p> : null}
    </div>
  );
}
