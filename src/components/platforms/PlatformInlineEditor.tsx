"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

type PlatformInlineEditorProps = {
  platform: {
    id: string;
    name: string;
    commissionRate: number;
    fixedFee: number;
    sellerShippingCost: number;
    sellerShippingThreshold: number;
  };
};

export function PlatformInlineEditor({ platform }: PlatformInlineEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/platforms/${platform.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        commissionRate: Number(form.get("commissionRate")) / 100,
        fixedFee: Number(form.get("fixedFee")),
        sellerShippingCost: Number(form.get("sellerShippingCost")),
        sellerShippingThreshold: Number(form.get("sellerShippingThreshold"))
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel atualizar o canal.");
      return;
    }

    router.refresh();
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-5">
        <Input defaultValue={platform.name} label="Nome" name="name" />
        <Input defaultValue={(platform.commissionRate * 100).toFixed(2)} label="Comissao %" name="commissionRate" />
        <Input defaultValue={platform.fixedFee.toFixed(2)} label="Taxa" name="fixedFee" />
        <Input defaultValue={platform.sellerShippingCost.toFixed(2)} label="Frete" name="sellerShippingCost" />
        <Input defaultValue={platform.sellerShippingThreshold.toFixed(2)} label="Limite" name="sellerShippingThreshold" />
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        <Save size={15} />
        {loading ? "Salvando..." : "Salvar canal"}
      </button>
    </form>
  );
}

function Input({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
        defaultValue={defaultValue}
        min={name === "name" ? undefined : 0}
        name={name}
        required
        step={name === "name" ? undefined : "0.01"}
        type={name === "name" ? "text" : "number"}
      />
    </label>
  );
}
