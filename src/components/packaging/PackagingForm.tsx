"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";

export function PackagingForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setLoading(true);

    const form = new FormData(formElement);
    const response = await fetch("/api/packaging", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        heightCm: Number(form.get("heightCm")),
        widthCm: Number(form.get("widthCm")),
        lengthCm: Number(form.get("lengthCm")),
        weightKg: Number(form.get("weightKg")),
        capacities: []
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel salvar a embalagem.");
      return;
    }

    formElement.reset();
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2">
        <Boxes className="text-amber-400" size={18} />
        <h2 className="font-semibold">Nova embalagem</h2>
      </div>
      <p className="mb-4 text-sm leading-6 text-zinc-400">
        Cadastre as caixas disponíveis. A capacidade por produto será calculada automaticamente com base nas medidas
        da caixa e nas medidas unitárias cadastradas em Produtos. O peso da caixa será somado ao peso dos produtos no
        cálculo do frete.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Nome" name="name" placeholder="4x11x17" required />
        <Input label="Peso da caixa kg (frete)" name="weightKg" required step="0.000001" type="number" />
        <Input label="Altura cm" name="heightCm" required step="0.001" type="number" />
        <Input label="Largura cm" name="widthCm" required step="0.001" type="number" />
        <Input label="Comprimento cm" name="lengthCm" required step="0.001" type="number" />
      </div>

      {error ? <p className="mt-4 rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button
        className="focus-ring mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        {loading ? "Salvando..." : "Salvar embalagem"}
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
        min={min ?? (type === "number" ? "0" : undefined)}
        name={name}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
      />
    </label>
  );
}
