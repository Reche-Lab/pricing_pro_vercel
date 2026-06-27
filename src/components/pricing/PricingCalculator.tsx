"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Calculator, CircleDollarSign, RotateCcw, Save, TrendingUp } from "lucide-react";
import {
  buildPricingSimulationSeries,
  calculateQuote,
  comparePricingSimulationSeries,
  recomputeIntermediateAnchors
} from "@/domain/pricing/pricing";
import type { DemoProductVariant } from "@/domain/pricing/defaults";
import type { PlatformRule, PricingAnchors, PricingAnchorQuantity, PricingSimulationPoint } from "@/domain/pricing/types";

export type PricingPlatformOption = PlatformRule & {
  name: string;
};

type PricingCalculatorProps = {
  variants: DemoProductVariant[];
  platforms: Record<string, PricingPlatformOption>;
  readonlyMode?: boolean;
};

type ChartPoint = {
  quantity: number;
  label: string;
  value: number;
};

const ANCHOR_QUANTITIES = [1, 10, 50, 100, 500, 1000] as const;
const SIMULATION_QUANTITIES = [1, 10, 25, 50, 100, 250, 500, 1000] as const;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function PricingCalculator({ variants, platforms, readonlyMode = false }: PricingCalculatorProps) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(100);
  const [platformKey, setPlatformKey] = useState(Object.keys(platforms)[0] ?? "direct");

  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const platform: PricingPlatformOption = platforms[platformKey] ?? Object.values(platforms)[0];
  const [currentAnchors, setCurrentAnchors] = useState<PricingAnchors>(() => variant?.anchors ?? emptyAnchors());
  const [simulatedAnchors, setSimulatedAnchors] = useState<PricingAnchors>(() => variant?.anchors ?? emptyAnchors());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (variant) {
      setCurrentAnchors(variant.anchors);
      setSimulatedAnchors(variant.anchors);
      setSaveState("idle");
    }
  }, [variant]);

  const currentResult = useMemo(() => {
    if (!variant || !platform) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      anchors: currentAnchors,
      platform
    });
  }, [currentAnchors, platform, quantity, variant]);

  const simulatedResult = useMemo(() => {
    if (!variant || !platform) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      anchors: simulatedAnchors,
      platform
    });
  }, [platform, quantity, simulatedAnchors, variant]);

  const currentSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: currentAnchors,
        platform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [currentAnchors, platform, variant]);

  const simulatedSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: simulatedAnchors,
        platform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [platform, simulatedAnchors, variant]);

  const comparison = useMemo(() => {
    if (!variant || !platform) return [];
    return comparePricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: currentAnchors,
        platform
      },
      {
        unitCost: variant.unitCost,
        method: "anchors",
        anchors: simulatedAnchors,
        platform
      },
      [quantity]
    );
  }, [currentAnchors, platform, quantity, simulatedAnchors, variant]);

  if (!variant || !platform || !currentResult || !simulatedResult) {
    return <div className="rounded-lg border border-zinc-200 bg-white p-6">Nenhum produto disponivel.</div>;
  }

  const selectedComparison = comparison[0];
  const simulatedChanged = hasAnchorChanges(currentAnchors, simulatedAnchors);

  function updateAnchor(quantityKey: PricingAnchorQuantity, value: number) {
    setSimulatedAnchors((current) => ({
      ...current,
      [quantityKey]: Number.isFinite(value) ? Math.max(0, value) : 0
    }));
    setSaveState("idle");
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

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl shadow-zinc-950/20">
      <div className="border-b border-zinc-800 bg-zinc-950 px-5 py-5 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
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

          <div className="grid gap-3 md:grid-cols-3 xl:w-[720px]">
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
        </div>
      </div>

      <div className="grid gap-px bg-zinc-800 xl:grid-cols-[420px_1fr]">
        <aside className="bg-zinc-950 p-5 md:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Metric
              icon={<CircleDollarSign size={18} />}
              label="Unitario atual"
              tone="amber"
              value={brl.format(currentResult.finalUnitPrice)}
            />
            <Metric
              icon={<TrendingUp size={18} />}
              label="Unitario simulado"
              tone={simulatedChanged ? "emerald" : "zinc"}
              value={brl.format(simulatedResult.finalUnitPrice)}
            />
            <Metric label="Total simulado" value={brl.format(simulatedResult.subtotal)} />
            <Metric
              label="Margem simulada"
              value={`${percent.format(simulatedResult.marginPercent)}%`}
              tone={simulatedResult.marginPercent >= currentResult.marginPercent ? "emerald" : "red"}
            />
          </div>

          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Ancoragens</h3>
                <p className="text-xs text-zinc-400">Valores unitarios base por quantidade.</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  title="Recalcular intermediarios"
                  type="button"
                  onClick={smoothAnchors}
                >
                  <Activity size={16} />
                </button>
                <button
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  title="Restaurar curva atual"
                  type="button"
                  onClick={resetAnchors}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {ANCHOR_QUANTITIES.map((anchorQuantity) => (
                <label key={anchorQuantity} className="grid grid-cols-[72px_1fr_86px] items-center gap-3 text-sm">
                  <span className="font-medium text-zinc-300">{anchorQuantity} un.</span>
                  <input
                    className="focus-ring h-2 w-full accent-amber-500"
                    max={Math.max(20, currentAnchors[1] * 1.8)}
                    min={0}
                    step={0.01}
                    type="range"
                    value={simulatedAnchors[anchorQuantity]}
                    onChange={(event) => updateAnchor(anchorQuantity, Number(event.target.value))}
                  />
                  <input
                    className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-right text-sm text-white"
                    min={0}
                    step={0.01}
                    type="number"
                    value={simulatedAnchors[anchorQuantity]}
                    onChange={(event) => updateAnchor(anchorQuantity, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>

            <button
              className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              disabled={readonlyMode || !simulatedChanged || saveState === "saving"}
              type="button"
              onClick={saveCurveVersion}
            >
              <Save size={16} />
              {saveState === "saving" ? "Salvando..." : "Salvar nova versao"}
            </button>
            {saveState === "saved" ? (
              <p className="mt-3 text-sm text-emerald-300">Nova curva ativa salva.</p>
            ) : null}
            {saveState === "error" ? (
              <p className="mt-3 text-sm text-red-300">Nao foi possivel salvar a curva.</p>
            ) : null}
          </div>

          {readonlyMode ? (
            <p className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              Demo com dados ficticios. Custos e curvas reais ficam protegidos apos login.
            </p>
          ) : null}
        </aside>

        <div className="bg-zinc-950 p-5 md:p-6">
          <div className="grid gap-4 2xl:grid-cols-2">
            <ChartPanel title="Preco unitario" subtitle="Atual x simulado">
              <LineChart
                current={currentSeries.map((point) => toChartPoint(point, "finalUnitPrice"))}
                formatValue={(value) => brl.format(value)}
                simulated={simulatedSeries.map((point) => toChartPoint(point, "finalUnitPrice"))}
              />
            </ChartPanel>
            <ChartPanel title="Margem" subtitle="Percentual por faixa">
              <LineChart
                current={currentSeries.map((point) => toChartPoint(point, "marginPercent"))}
                formatValue={(value) => `${percent.format(value)}%`}
                simulated={simulatedSeries.map((point) => toChartPoint(point, "marginPercent"))}
              />
            </ChartPanel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
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
              <h3 className="font-semibold text-white">Breakdown</h3>
              <dl className="mt-4 grid gap-3 text-sm">
                <Detail label="Base atual" value={brl.format(currentResult.baseUnitPrice)} />
                <Detail label="Base simulada" value={brl.format(simulatedResult.baseUnitPrice)} />
                <Detail label="Comissao" value={brl.format(simulatedResult.commissionTotal)} />
                <Detail label="Taxa fixa" value={brl.format(simulatedResult.fixedFeeTotal)} />
                <Detail label="Frete vendedor" value={brl.format(simulatedResult.sellerShippingTotal)} />
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
        </div>
      </div>
    </section>
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
  current,
  formatValue,
  simulated
}: {
  current: ChartPoint[];
  formatValue: (value: number) => string;
  simulated: ChartPoint[];
}) {
  const allValues = [...current, ...simulated].map((point) => point.value);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = Math.max(max - min, 0.01);
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 44, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const toX = (index: number) => padding.left + (index / Math.max(current.length - 1, 1)) * chartWidth;
  const toY = (value: number) => padding.top + (1 - (value - min) / range) * chartHeight;
  const linePath = (points: ChartPoint[]) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${toX(index).toFixed(2)} ${toY(point.value).toFixed(2)}`).join(" ");

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
      <svg className="h-full w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
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

        {simulated.map((point, index) => (
          <g key={point.quantity}>
            <circle cx={toX(index)} cy={toY(point.value)} fill="#34d399" r="4" />
            <text fill="#a1a1aa" fontSize="11" textAnchor="middle" x={toX(index)} y={height - 18}>
              {point.label}
            </text>
          </g>
        ))}
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

function toChartPoint(point: PricingSimulationPoint, key: "finalUnitPrice" | "marginPercent"): ChartPoint {
  return {
    quantity: point.quantity,
    label: point.label,
    value: point[key]
  };
}

function hasAnchorChanges(current: PricingAnchors, simulated: PricingAnchors) {
  return ANCHOR_QUANTITIES.some((quantity) => Math.abs(current[quantity] - simulated[quantity]) > 0.001);
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
