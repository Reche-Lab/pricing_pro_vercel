"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACTIONS = [
  { key: "cart", label: "Adicionar ao carrinho" },
  { key: "checkout", label: "Pagar etiqueta" },
  { key: "generate", label: "Gerar etiqueta" },
  { key: "print", label: "Imprimir etiqueta" },
  { key: "tracking", label: "Rastrear" }
] as const;

export function MelhorEnvioShipmentActions({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState("{}");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");

  async function run(action: string) {
    setMessage("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setMessage("Payload JSON invalido.");
      return;
    }

    setLoading(action);
    const response = await fetch(`/api/shipments/${shipmentId}/melhor-envio/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: parsed })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Falha na operacao.");
      return;
    }

    setMessage("Operacao executada e shipment atualizado.");
    router.refresh();
  }

  return (
    <div className="mt-3 grid gap-2 rounded-md border border-zinc-200 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-500">Payload Melhor Envio</span>
        <textarea
          className="focus-ring min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
          onChange={(event) => setPayload(event.target.value)}
          value={payload}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <button
            className="focus-ring rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            disabled={loading === action.key}
            key={action.key}
            onClick={() => run(action.key)}
            type="button"
          >
            {loading === action.key ? "Executando..." : action.label}
          </button>
        ))}
      </div>
      {message ? <p className="text-xs text-zinc-500">{message}</p> : null}
    </div>
  );
}
