"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

export function CustomerForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        document: form.get("document"),
        email: form.get("email"),
        phone: form.get("phone"),
        postalCode: form.get("postalCode"),
        addressLine: form.get("addressLine"),
        addressNumber: form.get("addressNumber"),
        addressComplement: form.get("addressComplement"),
        district: form.get("district"),
        city: form.get("city"),
        state: form.get("state")
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel salvar o cliente. Verifique os campos.");
      return;
    }

    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-zinc-200 bg-white p-5" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2">
        <UserPlus className="text-brand" size={18} />
        <h2 className="font-semibold">Novo cliente</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Nome" name="name" required />
        <Input label="CPF/CNPJ" name="document" />
        <Input label="Email" name="email" type="email" />
        <Input label="Telefone" name="phone" />
        <Input label="CEP" name="postalCode" />
        <Input label="Endereco" name="addressLine" />
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Input label="Numero" name="addressNumber" />
          <Input label="Complemento" name="addressComplement" />
        </div>
        <Input label="Bairro" name="district" />
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Input label="Cidade" name="city" />
          <Input label="UF" name="state" maxLength={2} />
        </div>
      </div>
      {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button
        className="focus-ring mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        {loading ? "Salvando..." : "Salvar cliente"}
      </button>
    </form>
  );
}

function Input({
  label,
  name,
  type = "text",
  required = false,
  maxLength
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
        maxLength={maxLength}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}
