"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save } from "lucide-react";

type ProductEditValues = {
  productName: string;
  category: string;
  description: string | null;
  productActive: boolean;
  variantId: string;
  variantName: string;
  sku: string | null;
  unitCost: string;
  unitWeightKg: string;
  heightCm: string | null;
  widthCm: string | null;
  lengthCm: string | null;
  variantActive: boolean;
};

export function ProductEditForm({ product }: { product: ProductEditValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setLoading(true);

    const response = await fetch(`/api/products/${product.variantId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productName: form.get("productName"),
        category: form.get("category"),
        description: form.get("description"),
        productActive: form.get("productActive") === "on",
        variantName: form.get("variantName"),
        sku: form.get("sku"),
        unitCost: Number(form.get("unitCost")),
        unitWeightKg: Number(form.get("unitWeightKg")),
        heightCm: optionalNumber(form.get("heightCm")),
        widthCm: optionalNumber(form.get("widthCm")),
        lengthCm: optionalNumber(form.get("lengthCm")),
        variantActive: form.get("variantActive") === "on"
      })
    });

    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Não foi possível atualizar o produto.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50">
      <button
        className="focus-ring flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-900/70"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          <Pencil size={15} />
          Editar dados do produto
        </span>
        <span className="text-xs text-zinc-500">{open ? "Recolher" : "Abrir"}</span>
      </button>

      {open ? (
        <form className="grid gap-4 border-t border-zinc-800 p-3" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input defaultValue={product.productName} label="Produto" name="productName" required />
            <Input defaultValue={product.category} label="Categoria" name="category" required />
            <Input defaultValue={product.variantName} label="Variante" name="variantName" required />
            <Input defaultValue={product.sku ?? ""} label="SKU" name="sku" />
            <Input defaultValue={product.unitCost} label="Custo unitário" name="unitCost" required step="0.0001" type="number" />
            <Input
              defaultValue={product.unitWeightKg}
              label="Peso unitário kg (frete)"
              name="unitWeightKg"
              required
              step="0.000001"
              type="number"
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">Descrição</span>
            <textarea
              className="focus-ring min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              defaultValue={product.description ?? ""}
              name="description"
            />
          </label>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-sm font-medium text-zinc-300">Medidas unitárias para embalagem</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Input defaultValue={product.heightCm ?? ""} label="Altura cm" name="heightCm" step="0.001" type="number" />
              <Input defaultValue={product.widthCm ?? ""} label="Largura cm" name="widthCm" step="0.001" type="number" />
              <Input defaultValue={product.lengthCm ?? ""} label="Comprimento cm" name="lengthCm" step="0.001" type="number" />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Checkbox defaultChecked={product.productActive} label="Produto ativo" name="productActive" />
            <Checkbox defaultChecked={product.variantActive} label="Variante ativa" name="variantActive" />
          </div>

          {error ? <p className="rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

          <button
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-300 disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            <Save size={15} />
            {loading ? "Salvando..." : "Salvar dados"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Input({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
  step
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        defaultValue={defaultValue}
        min={type === "number" ? "0" : undefined}
        name={name}
        required={required}
        step={step}
        type={type}
      />
    </label>
  );
}

function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
      <input className="h-4 w-4 accent-cyan-400" defaultChecked={defaultChecked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

function optionalNumber(value: FormDataEntryValue | null) {
  const numeric = Number(value || 0);
  return numeric > 0 ? numeric : null;
}
