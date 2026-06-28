"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";

const ANCHORS = [1, 10, 50, 100, 500, 1000] as const;

export function ProductForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setLoading(true);

    const form = new FormData(formElement);
    const anchors = Object.fromEntries(
      ANCHORS.map((quantity) => [quantity, Number(form.get(`anchor_${quantity}`))])
    );

    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productName: form.get("productName"),
        category: form.get("category"),
        description: form.get("description"),
        variantName: form.get("variantName"),
        sku: form.get("sku"),
        unitCost: Number(form.get("unitCost")),
        unitWeightKg: Number(form.get("unitWeightKg")),
        anchors
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel criar o produto. Verifique se ja existe uma variante com esse nome.");
      return;
    }

    formElement.reset();
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2">
        <PackagePlus className="text-amber-400" size={18} />
        <h2 className="font-semibold">Novo produto</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Produto" name="productName" placeholder="Chaveiro" required />
        <Input label="Categoria" name="category" placeholder="keychain" required />
        <Input label="Variante" name="variantName" placeholder="Redondo 4,5 cm" required />
        <Input label="SKU" name="sku" placeholder="CHAVEIRO-45" />
        <Input label="Custo unitario" name="unitCost" required step="0.0001" type="number" />
        <Input label="Peso unitario kg" name="unitWeightKg" required step="0.000001" type="number" />
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">Descricao</span>
        <textarea className="focus-ring min-h-20 w-full rounded-md border border-zinc-700 px-3 py-2" name="description" />
      </label>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-zinc-300">Ancoragens de preco</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {ANCHORS.map((quantity) => (
            <Input
              key={quantity}
              label={`q=${quantity}`}
              min="0"
              name={`anchor_${quantity}`}
              required
              step="0.0001"
              type="number"
            />
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button
        className="focus-ring mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        {loading ? "Criando..." : "Criar produto"}
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
  step,
  min
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        min={min}
        name={name}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
      />
    </label>
  );
}
