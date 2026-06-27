"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";

export function PlatformForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/platforms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: form.get("key"),
        name: form.get("name"),
        commissionRate: Number(form.get("commissionRate")) / 100,
        fixedFee: Number(form.get("fixedFee")),
        sellerShippingCost: Number(form.get("sellerShippingCost")),
        sellerShippingThreshold: Number(form.get("sellerShippingThreshold"))
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel criar o canal. Use uma chave unica em minusculas.");
      return;
    }

    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-zinc-200 bg-white p-5" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2">
        <Store className="text-brand" size={18} />
        <h2 className="font-semibold">Novo canal</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Chave" name="key" placeholder="site_proprio" required />
        <Input label="Nome" name="name" placeholder="Site proprio" required />
        <Input label="Comissao (%)" name="commissionRate" required step="0.01" type="number" />
        <Input label="Taxa fixa (R$)" name="fixedFee" required step="0.01" type="number" />
        <Input label="Frete vendedor (R$)" name="sellerShippingCost" required step="0.01" type="number" />
        <Input label="Limite frete vendedor (R$)" name="sellerShippingThreshold" required step="0.01" type="number" />
      </div>
      {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button
        className="focus-ring mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        {loading ? "Criando..." : "Criar canal"}
      </button>
    </form>
  );
}

function Input({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  step
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
        min={type === "number" ? 0 : undefined}
        name={name}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
      />
    </label>
  );
}
