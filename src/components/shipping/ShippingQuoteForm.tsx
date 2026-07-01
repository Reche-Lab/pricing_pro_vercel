"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { fetchCepAddress, formatCep, normalizeCep, type CepAddress } from "@/lib/cep";

type ShippingVariant = {
  id: string;
  label: string;
};

type ShippingQuoteFormProps = {
  defaultOriginPostalCode?: string;
  variants: ShippingVariant[];
};

type QuoteResponse = {
  result: {
    totalFrete: number;
  };
  packaging: {
    boxesNeeded: number;
    netWeightKg: number;
    grossWeightKg: number;
    grossWeightPerBoxKg: number;
    box: {
      name: string;
      heightCm: number;
      widthCm: number;
      lengthCm: number;
    };
  };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ShippingQuoteForm({ defaultOriginPostalCode = "", variants }: ShippingQuoteFormProps) {
  const [error, setError] = useState("");
  const [originPostalCode, setOriginPostalCode] = useState(formatCep(defaultOriginPostalCode));
  const [destinationPostalCode, setDestinationPostalCode] = useState("");
  const [originAddress, setOriginAddress] = useState<CepAddress | null>(null);
  const [destinationAddress, setDestinationAddress] = useState<CepAddress | null>(null);
  const [cepMessage, setCepMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setQuote(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/shipping/correios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productVariantId: form.get("productVariantId"),
        quantity: Number(form.get("quantity")),
        service: form.get("service"),
        originPostalCode,
        destinationPostalCode,
        declaredValue: Number(form.get("declaredValue") || 0)
      })
    });

    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setError(data?.error ?? "Nao foi possivel cotar o frete.");
      return;
    }

    setQuote(data as QuoteResponse);
  }

  async function lookupCep(kind: "origin" | "destination") {
    const value = kind === "origin" ? originPostalCode : destinationPostalCode;
    const digits = normalizeCep(value);
    if (digits.length !== 8) return;

    setCepMessage(kind === "origin" ? "Buscando endereço de origem..." : "Buscando endereço de destino...");
    const address = await fetchCepAddress(digits).catch(() => null);
    if (!address) {
      setCepMessage("CEP não encontrado. Confira o número informado.");
      if (kind === "origin") setOriginAddress(null);
      else setDestinationAddress(null);
      return;
    }

    if (kind === "origin") {
      setOriginPostalCode(address.cep);
      setOriginAddress(address);
    } else {
      setDestinationPostalCode(address.cep);
      setDestinationAddress(address);
    }
    setCepMessage("Endereço preenchido pelo CEP.");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[460px_1fr]">
      <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={onSubmit}>
        <div className="mb-4 flex items-center gap-2">
          <Truck className="text-amber-400" size={18} />
          <h2 className="font-semibold">Cotar Correios</h2>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Produto</span>
            <select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2" name="productVariantId" required>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <Input defaultValue="100" label="Quantidade" name="quantity" type="number" />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-300">Serviço</span>
              <select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2" name="service" required>
                <option value="sedex">SEDEX</option>
                <option value="pac">PAC</option>
              </select>
            </label>
            <Input
              label="CEP origem"
              name="originPostalCode"
              placeholder="00000-000"
              value={originPostalCode}
              onBlur={() => lookupCep("origin")}
              onChange={(value) => {
                setOriginPostalCode(formatCep(value));
                setOriginAddress(null);
              }}
            />
            <Input
              label="CEP destino"
              name="destinationPostalCode"
              placeholder="00000-000"
              value={destinationPostalCode}
              onBlur={() => lookupCep("destination")}
              onChange={(value) => {
                setDestinationPostalCode(formatCep(value));
                setDestinationAddress(null);
              }}
            />
            <Input defaultValue="0" label="Valor declarado" name="declaredValue" step="0.01" type="number" />
          </div>
          {cepMessage ? <p className="text-xs text-zinc-500">{cepMessage}</p> : null}
          <div className="grid gap-2 md:grid-cols-2">
            <CepPreview label="Origem" address={originAddress} />
            <CepPreview label="Destino" address={destinationAddress} />
          </div>
        </div>
        {error ? <p className="mt-4 rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <button
          className="focus-ring mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          disabled={loading || variants.length === 0}
          type="submit"
        >
          {loading ? "Cotando..." : "Cotar frete"}
        </button>
      </form>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
        <h2 className="font-semibold">Resultado</h2>
        {!quote ? (
          <p className="mt-2 text-sm text-zinc-500">Faça uma cotação para ver frete, caixa e peso.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Metric label="Frete" value={brl.format(quote.result.totalFrete)} />
            <Metric label="Caixas" value={String(quote.packaging.boxesNeeded)} />
            <Metric label="Peso líquido" value={`${quote.packaging.netWeightKg.toFixed(3)} kg`} />
            <Metric label="Peso bruto" value={`${quote.packaging.grossWeightKg.toFixed(3)} kg`} />
            <div className="rounded-md bg-zinc-950/60 p-3 md:col-span-2">
              <p className="text-sm text-zinc-500">Embalagem</p>
              <p className="font-medium text-white">
                {quote.packaging.box.name} - {quote.packaging.box.heightCm} x {quote.packaging.box.widthCm} x{" "}
                {quote.packaging.box.lengthCm} cm
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Input({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  onBlur,
  onChange,
  step,
  value
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  step?: string;
  value?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        defaultValue={defaultValue}
        min={type === "number" ? 0 : undefined}
        name={name}
        onBlur={onBlur}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        required
        step={step}
        type={type}
        value={value}
      />
    </label>
  );
}

function CepPreview({ address, label }: { address: CepAddress | null; label: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      {address ? (
        <p className="mt-1 text-sm text-zinc-300">
          {[address.street, address.district, address.city, address.state, address.cep].filter(Boolean).join(" - ")}
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-600">Informe um CEP válido para preencher automaticamente.</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-950/60 p-3">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
