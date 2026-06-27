"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

const ANCHORS = [1, 10, 50, 100, 500, 1000] as const;

type AnchorEditorProps = {
  variantId: string;
  anchors: Record<string, number> | null;
};

export function AnchorEditor({ variantId, anchors }: AnchorEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      ANCHORS.map((quantity) => [quantity, Number(form.get(`anchor_${quantity}`))])
    );

    const response = await fetch(`/api/products/${variantId}/curve`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anchors: payload })
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
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {ANCHORS.map((quantity) => (
          <label className="block" key={quantity}>
            <span className="mb-1 block text-xs text-zinc-500">q={quantity}</span>
            <input
              className="focus-ring w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
              defaultValue={Number(anchors?.[String(quantity)] ?? 0).toFixed(2)}
              min={0}
              name={`anchor_${quantity}`}
              required
              step="0.0001"
              type="number"
            />
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        <Save size={15} />
        {loading ? "Salvando..." : "Salvar curva"}
      </button>
    </form>
  );
}
