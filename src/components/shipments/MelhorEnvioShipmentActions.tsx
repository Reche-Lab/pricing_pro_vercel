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
  const [operation, setOperation] = useState<(typeof ACTIONS)[number]["key"]>("cart");
  const [payload, setPayload] = useState("{}");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");

  async function loadSuggestedPayload(nextOperation = operation) {
    setMessage("");
    setLoading(`payload:${nextOperation}`);
    const response = await fetch(`/api/shipments/${shipmentId}/melhor-envio/payload?operation=${nextOperation}`);
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel preparar o payload.");
      return;
    }

    setPayload(JSON.stringify(data.payload, null, 2));
    setMissingFields(data.missingFields ?? []);
    setWarnings(data.warnings ?? []);
  }

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
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Operacao</span>
          <select
            className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            onChange={(event) => {
              const nextOperation = event.target.value as (typeof ACTIONS)[number]["key"];
              setOperation(nextOperation);
              setMissingFields([]);
              setWarnings([]);
            }}
            value={operation}
          >
            {ACTIONS.map((action) => (
              <option key={action.key} value={action.key}>
                {action.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="focus-ring self-end rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          disabled={loading === `payload:${operation}`}
          onClick={() => loadSuggestedPayload()}
          type="button"
        >
          {loading === `payload:${operation}` ? "Preparando..." : "Preparar payload"}
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-500">Payload Melhor Envio</span>
        <textarea
          className="focus-ring min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
          onChange={(event) => setPayload(event.target.value)}
          value={payload}
        />
      </label>
      {missingFields.length > 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Pendencias: {missingFields.join(", ")}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">Avisos: {warnings.join(", ")}</p>
      ) : null}
      <button
        className="focus-ring w-fit rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading === operation}
        onClick={() => run(operation)}
        type="button"
      >
        {loading === operation ? "Executando..." : ACTIONS.find((item) => item.key === operation)?.label}
      </button>
      {message ? <p className="text-xs text-zinc-500">{message}</p> : null}
    </div>
  );
}
