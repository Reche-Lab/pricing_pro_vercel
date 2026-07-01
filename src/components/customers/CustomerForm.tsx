"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { fetchCepAddress, formatCep, normalizeCep } from "@/lib/cep";

export function CustomerForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [cepMessage, setCepMessage] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setLoading(true);

    const form = new FormData(formElement);
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

    formElement.reset();
    setPostalCode("");
    setAddressLine("");
    setDistrict("");
    setCity("");
    setState("");
    setCepMessage("");
    router.refresh();
  }

  async function lookupCep() {
    const digits = normalizeCep(postalCode);
    if (digits.length !== 8) return;

    setCepMessage("Buscando endereço pelo CEP...");
    const address = await fetchCepAddress(digits).catch(() => null);
    if (!address) {
      setCepMessage("CEP não encontrado. Preencha o endereço manualmente.");
      return;
    }

    setPostalCode(address.cep);
    setAddressLine(address.street);
    setDistrict(address.district);
    setCity(address.city);
    setState(address.state);
    setCepMessage("Endereço preenchido automaticamente.");
  }

  return (
    <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2">
        <UserPlus className="text-amber-400" size={18} />
        <h2 className="font-semibold">Novo cliente</h2>
      </div>
      <div className="grid gap-5">
        <section className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Input label="Nome" name="name" required />
          </div>
          <Input label="CPF/CNPJ" name="document" />
          <Input label="Telefone" name="phone" />
          <div className="md:col-span-2">
            <Input label="Email" name="email" type="email" />
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">Endereço</h3>
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <Input
                label="CEP"
                name="postalCode"
                value={postalCode}
                onBlur={lookupCep}
                onChange={(value) => setPostalCode(formatCep(value))}
              />
            </div>
            <div className="md:col-span-4">
              <Input label="Endereço" name="addressLine" value={addressLine} onChange={setAddressLine} />
            </div>
            <div className="md:col-span-2">
              <Input label="Número" name="addressNumber" />
            </div>
            <div className="md:col-span-4">
              <Input label="Complemento" name="addressComplement" placeholder="Apto, bloco, sala ou referência" />
            </div>
            <div className="md:col-span-3">
              <Input label="Bairro" name="district" value={district} onChange={setDistrict} />
            </div>
            <div className="md:col-span-2">
              <Input label="Cidade" name="city" value={city} onChange={setCity} />
            </div>
            <div className="md:col-span-1">
              <Input label="UF" name="state" maxLength={2} value={state} onChange={(value) => setState(value.toUpperCase())} />
            </div>
          </div>
          {cepMessage ? <p className="mt-3 text-xs text-zinc-400">{cepMessage}</p> : null}
        </section>
      </div>
      {error ? <p className="mt-4 rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
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
  maxLength,
  onBlur,
  onChange,
  placeholder,
  value
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  value?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full min-w-0 rounded-md border border-zinc-700 px-3 py-2"
        maxLength={maxLength}
        name={name}
        onBlur={onBlur}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
