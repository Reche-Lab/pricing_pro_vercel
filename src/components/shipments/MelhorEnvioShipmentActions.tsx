"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, FileText, PackagePlus, Printer, Radar, RefreshCw } from "lucide-react";

const ACTIONS = [
  { key: "cart", label: "Carrinho", actionLabel: "Adicionar ao carrinho", icon: PackagePlus },
  { key: "checkout", label: "Pagamento", actionLabel: "Pagar etiqueta", icon: CreditCard },
  { key: "generate", label: "Geracao", actionLabel: "Gerar etiqueta", icon: FileText },
  { key: "print", label: "Impressao", actionLabel: "Imprimir etiqueta", icon: Printer },
  { key: "tracking", label: "Rastreio", actionLabel: "Rastrear", icon: Radar }
] as const;

type MelhorEnvioAction = (typeof ACTIONS)[number]["key"];
type PreparedPayload = {
  ok: boolean;
  payload?: unknown;
  missingFields?: string[];
  warnings?: string[];
  error?: string;
};

export function MelhorEnvioShipmentActions({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [operation, setOperation] = useState<MelhorEnvioAction>("cart");
  const [payload, setPayload] = useState("{}");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [completed, setCompleted] = useState<Partial<Record<MelhorEnvioAction, boolean>>>({});

  async function loadSuggestedPayload(nextOperation = operation): Promise<PreparedPayload | null> {
    setMessage("");
    setLoading(`payload:${nextOperation}`);
    const response = await fetch(`/api/shipments/${shipmentId}/melhor-envio/payload?operation=${nextOperation}`);
    const data = (await response.json().catch(() => null)) as PreparedPayload | null;
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel preparar o payload.");
      return null;
    }

    setPayload(JSON.stringify(data.payload, null, 2));
    setMissingFields(data.missingFields ?? []);
    setWarnings(data.warnings ?? []);
    return data;
  }

  async function runPrepared(action: MelhorEnvioAction) {
    setOperation(action);
    const prepared = await loadSuggestedPayload(action);
    if (!prepared) return;

    if ((prepared.missingFields ?? []).length > 0) {
      setMessage("Existem pendencias antes de executar esta etapa.");
      return;
    }

    await submitPayload(action, prepared.payload);
  }

  async function runEditedPayload() {
    setMessage("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setMessage("Payload JSON invalido.");
      return;
    }

    await submitPayload(operation, parsed);
  }

  async function submitPayload(action: MelhorEnvioAction, parsed: unknown) {
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

    setCompleted((current) => ({ ...current, [action]: true }));
    setMessage("Operacao executada e shipment atualizado.");
    router.refresh();
  }

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-zinc-200 p-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const isLoading = loading === action.key || loading === `payload:${action.key}`;
          return (
            <button
              className="focus-ring grid min-h-24 gap-2 rounded-md border border-zinc-300 p-3 text-left text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              disabled={isLoading}
              key={action.key}
              onClick={() => runPrepared(action.key)}
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <Icon size={16} />
                {completed[action.key] ? <CheckCircle2 className="text-emerald-600" size={16} /> : null}
              </span>
              <span className="font-medium text-zinc-950">{action.label}</span>
              <span>{isLoading ? "Executando..." : action.actionLabel}</span>
            </button>
          );
        })}
      </div>
      {missingFields.length > 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Pendencias: {missingFields.join(", ")}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">Avisos: {warnings.join(", ")}</p>
      ) : null}
      <details className="rounded-md border border-zinc-200 p-3">
        <summary className="cursor-pointer text-xs font-medium text-zinc-700">Revisar payload</summary>
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Operacao</span>
              <select
                className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                onChange={(event) => {
                  const nextOperation = event.target.value as MelhorEnvioAction;
                  setOperation(nextOperation);
                  setMissingFields([]);
                  setWarnings([]);
                }}
                value={operation}
              >
                {ACTIONS.map((action) => (
                  <option key={action.key} value={action.key}>
                    {action.actionLabel}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="focus-ring inline-flex items-center gap-2 self-end rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              disabled={loading === `payload:${operation}`}
              onClick={() => loadSuggestedPayload()}
              type="button"
            >
              <RefreshCw size={14} />
              {loading === `payload:${operation}` ? "Preparando..." : "Preparar"}
            </button>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">Payload Melhor Envio</span>
            <textarea
              className="focus-ring min-h-32 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
              onChange={(event) => setPayload(event.target.value)}
              value={payload}
            />
          </label>
          <button
            className="focus-ring w-fit rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={loading === operation}
            onClick={runEditedPayload}
            type="button"
          >
            {loading === operation ? "Executando..." : "Executar payload revisado"}
          </button>
        </div>
      </details>
      {message ? <p className="text-xs text-zinc-500">{message}</p> : null}
    </div>
  );
}
