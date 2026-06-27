"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import type { TenantShippingProfile } from "@/repositories/tenant-settings";

export function TenantSettingsForm({ tenant }: { tenant: TenantShippingProfile }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/tenant", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        logoUrl: form.get("logoUrl"),
        companyPhone: form.get("companyPhone"),
        companySite: form.get("companySite"),
        companyDocument: form.get("companyDocument"),
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
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel salvar as configuracoes.");
      return;
    }

    setMessage("Configuracoes salvas.");
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={onSubmit}>
      <div className="mb-5 flex items-center gap-2">
        <Save className="text-amber-400" size={18} />
        <h2 className="font-semibold">Dados do tenant e remetente</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input defaultValue={tenant.name} label="Nome da empresa" name="name" required />
        <Input defaultValue={tenant.company_document} label="CPF/CNPJ" name="companyDocument" />
        <Input defaultValue={tenant.company_phone} label="Telefone" name="companyPhone" />
        <Input defaultValue={tenant.company_site} label="Site" name="companySite" type="url" />
        <Input defaultValue={tenant.logo_url} label="Logo URL" name="logoUrl" type="url" />
        <Input defaultValue={tenant.postal_code} label="CEP de origem" name="postalCode" />
        <Input defaultValue={tenant.address_line} label="Endereco" name="addressLine" />
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Input defaultValue={tenant.address_number} label="Numero" name="addressNumber" />
          <Input defaultValue={tenant.address_complement} label="Complemento" name="addressComplement" />
        </div>
        <Input defaultValue={tenant.district} label="Bairro" name="district" />
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Input defaultValue={tenant.city} label="Cidade" name="city" />
          <Input defaultValue={tenant.state} label="UF" maxLength={2} name="state" />
        </div>
      </div>
      {message ? <p className="mt-4 rounded-md bg-zinc-950/60 px-3 py-2 text-sm text-zinc-400">{message}</p> : null}
      <button
        className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        <Save size={16} />
        {loading ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

function Input({
  defaultValue,
  label,
  name,
  type = "text",
  required = false,
  maxLength
}: {
  defaultValue?: string | null;
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        defaultValue={defaultValue ?? ""}
        maxLength={maxLength}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}
