"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import type { PricingCurveMode, PricingCurvePoint } from "@/domain/pricing/types";

const ANCHORS = [1, 10, 50, 100, 500, 1000] as const;
const initialPoints = ANCHORS.map((quantity) => ({ quantity, unitPrice: 0 }));

export function ProductForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [curveMode, setCurveMode] = useState<PricingCurveMode>("interpolated");
  const [points, setPoints] = useState<PricingCurvePoint[]>(initialPoints);

  function updatePoint(index: number, field: keyof PricingCurvePoint, value: number) {
    setPoints((current) =>
      current.map((point, pointIndex) =>
        pointIndex === index
          ? { ...point, [field]: field === "quantity" ? Math.max(1, Math.trunc(value)) : Math.max(0, value) }
          : point
      )
    );
  }

  function addPoint() {
    setPoints((current) => {
      const sorted = [...current].sort((a, b) => a.quantity - b.quantity);
      const last = sorted[sorted.length - 1] ?? { quantity: 1, unitPrice: 0 };
      return [...sorted, { quantity: last.quantity + 100, unitPrice: last.unitPrice }];
    });
  }

  function removePoint(index: number) {
    setPoints((current) => current.filter((_, pointIndex) => pointIndex !== index));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setLoading(true);

    const form = new FormData(formElement);
    const curvePoints = points
      .map((point) => ({
        quantity: Math.max(1, Math.trunc(point.quantity)),
        unitPrice: Math.max(0, point.unitPrice)
      }))
      .sort((a, b) => a.quantity - b.quantity);

    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productName: form.get("productName"),
        category: form.get("category"),
        description: form.get("description"),
        variantName: form.get("variantName"),
        sku: form.get("sku"),
        externalOlistProductId: form.get("externalOlistProductId"),
        unitCost: Number(form.get("unitCost")),
        unitWeightKg: Number(form.get("unitWeightKg")),
        heightCm: Number(form.get("heightCm") || 0) || null,
        widthCm: Number(form.get("widthCm") || 0) || null,
        lengthCm: Number(form.get("lengthCm") || 0) || null,
        curve: {
          mode: curveMode,
          points: curvePoints
        }
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel criar o produto. Verifique se ja existe uma variante com esse nome.");
      return;
    }

    formElement.reset();
    setCurveMode("interpolated");
    setPoints(initialPoints);
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
        <Input label="ID produto Olist" name="externalOlistProductId" placeholder="123456789" />
        <Input label="Custo unitario" name="unitCost" required step="0.0001" type="number" />
        <Input label="Peso unitário kg (frete)" name="unitWeightKg" required step="0.000001" type="number" />
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
        <p className="text-sm font-medium text-zinc-300">Medidas unitárias para embalagem</p>
        <p className="mt-1 text-xs text-zinc-500">
          Use as dimensões aproximadas do produto pronto. O sistema combina essas medidas com o peso unitário para
          escolher a menor caixa compatível e calcular o peso líquido do envio.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Input label="Altura cm" name="heightCm" step="0.001" type="number" />
          <Input label="Largura cm" name="widthCm" step="0.001" type="number" />
          <Input label="Comprimento cm" name="lengthCm" step="0.001" type="number" />
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">Descricao</span>
        <textarea className="focus-ring min-h-20 w-full rounded-md border border-zinc-700 px-3 py-2" name="description" />
      </label>

      <div className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-300">Ancoragens de preco</p>
            <p className="text-xs text-zinc-500">Defina quantos pontos quiser para a curva inicial do produto.</p>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 p-1">
            <button
              className={`rounded px-3 py-1.5 text-xs font-medium ${curveMode === "interpolated" ? "bg-amber-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}
              type="button"
              onClick={() => setCurveMode("interpolated")}
            >
              Curva
            </button>
            <button
              className={`rounded px-3 py-1.5 text-xs font-medium ${curveMode === "step" ? "bg-amber-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}
              type="button"
              onClick={() => setCurveMode("step")}
            >
              Faixa fixa
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          {points.map((point, index) => (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2" key={`${point.quantity}-${index}`}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Quantidade</span>
                <input
                  className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
                  min={1}
                  required
                  step="1"
                  type="number"
                  value={point.quantity}
                  onChange={(event) => updatePoint(index, "quantity", Number(event.target.value))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Preco unitario</span>
                <input
                  className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
                  min={0}
                  required
                  step="0.0001"
                  type="number"
                  value={point.unitPrice}
                  onChange={(event) => updatePoint(index, "unitPrice", Number(event.target.value))}
                />
              </label>
              <button
                className="focus-ring mt-7 inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={points.length <= 1}
                title="Remover ancora"
                type="button"
                onClick={() => removePoint(index)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="focus-ring mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60"
          type="button"
          onClick={addPoint}
        >
          <Plus size={15} />
          Adicionar ancora
        </button>
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
        className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
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
