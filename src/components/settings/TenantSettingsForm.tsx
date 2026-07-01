"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Save } from "lucide-react";
import { fetchCepAddress, formatCep, normalizeCep } from "@/lib/cep";
import type { TenantShippingProfile } from "@/repositories/tenant-settings";

export function TenantSettingsForm({ tenant }: { tenant: TenantShippingProfile }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [cepMessage, setCepMessage] = useState("");
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url ?? "");
  const [postalCode, setPostalCode] = useState(tenant.postal_code ?? "");
  const [addressLine, setAddressLine] = useState(tenant.address_line ?? "");
  const [district, setDistrict] = useState(tenant.district ?? "");
  const [city, setCity] = useState(tenant.city ?? "");
  const [state, setState] = useState(tenant.state ?? "");
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
        logoUrl,
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

  function uploadLogo(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Envie um arquivo de imagem para o logo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  return (
    <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={onSubmit}>
      <div className="mb-5 flex items-center gap-2">
        <Save className="text-amber-400" size={18} />
        <h2 className="font-semibold">Dados do tenant e remetente</h2>
      </div>
      <div className="grid gap-5">
        <section className="grid gap-4 md:grid-cols-2">
          <Input defaultValue={tenant.name} label="Nome da empresa" name="name" required />
          <Input defaultValue={tenant.company_document} label="CPF/CNPJ" name="companyDocument" />
          <Input defaultValue={tenant.company_phone} label="Telefone" name="companyPhone" />
          <Input defaultValue={tenant.company_site} label="Site" name="companySite" type="url" />
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImageUp className="text-amber-400" size={16} />
            <h3 className="text-sm font-semibold text-zinc-300">Logo</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-[120px_1fr]">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Logo do tenant" className="max-h-full max-w-full object-contain" src={logoUrl} />
              ) : (
                <span className="px-2 text-center text-xs text-zinc-600">Sem logo</span>
              )}
            </div>
            <div className="grid gap-3">
              <Input label="Logo URL" name="logoUrlPreview" type="url" value={logoUrl} onChange={setLogoUrl} />
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Upload do logo</span>
                <input
                  accept="image/*"
                  className="focus-ring w-full min-w-0 rounded-md border border-zinc-700 px-3 py-2 text-sm"
                  type="file"
                  onChange={(event) => uploadLogo(event.target.files?.[0] ?? null)}
                />
              </label>
              <p className="text-xs text-zinc-500">O upload salva o logo como data URL no cadastro do tenant.</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">Endereço do remetente</h3>
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <Input label="CEP de origem" name="postalCode" value={postalCode} onBlur={lookupCep} onChange={(value) => setPostalCode(formatCep(value))} />
            </div>
            <div className="md:col-span-4">
              <Input label="Endereço" name="addressLine" value={addressLine} onChange={setAddressLine} />
            </div>
            <div className="md:col-span-2">
              <Input defaultValue={tenant.address_number} label="Número" name="addressNumber" />
            </div>
            <div className="md:col-span-4">
              <Input defaultValue={tenant.address_complement} label="Complemento" name="addressComplement" />
            </div>
            <div className="md:col-span-3">
              <Input label="Bairro" name="district" value={district} onChange={setDistrict} />
            </div>
            <div className="md:col-span-2">
              <Input label="Cidade" name="city" value={city} onChange={setCity} />
            </div>
            <div className="md:col-span-1">
              <Input label="UF" maxLength={2} name="state" value={state} onChange={(value) => setState(value.toUpperCase())} />
            </div>
          </div>
          {cepMessage ? <p className="mt-3 text-xs text-zinc-400">{cepMessage}</p> : null}
        </section>
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
  maxLength,
  onBlur,
  onChange,
  value
}: {
  defaultValue?: string | null;
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  value?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full min-w-0 rounded-md border border-zinc-700 px-3 py-2"
        defaultValue={defaultValue ?? ""}
        maxLength={maxLength}
        name={name}
        onBlur={onBlur}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
