"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import type { PricingCurveMode, PricingCurvePoint } from "@/domain/pricing/types";

const ANCHORS = [1, 10, 50, 100, 500, 1000] as const;

type AnchorEditorProps = {
  variantId: string;
  anchors: Record<string, number> | null;
  mode?: PricingCurveMode | null;
  platforms?: Array<{ id: string; name: string }>;
};

export function AnchorEditor({ variantId, anchors, mode = "interpolated", platforms = [] }: AnchorEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [curveMode, setCurveMode] = useState<PricingCurveMode>(mode ?? "interpolated");
  const [platformRuleId, setPlatformRuleId] = useState("");
  const [points, setPoints] = useState<PricingCurvePoint[]>(() => mapAnchorsToPoints(anchors));

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
    setError("");
    setLoading(true);

    const response = await fetch(`/api/products/${variantId}/curve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        curve: {
          mode: curveMode,
          platformRuleId: platformRuleId || null,
          points: points
            .map((point) => ({ quantity: Math.max(1, Math.trunc(point.quantity)), unitPrice: Math.max(0, point.unitPrice) }))
            .sort((a, b) => a.quantity - b.quantity)
        }
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel atualizar a curva.");
      return;
    }

    router.refresh();
  }

  return (
    <form className="grid gap-2" onSubmit={onSubmit}>
      <div className="grid gap-2 md:grid-cols-[1fr_220px]">
        <div className="inline-flex w-fit overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 p-1">
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
        {platforms.length > 0 ? (
          <select
            className="focus-ring h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
            value={platformRuleId}
            onChange={(event) => setPlatformRuleId(event.target.value)}
          >
            <option value="">Padrao do produto</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="grid gap-2">
        {points.map((point, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2" key={`${point.quantity}-${index}`}>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Quantidade</span>
              <input
                className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-white"
                min={1}
                required
                step="1"
                type="number"
                value={point.quantity}
                onChange={(event) => updatePoint(index, "quantity", Number(event.target.value))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Preco</span>
              <input
                className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-white"
                min={0}
                required
                step="0.0001"
                type="number"
                value={point.unitPrice}
                onChange={(event) => updatePoint(index, "unitPrice", Number(event.target.value))}
              />
            </label>
            <button
              className="focus-ring mt-5 inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
              disabled={points.length <= 1}
              type="button"
              onClick={() => removePoint(index)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60"
          type="button"
          onClick={addPoint}
        >
          <Plus size={15} />
          Adicionar ponto
        </button>
        <button
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          <Save size={15} />
          {loading ? "Salvando..." : "Salvar curva"}
        </button>
      </div>
    </form>
  );
}

function mapAnchorsToPoints(anchors: Record<string, number> | null): PricingCurvePoint[] {
  const entries = Object.entries(anchors ?? {});
  if (entries.length === 0) {
    return ANCHORS.map((quantity) => ({ quantity, unitPrice: 0 }));
  }

  return entries
    .map(([quantity, unitPrice]) => ({ quantity: Number(quantity), unitPrice: Number(unitPrice) }))
    .sort((a, b) => a.quantity - b.quantity);
}
