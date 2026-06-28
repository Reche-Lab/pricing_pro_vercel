"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Calculator,
  CircleDollarSign,
  Clipboard,
  FileText,
  Truck,
  UserRound,
  RotateCcw,
  Save,
  TrendingUp
} from "lucide-react";
import {
  buildPricingSimulationSeries,
  calculateAnchoredUnitPrice,
  calculateQuote,
  comparePricingSimulationSeries,
  recomputeIntermediateAnchors
} from "@/domain/pricing/pricing";
import type { DemoProductVariant } from "@/domain/pricing/defaults";
import type { PlatformRule, PricingAnchors, PricingAnchorQuantity } from "@/domain/pricing/types";

export type PricingPlatformOption = PlatformRule & {
  name: string;
};

type PricingCalculatorProps = {
  variants: DemoProductVariant[];
  platforms: Record<string, PricingPlatformOption>;
  readonlyMode?: boolean;
};

type ChartPoint = {
  baseValue: number;
  finalValue: number;
  quantity: number;
  label: string;
  value: number;
  isAnchor?: boolean;
};

const ANCHOR_QUANTITIES = [1, 10, 50, 100, 500, 1000] as const;
const SIMULATION_QUANTITIES = [1, 10, 25, 50, 100, 250, 500, 1000] as const;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const emptyPlatform: PricingPlatformOption = {
  name: "Canal nao configurado",
  commissionRate: 0,
  fixedFee: 0,
  sellerShippingCost: 0,
  sellerShippingThreshold: 0
};

export function PricingCalculator({ variants, platforms, readonlyMode = false }: PricingCalculatorProps) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [platformKey, setPlatformKey] = useState(Object.keys(platforms)[0] ?? "direct");

  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const platform: PricingPlatformOption = platforms[platformKey] ?? Object.values(platforms)[0] ?? emptyPlatform;
  const [currentAnchors, setCurrentAnchors] = useState<PricingAnchors>(() => variant?.anchors ?? emptyAnchors());
  const [simulatedAnchors, setSimulatedAnchors] = useState<PricingAnchors>(() => variant?.anchors ?? emptyAnchors());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerDocument, setQuickCustomerDocument] = useState("");
  const [quickCustomerEmail, setQuickCustomerEmail] = useState("");
  const [quickCustomerPhone, setQuickCustomerPhone] = useState("");
  const [destinationPostalCode, setDestinationPostalCode] = useState("");
  const [originPostalCode, setOriginPostalCode] = useState("");
  const [shippingService, setShippingService] = useState("manual");
  const [shippingAmount, setShippingAmount] = useState(0);
  const [includeShipping, setIncludeShipping] = useState(false);
  const [includeCommission, setIncludeCommission] = useState(true);
  const [includeFixedFee, setIncludeFixedFee] = useState(true);
  const [includeSellerShipping, setIncludeSellerShipping] = useState(true);
  const [quickState, setQuickState] = useState<"idle" | "creating_pdf" | "copying_text" | "copied" | "error">("idle");
  const [quickMessage, setQuickMessage] = useState("");
  const [quickText, setQuickText] = useState("");

  useEffect(() => {
    if (variant) {
      setCurrentAnchors(variant.anchors);
      setSimulatedAnchors(variant.anchors);
      setSaveState("idle");
      setQuickState("idle");
      setQuickMessage("");
      setQuickText("");
    }
  }, [variant]);

  const effectivePlatform = useMemo(
    () => ({
      ...platform,
      commissionRate: includeCommission ? platform.commissionRate : 0,
      fixedFee: includeFixedFee ? platform.fixedFee : 0,
      sellerShippingCost: includeSellerShipping ? platform.sellerShippingCost : 0
    }),
    [includeCommission, includeFixedFee, includeSellerShipping, platform]
  );

  const currentResult = useMemo(() => {
    if (!variant || !platform) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      anchors: currentAnchors,
      platform: effectivePlatform
    });
  }, [currentAnchors, effectivePlatform, platform, quantity, variant]);

  const simulatedResult = useMemo(() => {
    if (!variant || !platform) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      anchors: simulatedAnchors,
      platform: effectivePlatform
    });
  }, [effectivePlatform, platform, quantity, simulatedAnchors, variant]);

  const currentSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: currentAnchors,
        platform: effectivePlatform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [currentAnchors, effectivePlatform, platform, variant]);

  const simulatedSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: simulatedAnchors,
        platform: effectivePlatform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [effectivePlatform, platform, simulatedAnchors, variant]);

  const comparison = useMemo(() => {
    if (!variant || !platform) return [];
    return comparePricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: currentAnchors,
        platform: effectivePlatform
      },
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: simulatedAnchors,
        platform: effectivePlatform
      },
      [quantity]
    );
  }, [currentAnchors, effectivePlatform, platform, quantity, simulatedAnchors, variant]);

  if (!variant || !platform || !currentResult || !simulatedResult) {
    return <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6">Nenhum produto disponivel.</div>;
  }

  const selectedComparison = comparison[0];
  const simulatedChanged = hasAnchorChanges(currentAnchors, simulatedAnchors);

  function updateAnchor(quantityKey: PricingAnchorQuantity, value: number) {
    setSimulatedAnchors((current) => ({
      ...current,
      [quantityKey]: Number.isFinite(value) ? Math.max(0, value) : 0
    }));
    setSaveState("idle");
    setQuickState("idle");
    setQuickMessage("");
    setQuickText("");
  }

  function resetAnchors() {
    setSimulatedAnchors(currentAnchors);
    setSaveState("idle");
  }

  function smoothAnchors() {
    setSimulatedAnchors((current) => recomputeIntermediateAnchors(current));
    setSaveState("idle");
  }

  async function saveCurveVersion() {
    if (readonlyMode || !simulatedChanged || saveState === "saving") return;

    setSaveState("saving");
    const response = await fetch(`/api/products/${variant.id}/curve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anchors: simulatedAnchors })
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    setCurrentAnchors(simulatedAnchors);
    setSaveState("saved");
    router.refresh();
  }

  async function createQuickQuote() {
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productVariantId: variant.id,
        platformRuleId: platformKey,
        quantity,
        customerId: null,
        customerName: quickCustomerName.trim() || "Cliente nao informado",
        customerDocument: quickCustomerDocument,
        customerEmail: quickCustomerEmail,
        customerPhone: quickCustomerPhone,
        shippingTotal: includeShipping ? shippingAmount : 0,
        includeCommission,
        includeFixedFee,
        includeSellerShipping,
        validDays: 7,
        notes: buildQuickQuoteNotes({
          destinationPostalCode,
          includeShipping,
          originPostalCode,
          shippingAmount,
          shippingService
        })
      })
    });

    if (!response.ok) throw new Error("Quote creation failed.");
    const payload = (await response.json()) as { quote?: { id?: string } };
    const quoteId = payload.quote?.id;
    if (!quoteId) throw new Error("Quote id missing.");
    return quoteId;
  }

  async function generateQuickPdf() {
    if (readonlyMode || simulatedChanged || quickState === "creating_pdf") return;

    setQuickState("creating_pdf");
    setQuickMessage("");
    setQuickText("");
    const pdfWindow = window.open("about:blank", "_blank");

    try {
      const quoteId = await createQuickQuote();
      const pdfUrl = `/api/quotes/${quoteId}/pdf`;
      if (pdfWindow) {
        pdfWindow.location.href = pdfUrl;
      } else {
        window.location.href = pdfUrl;
      }
      setQuickState("idle");
      setQuickMessage("Orcamento criado e PDF gerado.");
      router.refresh();
    } catch {
      pdfWindow?.close();
      setQuickState("error");
      setQuickMessage("Nao foi possivel gerar o PDF.");
    }
  }

  async function copyQuickWhatsAppText() {
    if (readonlyMode || simulatedChanged || quickState === "copying_text") return;

    setQuickState("copying_text");
    setQuickMessage("");
    setQuickText("");

    try {
      const quoteId = await createQuickQuote();
      const response = await fetch(`/api/quotes/${quoteId}/whatsapp`);
      if (!response.ok) throw new Error("WhatsApp text failed.");
      const payload = (await response.json()) as { text?: string };
      if (!payload.text) throw new Error("WhatsApp text missing.");
      setQuickText(payload.text);
      await navigator.clipboard.writeText(payload.text);
      setQuickState("copied");
      setQuickMessage("Texto do orcamento copiado para o WhatsApp.");
      router.refresh();
    } catch {
      setQuickState("error");
      setQuickMessage("Nao foi possivel copiar o texto.");
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl shadow-zinc-950/20">
      <div className="border-b border-zinc-800 bg-zinc-950 px-5 py-5 md:px-6">
        <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-400">
              <Calculator size={18} />
              Precificador
            </div>
            <h2 className="text-2xl font-semibold text-white">{variant.productName}</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {variant.variantName} · custo {brl.format(variant.unitCost)} · {platform.name}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
            <button
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              disabled={readonlyMode || simulatedChanged || quickState === "creating_pdf"}
              type="button"
              onClick={generateQuickPdf}
            >
              <FileText size={16} />
              {quickState === "creating_pdf" ? "Gerando..." : "Gerar PDF"}
            </button>
            <button
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-500"
              disabled={readonlyMode || simulatedChanged || quickState === "copying_text"}
              type="button"
              onClick={copyQuickWhatsAppText}
            >
              <Clipboard size={16} />
              {quickState === "copying_text" ? "Copiando..." : "Copiar WhatsApp"}
            </button>
          </div>
        </div>

        {simulatedChanged ? (
          <p className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Salve a curva simulada antes de gerar orcamento, PDF ou texto para WhatsApp.
          </p>
        ) : null}
        {quickMessage ? (
          <p className={`mt-4 text-sm ${quickState === "error" ? "text-red-300" : "text-emerald-300"}`}>
            {quickMessage}
          </p>
        ) : null}
        {quickText ? (
          <textarea
            className="focus-ring mt-3 min-h-32 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            readOnly
            value={quickText}
          />
        ) : null}
      </div>

      <div className="grid gap-5 p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_180px]">
          <Control label="Produto">
            <select
              className="focus-ring h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              {variants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.productName} - {item.variantName}
                </option>
              ))}
            </select>
          </Control>

          <Control label="Canal">
            <select
              className="focus-ring h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
              value={platformKey}
              onChange={(event) => setPlatformKey(event.target.value)}
            >
              {Object.entries(platforms).map(([key, rule]) => (
                <option key={key} value={key}>
                  {rule.name}
                </option>
              ))}
            </select>
          </Control>

          <Control label="Quantidade">
            <input
              className="focus-ring h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
              min={1}
              max={50000}
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </Control>
        </div>

        <DetailsPanel icon={<UserRound size={16} />} title="Informacoes do Cliente">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Nome (cliente)" placeholder="Insira o nome do cliente" value={quickCustomerName} onChange={setQuickCustomerName} />
            <Input label="CPF/CNPJ" placeholder="000.000.000-00 ou 00.000.000/0000-00" value={quickCustomerDocument} onChange={setQuickCustomerDocument} />
            <Input label="Email" placeholder="Email do cliente" type="email" value={quickCustomerEmail} onChange={setQuickCustomerEmail} />
            <Input label="Telefone" placeholder="Telefone do cliente" value={quickCustomerPhone} onChange={setQuickCustomerPhone} />
          </div>
          <p className="mt-3 text-xs text-zinc-500">Se vazio, entra como cliente nao informado no orcamento rapido.</p>
        </DetailsPanel>

        <DetailsPanel icon={<Truck size={16} />} title="Frete e calculo">
          <div className="grid gap-4 md:grid-cols-5">
            <Input label="CEP destino" placeholder="00000-000" value={destinationPostalCode} onChange={setDestinationPostalCode} />
            <Input label="CEP origem" placeholder="Usa padrao configurado" value={originPostalCode} onChange={setOriginPostalCode} />
            <Control label="Servico">
              <select
                className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm"
                value={shippingService}
                onChange={(event) => setShippingService(event.target.value)}
              >
                <option value="manual">Outros/manual</option>
                <option value="sedex">SEDEX</option>
                <option value="pac">PAC</option>
                <option value="melhor_envio">Melhor Envio</option>
              </select>
            </Control>
            <Input label="Frete estimado (R$)" min={0} step={0.01} type="number" value={shippingAmount} onChange={setShippingAmount} />
            <div className="flex flex-col justify-end gap-2">
              <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-300">
                <input
                  checked={includeShipping}
                  className="h-4 w-4 accent-amber-500"
                  type="checkbox"
                  onChange={(event) => setIncludeShipping(event.target.checked)}
                />
                Somar frete ao orcamento
              </label>
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Total com frete: {brl.format(simulatedResult.subtotal + (includeShipping ? shippingAmount : 0))}
          </p>
        </DetailsPanel>

        <DetailsPanel icon={<Activity size={16} />} title="Ancoragem de precos & Custos">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={smoothAnchors}
            >
              <Activity size={16} />
              Recalcular intermediarios
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={resetAnchors}
            >
              <RotateCcw size={16} />
              Resetar curva
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              disabled={readonlyMode || !simulatedChanged || saveState === "saving"}
              type="button"
              onClick={saveCurveVersion}
            >
              <Save size={16} />
              {saveState === "saving" ? "Salvando..." : "Salvar nova versao"}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            {ANCHOR_QUANTITIES.map((anchorQuantity) => (
              <Input
                key={anchorQuantity}
                label={`q=${anchorQuantity}`}
                min={0}
                step={0.01}
                type="number"
                value={simulatedAnchors[anchorQuantity]}
                onChange={(value) => updateAnchor(anchorQuantity, value)}
              />
            ))}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <CostToggle
              checked={includeCommission}
              label="Comissao"
              value={`${percent.format(platform.commissionRate * 100)}%`}
              onChange={setIncludeCommission}
            />
            <CostToggle
              checked={includeFixedFee}
              label="Taxa fixa"
              value={brl.format(platform.fixedFee)}
              onChange={setIncludeFixedFee}
            />
            <CostToggle
              checked={includeSellerShipping}
              label="Frete vendedor"
              value={brl.format(platform.sellerShippingCost)}
              onChange={setIncludeSellerShipping}
            />
            <ReadOnlyField label="Limite frete vendedor" value={brl.format(platform.sellerShippingThreshold)} />
          </div>
          {saveState === "saved" ? <p className="mt-3 text-sm text-emerald-300">Nova curva ativa salva.</p> : null}
          {saveState === "error" ? <p className="mt-3 text-sm text-red-300">Nao foi possivel salvar a curva.</p> : null}
        </DetailsPanel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric icon={<CircleDollarSign size={18} />} label="Preco unitario" tone="amber" value={brl.format(simulatedResult.finalUnitPrice)} />
          <Metric label="Taxa fixa" value={brl.format(simulatedResult.fixedFeeTotal)} />
          <Metric label="Preco total" value={brl.format(simulatedResult.subtotal)} />
          <Metric label="Margem liquida" value={brl.format(simulatedResult.profit)} tone="emerald" />
          <Metric label="Custo total" value={brl.format(simulatedResult.totalCost)} />
          <Metric
            icon={<TrendingUp size={18} />}
            label="Margem (%)"
            value={`${percent.format(simulatedResult.marginPercent)}%`}
            tone={simulatedResult.marginPercent >= 0 ? "emerald" : "red"}
          />
        </div>

        <ChartPanel title="Curva de precos com custos" subtitle="Calculada para cada unidade entre 1 e 1000. Passe o mouse para ver quantidade, base e preco final.">
          <LineChart
            anchors={ANCHOR_QUANTITIES}
            current={pricingCurvePoints(currentAnchors, variant.unitCost, effectivePlatform)}
            formatValue={(value) => brl.format(value)}
            simulated={pricingCurvePoints(simulatedAnchors, variant.unitCost, effectivePlatform)}
          />
        </ChartPanel>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h3 className="font-semibold text-white">Faixas de quantidade</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-800 text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Qtd</th>
                    <th className="px-4 py-3 font-semibold">Atual</th>
                    <th className="px-4 py-3 font-semibold">Simulado</th>
                    <th className="px-4 py-3 font-semibold">Margem</th>
                    <th className="px-4 py-3 font-semibold">Lucro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {simulatedSeries.map((point, index) => (
                    <tr key={point.quantity}>
                      <td className="px-4 py-3 font-medium text-white">{point.label}</td>
                      <td className="px-4 py-3 text-zinc-300">{brl.format(currentSeries[index].finalUnitPrice)}</td>
                      <td className="px-4 py-3 text-emerald-300">{brl.format(point.finalUnitPrice)}</td>
                      <td className="px-4 py-3 text-zinc-300">{percent.format(point.marginPercent)}%</td>
                      <td className="px-4 py-3 text-zinc-300">{brl.format(point.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
            <h3 className="font-semibold text-white">Resumo do calculo</h3>
            <dl className="mt-4 grid gap-3 text-sm">
              <Detail label="Base atual" value={brl.format(currentResult.baseUnitPrice)} />
              <Detail label="Base simulada" value={brl.format(simulatedResult.baseUnitPrice)} />
              <Detail label="Comissao" value={brl.format(simulatedResult.commissionTotal)} />
              <Detail label="Taxa fixa" value={brl.format(simulatedResult.fixedFeeTotal)} />
              <Detail label="Frete vendedor" value={brl.format(simulatedResult.sellerShippingTotal)} />
              <Detail label="Frete cliente" value={includeShipping ? brl.format(shippingAmount) : brl.format(0)} />
              <Detail label="Custo mercadoria" value={brl.format(simulatedResult.costOfGoodsTotal)} />
              <Detail label="Lucro liquido" value={brl.format(simulatedResult.profit)} />
            </dl>
            <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Diferenca na quantidade atual</p>
              <p className="mt-2 text-sm text-zinc-300">
                Unitario: <span className={deltaClass(selectedComparison.unitPriceDelta)}>{formatDeltaMoney(selectedComparison.unitPriceDelta)}</span>
              </p>
              <p className="mt-1 text-sm text-zinc-300">
                Margem: <span className={deltaClass(selectedComparison.marginDelta)}>{formatDeltaPercent(selectedComparison.marginDelta)}</span>
              </p>
            </div>
          </section>
        </div>

        {readonlyMode ? (
          <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Demo com dados ficticios. Custos e curvas reais ficam protegidos apos login.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DetailsPanel({
  children,
  defaultOpen = false,
  icon,
  title
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  title: string;
}) {
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-medium text-amber-400">
          {icon}
          {title}
        </span>
        <span className="text-xs text-zinc-500">Clique para expandir/recolher</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function Control({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Input<T extends number | string>({
  label,
  min,
  onChange,
  placeholder,
  step,
  type = "text",
  value
}: {
  label: string;
  min?: number;
  onChange: (value: T) => void;
  placeholder?: string;
  step?: number;
  type?: string;
  value: T;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <input
        className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
        min={min}
        placeholder={placeholder}
        step={step}
        type={type}
        value={value}
        onChange={(event) => {
          const nextValue = type === "number" ? Number(event.target.value) : event.target.value;
          onChange(nextValue as T);
        }}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function CostToggle({
  checked,
  label,
  onChange,
  value
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  value: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <span>
        <span className="block text-xs uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="mt-1 block font-medium text-zinc-100">{value}</span>
      </span>
      <input
        checked={checked}
        className="h-4 w-4 accent-amber-500"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Metric({
  icon,
  label,
  tone = "zinc",
  value
}: {
  icon?: React.ReactNode;
  label: string;
  tone?: "amber" | "emerald" | "red" | "zinc";
  value: string;
}) {
  const toneClass = {
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    red: "text-red-300",
    zinc: "text-white"
  }[tone];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ children, subtitle, title }: { children: React.ReactNode; subtitle: string; title: string }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-zinc-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Atual
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Simulado
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}

function LineChart({
  anchors,
  current,
  formatValue,
  simulated
}: {
  anchors?: readonly number[];
  current: ChartPoint[];
  formatValue: (value: number) => string;
  simulated: ChartPoint[];
}) {
  const [tooltip, setTooltip] = useState<{ point: ChartPoint; x: number; y: number } | null>(null);
  const allValues = [...current, ...simulated].map((point) => point.value);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = Math.max(max - min, 0.01);
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 44, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minQuantity = Math.min(...simulated.map((point) => point.quantity));
  const maxQuantity = Math.max(...simulated.map((point) => point.quantity));

  const toX = (quantity: number) =>
    padding.left + ((quantity - minQuantity) / Math.max(maxQuantity - minQuantity, 1)) * chartWidth;
  const toY = (value: number) => padding.top + (1 - (value - min) / range) * chartHeight;
  const linePath = (points: ChartPoint[]) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.quantity).toFixed(2)} ${toY(point.value).toFixed(2)}`)
      .join(" ");
  const anchorSet = new Set(anchors ?? []);
  const highlightedAnchors = simulated.filter((point) => anchorSet.has(point.quantity));

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
      <svg
        className="h-full w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = width / rect.width;
          const svgX = (event.clientX - rect.left) * ratio;
          const quantity = Math.round(
            minQuantity + ((svgX - padding.left) / Math.max(chartWidth, 1)) * (maxQuantity - minQuantity)
          );
          const nearest = simulated[Math.max(0, Math.min(simulated.length - 1, quantity - minQuantity))];
          if (!nearest) return;
          setTooltip({ point: nearest, x: toX(nearest.quantity), y: toY(nearest.value) });
        }}
      >
        <line stroke="#27272a" x1={padding.left} x2={width - padding.right} y1={padding.top} y2={padding.top} />
        <line
          stroke="#27272a"
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + chartHeight / 2}
          y2={padding.top + chartHeight / 2}
        />
        <line
          stroke="#27272a"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />
        <text fill="#a1a1aa" fontSize="11" x="12" y={padding.top + 4}>
          {formatValue(max)}
        </text>
        <text fill="#a1a1aa" fontSize="11" x="12" y={height - padding.bottom + 4}>
          {formatValue(min)}
        </text>

        <path d={linePath(current)} fill="none" stroke="#f59e0b" strokeLinecap="round" strokeWidth="3" />
        <path d={linePath(simulated)} fill="none" stroke="#34d399" strokeLinecap="round" strokeWidth="3" />

        {highlightedAnchors.map((point) => (
          <g key={point.quantity}>
            <circle cx={toX(point.quantity)} cy={toY(point.value)} fill="#34d399" r="5" stroke="#f4f4f5" strokeWidth="1.5" />
            <text fill="#a1a1aa" fontSize="11" textAnchor="middle" x={toX(point.quantity)} y={height - 18}>
              {point.label}
            </text>
          </g>
        ))}
        {tooltip ? (
          <g>
            <line stroke="#71717a" strokeDasharray="4 4" x1={tooltip.x} x2={tooltip.x} y1={padding.top} y2={height - padding.bottom} />
            <circle cx={tooltip.x} cy={tooltip.y} fill="#f59e0b" r="4" />
            <rect
              fill="#18181b"
              height="58"
              rx="6"
              stroke="#3f3f46"
              width="178"
              x={Math.min(tooltip.x + 12, width - 196)}
              y={Math.max(tooltip.y - 70, 12)}
            />
            <text fill="#f4f4f5" fontSize="11" x={Math.min(tooltip.x + 24, width - 184)} y={Math.max(tooltip.y - 50, 32)}>
              Qtd: {tooltip.point.quantity}
            </text>
            <text fill="#d4d4d8" fontSize="11" x={Math.min(tooltip.x + 24, width - 184)} y={Math.max(tooltip.y - 34, 48)}>
              Base: {formatValue(tooltip.point.baseValue)}
            </text>
            <text fill="#34d399" fontSize="11" x={Math.min(tooltip.x + 24, width - 184)} y={Math.max(tooltip.y - 18, 64)}>
              Com custos: {formatValue(tooltip.point.finalValue)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-2 last:border-0 last:pb-0">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-100">{value}</dd>
    </div>
  );
}

function hasAnchorChanges(current: PricingAnchors, simulated: PricingAnchors) {
  return ANCHOR_QUANTITIES.some((quantity) => Math.abs(current[quantity] - simulated[quantity]) > 0.001);
}

function pricingCurvePoints(anchors: PricingAnchors, unitCost: number, platform: PlatformRule): ChartPoint[] {
  return Array.from({ length: 1000 }, (_, index) => {
    const quantity = index + 1;
    const baseValue = calculateAnchoredUnitPrice(quantity, anchors);
    const result = calculateQuote({
      quantity,
      unitCost,
      method: "anchors",
      anchors,
      platform
    });
    return {
      baseValue,
      finalValue: result.finalUnitPrice,
      quantity,
      label: String(quantity),
      value: result.finalUnitPrice,
      isAnchor: ANCHOR_QUANTITIES.includes(quantity as PricingAnchorQuantity)
    };
  });
}

function emptyAnchors(): PricingAnchors {
  return { 1: 0, 10: 0, 50: 0, 100: 0, 500: 0, 1000: 0 };
}

function deltaClass(value: number) {
  if (value > 0) return "font-semibold text-emerald-300";
  if (value < 0) return "font-semibold text-red-300";
  return "font-semibold text-zinc-300";
}

function formatDeltaMoney(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${brl.format(value)}`;
}

function formatDeltaPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${percent.format(value)} p.p.`;
}

function buildQuickQuoteNotes(input: {
  destinationPostalCode: string;
  includeShipping: boolean;
  originPostalCode: string;
  shippingAmount: number;
  shippingService: string;
}) {
  const lines = ["Orcamento rapido gerado pelo precificador."];
  if (input.destinationPostalCode) lines.push(`CEP destino: ${input.destinationPostalCode}`);
  if (input.originPostalCode) lines.push(`CEP origem: ${input.originPostalCode}`);
  if (input.shippingService !== "manual") lines.push(`Servico de frete: ${input.shippingService}`);
  if (input.includeShipping) lines.push(`Frete incluido: ${brl.format(input.shippingAmount)}`);
  return lines.join("\n");
}
