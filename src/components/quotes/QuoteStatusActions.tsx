"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = [
  { value: "sent", label: "Marcar enviado" },
  { value: "accepted", label: "Aceito" },
  { value: "rejected", label: "Recusado" },
  { value: "expired", label: "Expirado" },
  { value: "cancelled", label: "Cancelado" }
] as const;

export function QuoteStatusActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState("");

  async function update(status: string) {
    setError("");
    setLoading(status);
    const response = await fetch(`/api/quotes/${quoteId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    setLoading("");
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Nao foi possivel alterar status.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <button
            className="focus-ring rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            disabled={loading === option.value}
            key={option.value}
            onClick={() => update(option.value)}
            type="button"
          >
            {loading === option.value ? "Salvando..." : option.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
