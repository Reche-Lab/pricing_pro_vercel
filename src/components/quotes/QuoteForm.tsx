"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";

export type QuoteFormVariant = {
  id: string;
  label: string;
};

export type QuoteFormPlatform = {
  id: string;
  name: string;
};

export type QuoteFormCustomer = {
  id: string;
  name: string;
};

type QuoteFormProps = {
  variants: QuoteFormVariant[];
  platforms: QuoteFormPlatform[];
  customers: QuoteFormCustomer[];
};

export function QuoteForm({ variants, platforms, customers }: QuoteFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    customers.length > 0 ? "existing" : "new"
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productVariantId: form.get("productVariantId"),
        platformRuleId: form.get("platformRuleId"),
        quantity: Number(form.get("quantity")),
        customerId: customerMode === "existing" ? form.get("customerId") : null,
        customerName: customerMode === "new" ? form.get("customerName") : null,
        validDays: Number(form.get("validDays") || 7),
        notes: form.get("notes")
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel criar o orcamento.");
      return;
    }

    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-zinc-200 bg-white p-5" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2">
        <FilePlus2 className="text-brand" size={18} />
        <h2 className="font-semibold">Novo orcamento</h2>
      </div>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">Produto</span>
          <select className="focus-ring w-full rounded-md border border-zinc-300 bg-white px-3 py-2" name="productVariantId" required>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Quantidade</span>
            <input
              className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={100}
              min={1}
              name="quantity"
              required
              type="number"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Validade em dias</span>
            <input
              className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={7}
              min={1}
              max={90}
              name="validDays"
              required
              type="number"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">Canal</span>
          <select className="focus-ring w-full rounded-md border border-zinc-300 bg-white px-3 py-2" name="platformRuleId" required>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-md border border-zinc-200 p-3">
          <div className="mb-3 flex gap-2 text-sm">
            <button
              className={`rounded-md px-3 py-2 ${customerMode === "existing" ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}
              disabled={customers.length === 0}
              onClick={() => setCustomerMode("existing")}
              type="button"
            >
              Cliente existente
            </button>
            <button
              className={`rounded-md px-3 py-2 ${customerMode === "new" ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}
              onClick={() => setCustomerMode("new")}
              type="button"
            >
              Novo cliente rapido
            </button>
          </div>
          {customerMode === "existing" ? (
            <select className="focus-ring w-full rounded-md border border-zinc-300 bg-white px-3 py-2" name="customerId" required>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
              name="customerName"
              placeholder="Nome do cliente"
              required
            />
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">Observacoes</span>
          <textarea className="focus-ring min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2" name="notes" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button
        className="focus-ring mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading || variants.length === 0 || platforms.length === 0}
        type="submit"
      >
        {loading ? "Criando..." : "Criar orcamento"}
      </button>
    </form>
  );
}
