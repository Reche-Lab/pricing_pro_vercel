"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, MapPin, Pencil, Unlink, X } from "lucide-react";
import { fetchCepAddress, formatCep, normalizeCep } from "@/lib/cep";
import type { QuoteDetail } from "@/repositories/quotes";

export function QuoteCustomerDeliveryModal({ quote, disabled = false }: { quote: QuoteDetail; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [postalCode, setPostalCode] = useState(formatCep(quote.customer_postal_code ?? ""));
  const [addressLine, setAddressLine] = useState(quote.customer_address_line ?? "");
  const [district, setDistrict] = useState(quote.customer_district ?? "");
  const [city, setCity] = useState(quote.customer_city ?? "");
  const [state, setState] = useState(quote.customer_state ?? "");

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    function openFromShippingValidation() {
      setError("");
      setMessage("Complete os dados indicados para continuar com a etiqueta.");
      setOpen(true);
    }
    window.addEventListener("quote-customer-delivery:open", openFromShippingValidation);
    return () => window.removeEventListener("quote-customer-delivery:open", openFromShippingValidation);
  }, []);

  async function lookupCep() {
    const cep = normalizeCep(postalCode);
    if (cep.length !== 8) return;
    setMessage("Buscando endereço pelo CEP...");
    const address = await fetchCepAddress(cep).catch(() => null);
    if (!address) {
      setMessage("CEP não encontrado. Preencha o endereço manualmente.");
      return;
    }
    setPostalCode(address.cep);
    setAddressLine(address.street);
    setDistrict(address.district);
    setCity(address.city);
    setState(address.state);
    setMessage("Endereço preenchido. Confira o número e o complemento.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/quotes/${quote.id}/customer-delivery`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        document: form.get("document"),
        email: form.get("email"),
        phone: form.get("phone"),
        postalCode,
        addressLine,
        addressNumber: form.get("addressNumber"),
        addressComplement: form.get("addressComplement"),
        district,
        city,
        state,
        attentionTo: form.get("attentionTo")
      })
    });
    const data = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok || !data?.ok) {
      const fieldMessages = data?.fields && typeof data.fields === "object"
        ? Object.values(data.fields).flat().filter(Boolean).join(" ")
        : "";
      setError(fieldMessages || data?.error || "Não foi possível atualizar os dados do cliente.");
      return;
    }

    setMessage("Dados de entrega atualizados.");
    router.refresh();
    window.setTimeout(() => setOpen(false), 500);
  }

  return (
    <>
      <button
        className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        title={disabled ? "Reabra administrativamente o orçamento para editar os dados." : "Editar dados do cliente e entrega"}
        onClick={() => {
          setError("");
          setMessage("");
          setOpen(true);
        }}
        type="button"
      >
        <Pencil size={14} />
        Editar dados
      </button>

      {open ? (
        <div
          aria-labelledby="customer-delivery-title"
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-black/75 p-0 backdrop-blur-sm sm:p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
          role="dialog"
        >
          <form
            className="flex h-dvh w-full max-w-3xl flex-col overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50 sm:h-auto sm:max-h-[92dvh] sm:rounded-lg"
            onSubmit={submit}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 p-4 sm:gap-4 sm:p-5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white" id="customer-delivery-title">
                  Cliente e responsável pelo recebimento
                </h2>
                <p className="mt-1 text-sm leading-5 text-zinc-500">
                  Estes dados serão usados no orçamento, no pedido e na etiqueta de envio.
                </p>
              </div>
              <button
                aria-label="Fechar"
                className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={17} />
              </button>
            </header>

            <div className="grid min-h-0 gap-4 overflow-y-auto overflow-x-hidden p-4 sm:gap-5 sm:p-5">
              <div className={`flex items-start gap-3 rounded-md border px-3 py-3 ${
                quote.customer_external_olist_id
                  ? "border-emerald-400/20 bg-emerald-400/10"
                  : "border-zinc-800 bg-zinc-900/60"
              }`}>
                {quote.customer_external_olist_id ? (
                  <Link2 className="mt-0.5 shrink-0 text-emerald-300" size={17} />
                ) : (
                  <Unlink className="mt-0.5 shrink-0 text-zinc-500" size={17} />
                )}
                <div>
                  <p className="text-sm font-medium text-white">
                    {quote.customer_external_olist_id ? "Cliente vinculado ao Olist" : "Cliente ainda não vinculado ao Olist"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    {quote.customer_external_olist_id
                      ? `ID Olist ${quote.customer_external_olist_id}. A edição abaixo atualiza o cadastro local; o vínculo será preservado.`
                      : "Você pode completar os dados agora e vincular ou criar o cliente no Olist pelas ações do orçamento."}
                  </p>
                </div>
              </div>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input defaultValue={quote.customer_name} label="Nome ou razão social" name="name" required />
                </div>
                <Input defaultValue={quote.customer_document} label="CPF/CNPJ" name="document" />
                <Input
                  defaultValue={quote.customer_phone}
                  label="Telefone com DDD"
                  name="phone"
                  placeholder="(11) 99999-9999"
                />
                <div className="sm:col-span-2">
                  <Input defaultValue={quote.customer_email} label="E-mail" name="email" type="email" />
                </div>
              </section>

              <section className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 shrink-0 text-cyan-300" size={17} />
                  <div>
                    <h3 className="text-sm font-semibold text-cyan-50">Entrega e recebimento</h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      “Aos cuidados de” identifica a pessoa ou setor que deverá receber, sem substituir o cliente fiscal.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-6">
                  <div className="sm:col-span-3">
                    <Input
                      defaultValue={quote.delivery_attention_to}
                      label="Aos cuidados de"
                      name="attentionTo"
                      placeholder="Ex.: Marina - Marketing"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <ControlledInput
                      label="CEP"
                      name="postalCode"
                      onBlur={lookupCep}
                      onChange={(value) => setPostalCode(formatCep(value))}
                      value={postalCode}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <ControlledInput label="Endereço" name="addressLine" onChange={setAddressLine} value={addressLine} />
                  </div>
                  <div className="sm:col-span-2">
                    <Input defaultValue={quote.customer_address_number} label="Número" name="addressNumber" />
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      defaultValue={quote.customer_address_complement}
                      label="Complemento"
                      name="addressComplement"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <ControlledInput label="Bairro" name="district" onChange={setDistrict} value={district} />
                  </div>
                  <div className="sm:col-span-4">
                    <ControlledInput label="Cidade" name="city" onChange={setCity} value={city} />
                  </div>
                  <div className="sm:col-span-2">
                    <ControlledInput
                      label="UF"
                      maxLength={2}
                      name="state"
                      onChange={(value) => setState(value.toUpperCase())}
                      value={state}
                    />
                  </div>
                </div>
              </section>

              {error ? (
                <p className="rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                  <CheckCircle2 size={16} />
                  {message}
                </p>
              ) : null}
            </div>

            <footer className="flex shrink-0 justify-end gap-3 border-t border-zinc-800 p-4">
              <button
                className="focus-ring min-h-10 rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="focus-ring min-h-10 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-200 disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? "Salvando..." : "Salvar dados de entrega"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

function Input({
  defaultValue,
  label,
  name,
  placeholder,
  required,
  type = "text"
}: {
  defaultValue?: string | null;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring h-10 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
        defaultValue={defaultValue ?? ""}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function ControlledInput({
  label,
  maxLength,
  name,
  onBlur,
  onChange,
  value
}: {
  label: string;
  maxLength?: number;
  name: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring h-10 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
        maxLength={maxLength}
        name={name}
        onBlur={onBlur}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
    </label>
  );
}
