"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Plus, Trash2 } from "lucide-react";

export type QuoteFormVariant = {
  id: string;
  label: string;
};

export type QuoteFormPlatform = {
  id: string;
  name: string;
};

export type QuoteFormCustomer = {
  id: string;
  name: string;
};

type QuoteFormProps = {
  variants: QuoteFormVariant[];
  platforms: QuoteFormPlatform[];
  customers: QuoteFormCustomer[];
};

export function QuoteForm({ variants, platforms, customers }: QuoteFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    customers.length > 0 ? "existing" : "new"
  );
  const [pricingRule, setPricingRule] = useState<"per_art_average" | "per_item" | "aggregate_total">("per_art_average");
  const [items, setItems] = useState([{ productVariantId: variants[0]?.id ?? "", artworkName: "Arte 1", quantity: 100 }]);

  function updateItem(index: number, field: "productVariantId" | "artworkName" | "quantity", value: string | number) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        productVariantId: current[current.length - 1]?.productVariantId ?? variants[0]?.id ?? "",
        artworkName: `Arte ${current.length + 1}`,
        quantity: 1
      }
    ]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setLoading(true);

    const form = new FormData(formElement);
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platformRuleId: form.get("platformRuleId"),
        pricingRule,
        items: items.map((item) => ({
          productVariantId: item.productVariantId,
          artworkName: item.artworkName,
          quantity: Number(item.quantity)
        })),
        customerId: customerMode === "existing" ? form.get("customerId") : null,
        customerName: customerMode === "new" ? form.get("customerName") : null,
        validDays: Number(form.get("validDays") || 7),
        notes: form.get("notes")
      })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Nao foi possivel criar o orcamento.");
      return;
    }

    formElement.reset();
    setItems([{ productVariantId: variants[0]?.id ?? "", artworkName: "Arte 1", quantity: 100 }]);
    setPricingRule("per_art_average");
    router.refresh();
  }

  return (
    <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2">
        <FilePlus2 className="text-amber-400" size={18} />
        <h2 className="font-semibold">Novo orcamento</h2>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Canal</span>
            <select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2" name="platformRuleId" required>
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Validade em dias</span>
            <input
              className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
              defaultValue={7}
              min={1}
              max={90}
              name="validDays"
              required
              type="number"
            />
          </label>
        </div>

        <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="mb-3 grid gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">Itens por produto e arte</p>
              <p className="text-xs text-zinc-500">
                Cada linha representa uma arte ou lote. O sistema calcula a quantidade de referencia conforme a regra escolhida.
              </p>
            </div>
            <div className="grid gap-2">
              <RuleButton
                active={pricingRule === "per_art_average"}
                description="Soma o mesmo produto, divide pelo numero de artes e usa essa quantidade para precificar."
                label="Por artes do mesmo produto"
                onClick={() => setPricingRule("per_art_average")}
              />
              <RuleButton
                active={pricingRule === "per_item"}
                description="Cada linha usa sua propria quantidade para buscar o preco."
                label="Por item individual"
                onClick={() => setPricingRule("per_item")}
              />
              <RuleButton
                active={pricingRule === "aggregate_total"}
                description="Soma o mesmo produto e usa o total como quantidade de referencia para todas as artes."
                label="Por total do mesmo produto"
                onClick={() => setPricingRule("aggregate_total")}
              />
            </div>
          </div>

          <div className="grid gap-3">
            {items.map((item, index) => (
              <div className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-3" key={index}>
                <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_120px_40px]">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Produto</span>
                    <select
                      className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                      required
                      value={item.productVariantId}
                      onChange={(event) => updateItem(index, "productVariantId", event.target.value)}
                    >
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Arte</span>
                    <input
                      className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                      placeholder="Nome da arte"
                      value={item.artworkName}
                      onChange={(event) => updateItem(index, "artworkName", event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Qtd</span>
                    <input
                      className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                      min={1}
                      required
                      type="number"
                      value={item.quantity}
                      onChange={(event) => updateItem(index, "quantity", Number(event.target.value))}
                    />
                  </label>
                  <button
                    className="focus-ring mt-5 inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
                    disabled={items.length <= 1}
                    title="Remover item"
                    type="button"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            type="button"
            onClick={addItem}
          >
            <Plus size={15} />
            Adicionar item/arte
          </button>
        </section>

        <div className="rounded-md border border-zinc-800 p-3">
          <div className="mb-3 flex gap-2 text-sm">
            <button
              className={`rounded-md px-3 py-2 ${customerMode === "existing" ? "bg-zinc-950 text-white" : "bg-zinc-800 text-zinc-300"}`}
              disabled={customers.length === 0}
              onClick={() => setCustomerMode("existing")}
              type="button"
            >
              Cliente existente
            </button>
            <button
              className={`rounded-md px-3 py-2 ${customerMode === "new" ? "bg-zinc-950 text-white" : "bg-zinc-800 text-zinc-300"}`}
              onClick={() => setCustomerMode("new")}
              type="button"
            >
              Novo cliente rapido
            </button>
          </div>
          {customerMode === "existing" ? (
            <select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2" name="customerId" required>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
              name="customerName"
              placeholder="Nome do cliente"
              required
            />
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-300">Observacoes</span>
          <textarea className="focus-ring min-h-24 w-full rounded-md border border-zinc-700 px-3 py-2" name="notes" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button
        className="focus-ring mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading || variants.length === 0 || platforms.length === 0}
        type="submit"
      >
        {loading ? "Criando..." : "Criar orcamento"}
      </button>
    </form>
  );
}

function RuleButton({
  active,
  description,
  label,
  onClick
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`focus-ring rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? "border-amber-400 bg-amber-400/10 text-amber-100"
          : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700"
      }`}
      type="button"
      onClick={onClick}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-1 block text-xs text-zinc-500">{description}</span>
    </button>
  );
}
