"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Calculator,
  CircleDollarSign,
  Clipboard,
  FileText,
  Plus,
  Truck,
  UserRound,
  Trash2,
  RotateCcw,
  Save,
  TrendingUp
} from "lucide-react";
import {
  buildPricingSimulationSeries,
  calculateCurveUnitPrice,
  calculateQuote,
  comparePricingSimulationSeries,
  DEFAULT_ANCHOR_QUANTITIES,
  normalizePricingCurvePoints,
  recomputeIntermediateAnchors
} from "@/domain/pricing/pricing";
import type { DemoProductVariant } from "@/domain/pricing/defaults";
import type { PlatformRule, PricingCurve, PricingCurveMode } from "@/domain/pricing/types";

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
  const activeVariantCurve = useMemo(() => resolveVariantCurve(variant, platformKey), [platformKey, variant]);
  const [currentCurve, setCurrentCurve] = useState<PricingCurve>(() => activeVariantCurve);
  const [simulatedCurve, setSimulatedCurve] = useState<PricingCurve>(() => activeVariantCurve);
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
      setCurrentCurve(activeVariantCurve);
      setSimulatedCurve(activeVariantCurve);
      setSaveState("idle");
      setQuickState("idle");
      setQuickMessage("");
      setQuickText("");
    }
  }, [activeVariantCurve, variant]);

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
      curve: currentCurve,
      platform: effectivePlatform
    });
  }, [currentCurve, effectivePlatform, platform, quantity, variant]);

  const simulatedResult = useMemo(() => {
    if (!variant || !platform) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      curve: simulatedCurve,
      platform: effectivePlatform
    });
  }, [effectivePlatform, platform, quantity, simulatedCurve, variant]);

  const currentSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: currentCurve,
        platform: effectivePlatform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [currentCurve, effectivePlatform, platform, variant]);

  const simulatedSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: simulatedCurve,
        platform: effectivePlatform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [effectivePlatform, platform, simulatedCurve, variant]);

  const comparison = useMemo(() => {
    if (!variant || !platform) return [];
    return comparePricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: currentCurve,
        platform: effectivePlatform
      },
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: simulatedCurve,
        platform: effectivePlatform
      },
      [quantity]
    );
  }, [currentCurve, effectivePlatform, platform, quantity, simulatedCurve, variant]);

  if (!variant || !platform || !currentResult || !simulatedResult) {
    return <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6">Nenhum produto disponivel.</div>;
  }

  const selectedComparison = comparison[0];
  const simulatedChanged = hasCurveChanges(currentCurve, simulatedCurve);

  function updateCurvePoint(index: number, field: "quantity" | "unitPrice", value: number) {
    setSimulatedCurve((current) => {
      const points = current.points.map((point, pointIndex) =>
        pointIndex === index
          ? {
              ...point,
              [field]: Number.isFinite(value) ? Math.max(field === "quantity" ? 1 : 0, Math.trunc(value * (field === "quantity" ? 1 : 10000)) / (field === "quantity" ? 1 : 10000)) : 0
            }
          : point
      );
      return { ...current, points };
    });
    setSaveState("idle");
    setQuickState("idle");
    setQuickMessage("");
    setQuickText("");
  }

  function resetAnchors() {
    setSimulatedCurve(currentCurve);
    setSaveState("idle");
  }

  function smoothAnchors() {
    setSimulatedCurve((current) => {
      const anchors = pricingCurveToDefaultAnchors(current);
      return { ...current, mode: "interpolated", points: anchorsToPointList(recomputeIntermediateAnchors(anchors)) };
    });
    setSaveState("idle");
  }

  function updateCurveMode(mode: PricingCurveMode) {
    setSimulatedCurve((current) => ({ ...current, mode }));
    setSaveState("idle");
  }

  function addCurvePoint() {
    setSimulatedCurve((current) => {
      const points = normalizePricingCurvePoints(current.points);
      const last = points[points.length - 1] ?? { quantity: 1, unitPrice: 0 };
      return {
        ...current,
        points: [...points, { quantity: last.quantity + 100, unitPrice: last.unitPrice }]
      };
    });
    setSaveState("idle");
  }

  function removeCurvePoint(index: number) {
    setSimulatedCurve((current) => ({
      ...current,
      points: current.points.filter((_, pointIndex) => pointIndex !== index)
    }));
    setSaveState("idle");
  }

  async function saveCurveVersion() {
    if (readonlyMode || !simulatedChanged || saveState === "saving") return;

    setSaveState("saving");
    const response = await fetch(`/api/products/${variant.id}/curve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ curve: { ...simulatedCurve, platformRuleId: platformKey } })
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    setCurrentCurve(simulatedCurve);
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
      <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-4 sm:px-5 sm:py-5 md:px-6">
        <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-start">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-400">
              <Calculator size={18} />
              Precificador
            </div>
            <h2 className="break-words text-xl font-semibold text-white sm:text-2xl">{variant.productName}</h2>
            <p className="mt-1 break-words text-sm text-zinc-400">
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

      <div className="grid gap-5 p-4 sm:p-5 md:p-6">
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
            <div className="inline-flex overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 p-1">
              <button
                className={`rounded px-3 py-1.5 text-sm ${simulatedCurve.mode === "interpolated" ? "bg-amber-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}
                type="button"
                onClick={() => updateCurveMode("interpolated")}
              >
                Curva progressiva
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm ${simulatedCurve.mode === "step" ? "bg-amber-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}
                type="button"
                onClick={() => updateCurveMode("step")}
              >
                Preco por faixa
              </button>
            </div>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={smoothAnchors}
              disabled={simulatedCurve.mode === "step"}
            >
              <Activity size={16} />
              Recalcular intermediarios
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={addCurvePoint}
            >
              <Plus size={16} />
              Adicionar ponto
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
          <div className="grid gap-2">
            {simulatedCurve.points.map((point, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2" key={`${point.quantity}-${index}`}>
                <Input
                  label={index === 0 ? "Quantidade inicial" : "Quantidade"}
                  min={1}
                  step={1}
                  type="number"
                  value={point.quantity}
                  onChange={(value) => updateCurvePoint(index, "quantity", value)}
                />
                <Input
                  label={index === 0 ? "Preco unitario" : "Preco"}
                  min={0}
                  step={0.01}
                  type="number"
                  value={point.unitPrice}
                  onChange={(value) => updateCurvePoint(index, "unitPrice", value)}
                />
                <button
                  className="focus-ring mt-6 inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={simulatedCurve.points.length <= 1}
                  title="Remover ponto"
                  type="button"
                  onClick={() => removeCurvePoint(index)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Em curva progressiva, o sistema interpola todos os pontos entre duas quantidades. Em preco por faixa, o valor fica fixo ate o proximo ponto.
          </p>
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
            anchors={simulatedCurve.points.map((point) => point.quantity)}
            current={pricingCurvePoints(currentCurve, variant.unitCost, effectivePlatform)}
            formatValue={(value) => brl.format(value)}
            mode={simulatedCurve.mode}
            simulated={pricingCurvePoints(simulatedCurve, variant.unitCost, effectivePlatform)}
          />
        </ChartPanel>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h3 className="font-semibold text-white">Faixas de quantidade</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[640px] divide-y divide-zinc-800 text-sm">
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
      <p className={`mt-2 break-words text-xl font-semibold sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ children, subtitle, title }: { children: React.ReactNode; subtitle: string; title: string }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
      <div className="mb-3 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-zinc-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
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
  mode,
  simulated
}: {
  anchors?: readonly number[];
  current: ChartPoint[];
  formatValue: (value: number) => string;
  mode: PricingCurveMode;
  simulated: ChartPoint[];
}) {
  const [tooltip, setTooltip] = useState<{ point: ChartPoint; x: number; y: number } | null>(null);
  const allValues = [...current, ...simulated].map((point) => point.value);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const yTicks = buildNiceTicks(rawMin, rawMax, 5);
  const min = yTicks[0];
  const max = yTicks[yTicks.length - 1];
  const range = Math.max(max - min, 0.01);
  const width = 920;
  const height = 340;
  const padding = { top: 24, right: 28, bottom: 54, left: 82 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minQuantity = Math.min(...simulated.map((point) => point.quantity));
  const maxQuantity = Math.max(...simulated.map((point) => point.quantity));
  const xTicks = buildQuantityTicks(minQuantity, maxQuantity, anchors);

  const toX = (quantity: number) =>
    padding.left + ((quantity - minQuantity) / Math.max(maxQuantity - minQuantity, 1)) * chartWidth;
  const toY = (value: number) => padding.top + (1 - (value - min) / range) * chartHeight;
  const linePath = (points: ChartPoint[], lineMode: PricingCurveMode) => {
    if (lineMode === "step") {
      return points
        .map((point, index) => {
          const x = toX(point.quantity).toFixed(2);
          const y = toY(point.value).toFixed(2);
          if (index === 0) return `M ${x} ${y}`;
          const previous = points[index - 1];
          return `L ${x} ${toY(previous.value).toFixed(2)} L ${x} ${y}`;
        })
        .join(" ");
    }

    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.quantity).toFixed(2)} ${toY(point.value).toFixed(2)}`)
      .join(" ");
  };
  const anchorSet = new Set(anchors ?? []);
  const highlightedAnchors = simulated.filter((point) => anchorSet.has(point.quantity));

  return (
    <div className="h-[300px] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-inner shadow-black/30 sm:h-[340px]">
      <svg
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = width / rect.width;
          const svgX = (event.clientX - rect.left) * ratio;
          const nearest = simulated.reduce((closest, point) =>
            Math.abs(toX(point.quantity) - svgX) < Math.abs(toX(closest.quantity) - svgX) ? point : closest
          );
          if (!nearest) return;
          setTooltip({ point: nearest, x: toX(nearest.quantity), y: toY(nearest.value) });
        }}
      >
        <defs>
          <linearGradient id="current-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="simulated-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#6ee7b7" />
          </linearGradient>
        </defs>

        <rect fill="#09090b" height={chartHeight} rx="10" width={chartWidth} x={padding.left} y={padding.top} />

        {yTicks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line stroke="#27272a" strokeDasharray={tick === 0 ? "0" : "4 8"} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text fill="#a1a1aa" fontSize="12" textAnchor="end" x={padding.left - 12} y={y + 4}>
                {formatValue(tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = toX(tick);
          return (
            <g key={tick}>
              <line stroke="#18181b" x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} />
              <text fill="#a1a1aa" fontSize="12" fontWeight="600" textAnchor="middle" x={Math.round(x)} y={height - 20}>
                {tick.toLocaleString("pt-BR")}
              </text>
            </g>
          );
        })}

        <line stroke="#3f3f46" strokeWidth="1.5" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        <line stroke="#3f3f46" strokeWidth="1.5" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
        <text fill="#71717a" fontSize="11" textAnchor="middle" transform={`rotate(-90 18 ${padding.top + chartHeight / 2})`} x="18" y={padding.top + chartHeight / 2}>
          Preco unitario
        </text>

        <path d={linePath(current, mode)} fill="none" opacity="0.85" stroke="url(#current-line)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <path d={linePath(simulated, mode)} fill="none" stroke="url(#simulated-line)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />

        {highlightedAnchors.map((point) => (
          <g key={point.quantity}>
            <circle cx={toX(point.quantity)} cy={toY(point.value)} fill="#34d399" r="5" stroke="#f4f4f5" strokeWidth="1.5" />
          </g>
        ))}
        {tooltip ? (
          <g>
            <line stroke="#71717a" strokeDasharray="4 4" x1={tooltip.x} x2={tooltip.x} y1={padding.top} y2={height - padding.bottom} />
            <circle cx={tooltip.x} cy={tooltip.y} fill="#34d399" r="5" stroke="#f4f4f5" strokeWidth="1.5" />
            <rect
              fill="#18181b"
              height="64"
              rx="8"
              stroke="#3f3f46"
              width="190"
              x={Math.min(tooltip.x + 12, width - 210)}
              y={Math.max(tooltip.y - 78, 12)}
            />
            <text fill="#f4f4f5" fontSize="12" fontWeight="600" x={Math.min(tooltip.x + 24, width - 198)} y={Math.max(tooltip.y - 56, 34)}>
              Qtd: {tooltip.point.quantity}
            </text>
            <text fill="#d4d4d8" fontSize="11" x={Math.min(tooltip.x + 24, width - 198)} y={Math.max(tooltip.y - 38, 52)}>
              Base: {formatValue(tooltip.point.baseValue)}
            </text>
            <text fill="#34d399" fontSize="11" x={Math.min(tooltip.x + 24, width - 198)} y={Math.max(tooltip.y - 20, 70)}>
              Com custos: {formatValue(tooltip.point.finalValue)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function buildNiceTicks(rawMin: number, rawMax: number, targetCount: number) {
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) return [0, 1];

  const minValue = Math.min(rawMin, rawMax);
  const maxValue = Math.max(rawMin, rawMax);
  const spread = Math.max(maxValue - minValue, 0.01);
  const step = niceNumber(spread / Math.max(targetCount - 1, 1));
  const minTick = Math.floor(minValue / step) * step;
  const maxTick = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];

  for (let value = minTick; value <= maxTick + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  return ticks.length >= 2 ? ticks : [minTick, minTick + step];
}

function niceNumber(value: number) {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function buildQuantityTicks(minQuantity: number, maxQuantity: number, anchors?: readonly number[]) {
  const anchorTicks = (anchors ?? []).filter((quantity) => quantity >= minQuantity && quantity <= maxQuantity);
  const baseTicks = [minQuantity, ...anchorTicks, maxQuantity];
  let uniqueTicks = Array.from(new Set(baseTicks)).sort((a, b) => a - b);
  const range = Math.max(maxQuantity - minQuantity, 1);

  if (uniqueTicks.length > 1 && uniqueTicks[0] === minQuantity && uniqueTicks[1] - uniqueTicks[0] < range * 0.04) {
    uniqueTicks = uniqueTicks.slice(1);
  }

  if (uniqueTicks.length <= 7) return uniqueTicks;

  const step = Math.max(1, Math.ceil((uniqueTicks.length - 1) / 6));
  const reduced = uniqueTicks.filter((_, index) => index % step === 0);
  if (!reduced.includes(maxQuantity)) reduced.push(maxQuantity);
  return reduced;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-2 last:border-0 last:pb-0">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-100">{value}</dd>
    </div>
  );
}

function hasCurveChanges(current: PricingCurve, simulated: PricingCurve) {
  const currentPoints = normalizePricingCurvePoints(current.points);
  const simulatedPoints = normalizePricingCurvePoints(simulated.points);
  if (current.mode !== simulated.mode || currentPoints.length !== simulatedPoints.length) return true;

  return currentPoints.some((point, index) => {
    const simulatedPoint = simulatedPoints[index];
    return (
      point.quantity !== simulatedPoint.quantity ||
      Math.abs(point.unitPrice - simulatedPoint.unitPrice) > 0.001
    );
  });
}

function pricingCurvePoints(curve: PricingCurve, unitCost: number, platform: PlatformRule): ChartPoint[] {
  const normalizedCurve = { ...curve, points: normalizePricingCurvePoints(curve.points) };
  const maxQuantity = Math.min(
    Math.max(1000, normalizedCurve.points[normalizedCurve.points.length - 1]?.quantity ?? 1000),
    5000
  );
  const anchorSet = new Set(normalizedCurve.points.map((point) => point.quantity));
  const quantities = Array.from(
    new Set([
      ...Array.from({ length: 1000 }, (_, index) => Math.max(1, Math.round(1 + (index / 999) * (maxQuantity - 1)))),
      ...normalizedCurve.points.map((point) => point.quantity)
    ])
  ).sort((a, b) => a - b);

  return quantities.map((quantity) => {
    const baseValue = calculateCurveUnitPrice(quantity, normalizedCurve);
    const result = calculateQuote({
      quantity,
      unitCost,
      method: "anchors",
      curve: normalizedCurve,
      platform
    });
    return {
      baseValue,
      finalValue: result.finalUnitPrice,
      quantity,
      label: String(quantity),
      value: result.finalUnitPrice,
      isAnchor: anchorSet.has(quantity)
    };
  });
}

function emptyCurve(): PricingCurve {
  return { mode: "interpolated", points: DEFAULT_ANCHOR_QUANTITIES.map((quantity) => ({ quantity, unitPrice: 0 })) };
}

function resolveVariantCurve(variant: DemoProductVariant | undefined, platformKey: string): PricingCurve {
  return variant?.platformCurves?.[platformKey] ?? variant?.curve ?? emptyCurve();
}

function pricingCurveToDefaultAnchors(curve: PricingCurve) {
  return {
    1: calculateCurveUnitPrice(1, curve),
    10: calculateCurveUnitPrice(10, curve),
    50: calculateCurveUnitPrice(50, curve),
    100: calculateCurveUnitPrice(100, curve),
    500: calculateCurveUnitPrice(500, curve),
    1000: calculateCurveUnitPrice(1000, curve)
  };
}

function anchorsToPointList(anchors: ReturnType<typeof pricingCurveToDefaultAnchors>) {
  return DEFAULT_ANCHOR_QUANTITIES.map((quantity) => ({ quantity, unitPrice: anchors[quantity] }));
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
