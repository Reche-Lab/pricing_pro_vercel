"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, UserCheck } from "lucide-react";

export function OlistQuoteActions({
  quoteId,
  hasCustomer,
  externalOlistId,
  externalCrmId
}: {
  quoteId: string;
  hasCustomer: boolean;
  externalOlistId?: string | null;
  externalCrmId?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");

  async function run(action: "customer" | "crm") {
    setMessage("");
    setLoading(action);
    const response = await fetch(`/api/quotes/${quoteId}/olist/${action}`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Falha na integracao.");
      return;
    }

    setMessage(data.externalId ? `Sincronizado: ${data.externalId}` : "Enviado com sucesso.");
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <button
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60 disabled:opacity-60"
        disabled={!hasCustomer || loading === "customer"}
        onClick={() => run("customer")}
        type="button"
      >
        <UserCheck size={16} />
        {loading === "customer" ? "Criando..." : externalOlistId ? "Atualizar cliente Olist" : "Criar cliente Olist"}
      </button>
      <button
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60 disabled:opacity-60"
        disabled={loading === "crm"}
        onClick={() => run("crm")}
        type="button"
      >
        <Send size={16} />
        {loading === "crm" ? "Enviando..." : externalCrmId ? "Atualizar orçamento CRM" : "Enviar orçamento CRM"}
      </button>
      {message ? <p className="text-xs text-zinc-500">{message}</p> : null}
    </div>
  );
}
