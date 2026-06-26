"use client";

import { useMemo, useState } from "react";
import { Calculator, FileText } from "lucide-react";
import { calculateQuote } from "@/domain/pricing/pricing";
import type { DemoProductVariant, platformPresets } from "@/domain/pricing/defaults";
import type { PlatformRule } from "@/domain/pricing/types";

type PricingCalculatorProps = {
  variants: DemoProductVariant[];
  platforms: typeof platformPresets;
  readonlyMode?: boolean;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function PricingCalculator({ variants, platforms, readonlyMode = false }: PricingCalculatorProps) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(100);
  const [platformKey, setPlatformKey] = useState(Object.keys(platforms)[0] ?? "direct");

  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const platform: PlatformRule = platforms[platformKey] ?? platforms.direct;

  const result = useMemo(() => {
    if (!variant) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      anchors: variant.anchors,
      platform
    });
  }, [platform, quantity, variant]);

  if (!variant || !result) {
    return <div className="rounded-lg border border-zinc-200 bg-white p-6">Nenhum produto disponivel.</div>;
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="mb-5 flex items-center gap-2">
          <Calculator className="text-brand" size={20} />
          <h2 className="text-lg font-semibold">Precificador</h2>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Produto</span>
            <select
              className="focus-ring w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              {variants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.productName} - {item.variantName}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Quantidade</span>
            <input
              className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
              min={1}
              max={50000}
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Canal</span>
            <select
              className="focus-ring w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              value={platformKey}
              onChange={(event) => setPlatformKey(event.target.value)}
            >
              {Object.entries(platforms).map(([key, rule]) => (
                <option key={key} value={key}>
                  {key === "direct" ? "Venda direta" : `Marketplace (${(rule.commissionRate * 100).toFixed(0)}%)`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Preco unitario" value={brl.format(result.finalUnitPrice)} />
        <Metric label="Total" value={brl.format(result.subtotal)} />
        <Metric label="Custo total" value={brl.format(result.totalCost)} />
        <Metric label="Margem" value={`${result.marginPercent.toFixed(1)}%`} />

        <div className="rounded-lg border border-zinc-200 bg-white p-5 sm:col-span-2 xl:col-span-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="text-brand" size={18} />
            <h3 className="font-semibold">Resumo do calculo</h3>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Base unit." value={brl.format(result.baseUnitPrice)} />
            <Detail label="Comissao" value={brl.format(result.commissionTotal)} />
            <Detail label="Taxa fixa" value={brl.format(result.fixedFeeTotal)} />
            <Detail label="Frete vendedor" value={brl.format(result.sellerShippingTotal)} />
            <Detail label="Custo mercadoria" value={brl.format(result.costOfGoodsTotal)} />
            <Detail label="Lucro liquido" value={brl.format(result.profit)} />
          </dl>
          {readonlyMode ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Demo com dados ficticios. Os custos e curvas reais ficam protegidos apos login.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-950">{value}</dd>
    </div>
  );
}
