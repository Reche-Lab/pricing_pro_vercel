"use client";

import React, { useEffect, useState } from "react";
import { BarChart3, ChevronDown, Loader2 } from "lucide-react";
import type { FinancialSeriesMetric, MonthlyFinancialGroup, MonthlyFinancialPoint } from "@/domain/finance/analysis";

type Comparison = { series: MonthlyFinancialPoint[]; groups: { categories: MonthlyFinancialGroup[]; natures: MonthlyFinancialGroup[] }; categories: Array<{ name: string; amountCents: number }> };
type Dimension = "all" | "categories" | "natures";
const metrics: Array<[FinancialSeriesMetric, string]> = [["balanceCents", "Saldo dos lançamentos"], ["operatingResultCents", "Resultado operacional"], ["externalInflowsCents", "Entradas de caixa"], ["externalOutflowsCents", "Saídas de caixa"]];
const explanations: Record<FinancialSeriesMetric, string> = {
  balanceCents: "Soma das entradas menos saídas, sem linhas informativas. Não representa saldo bancário ou caixa consolidado.",
  operatingResultCents: "Somente lançamentos incluídos no resultado operacional. Pagamentos de fatura não duplicam despesas.",
  externalInflowsCents: "Somente entradas incluídas no fluxo de caixa, sem transferências internas confirmadas ou compras no cartão.",
  externalOutflowsCents: "Somente saídas incluídas no fluxo de caixa, sem transferências internas confirmadas ou compras no cartão."
};
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const month = (value: string) => new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));

export function ComparisonWorkspace({ competence, onMessage }: { competence: string; onMessage: (message: { tone: "error"; text: string }) => void }) {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<Comparison | null>(null);
  const [dimension, setDimension] = useState<Dimension>("all");
  const [selected, setSelected] = useState({ categories: "", natures: "" });
  const [metric, setMetric] = useState<FinancialSeriesMetric>("operatingResultCents");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError(""); setHovered(null);
    fetch(`/api/finance/comparison?competence=${competence}&months=${months}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Falha ao carregar evolução.");
        if (!controller.signal.aborted) setData(payload.comparison);
      })
      .catch(caught => { if (!controller.signal.aborted) { const text = caught instanceof Error ? caught.message : "Falha ao carregar evolução."; setError(text); onMessage({ tone: "error", text }); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [competence, months, onMessage]);
  const groups = dimension === "all" ? [] : data?.groups[dimension] ?? [];
  const group = dimension === "all" ? undefined : groups.find(item => item.id === selected[dimension]) ?? groups[0];
  const series = dimension === "all" ? data?.series ?? [] : group?.series ?? [];
  const current = series.at(-1)?.[metric] ?? 0;
  const previous = series.at(-2)?.[metric] ?? 0;
  const average = series.length ? Math.round(series.reduce((sum, item) => sum + item[metric], 0) / series.length) : 0;
  const change = previous === 0 ? (current === 0 ? "0%" : "Sem base anterior") : new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format((current - previous) / Math.abs(previous));
  const selectGroup = (id: string) => { if (dimension !== "all") setSelected(value => ({ ...value, [dimension]: id })); setHovered(null); };

  return <div className="min-w-0 space-y-4">
    <section className="min-w-0 border-b border-zinc-800 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold text-white"><BarChart3 className="text-cyan-300" size={18} />Evolução financeira</h2>
        <div role="group" aria-label="Período da evolução" className="flex rounded-md border border-zinc-700 p-1">{[3, 6, 12].map(value => <button type="button" aria-pressed={months === value} key={value} className={`rounded px-3 py-2 text-xs ${months === value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"}`} onClick={() => setMonths(value)}>{value} meses</button>)}</div>
      </div>
      <div role="group" aria-label="Agrupamento da evolução" className="mt-4 flex flex-wrap gap-1">{([["all", "Consolidado"], ["categories", "Por categoria"], ["natures", "Por natureza"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={dimension === id} className={`rounded-md px-3 py-2 text-sm ${dimension === id ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/30" : "text-zinc-400 hover:bg-zinc-800"}`} onClick={() => { setDimension(id); setMetric(id === "all" ? "operatingResultCents" : "balanceCents"); setHovered(null); }}>{label}</button>)}</div>
      <div className="mt-4 grid items-end gap-3 sm:grid-cols-2">
        {dimension !== "all" ? <label className="grid min-w-0 gap-1 text-xs text-zinc-400">{dimension === "categories" ? "Categoria" : "Natureza"}<select aria-label={dimension === "categories" ? "Categoria da evolução" : "Natureza da evolução"} className="h-11 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white" value={group?.id ?? ""} disabled={loading || !groups.length} onChange={event => selectGroup(event.target.value)}>{!groups.length ? <option value="">Nenhum lançamento no período</option> : groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
        <label className="grid min-w-0 gap-1 text-xs text-zinc-400">Indicador<select aria-label="Indicador da evolução" title={explanations[metric]} className="h-11 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white" value={metric} onChange={event => { setMetric(event.target.value as FinancialSeriesMetric); setHovered(null); }}>{metrics.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{explanations[metric]}</p>
      {loading ? <div role="status" className="flex h-64 items-center justify-center gap-2 text-sm text-zinc-400"><Loader2 className="animate-spin" size={18} />Carregando evolução...</div> : error ? <p role="alert" className="py-8 text-sm text-rose-300">{error}</p> : series.length ? <>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">{[["Competência atual", money(current)], ["Média do período", money(average)], ["Variação mensal", change]].map(([label, value]) => <div key={label} className="border-l-2 border-zinc-700 pl-3"><p className="text-xs text-zinc-500">{label}</p><strong className="mt-1 block text-sm text-zinc-100">{value}</strong></div>)}</div>
        <h3 className="mt-5 break-words text-sm font-medium text-zinc-200">{group?.name ?? "Consolidado"}</h3>
        <MonthlyChart series={series} metric={metric} hovered={hovered} onHover={setHovered} />
      </> : <p className="py-8 text-center text-sm text-zinc-400">Nenhum lançamento neste período.</p>}
    </section>
    {!loading && data ? <details key={dimension} open={dimension !== "all"} className="min-w-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2 text-sm font-medium text-white">Detalhamento mensal<ChevronDown size={16} /></summary>
      <div className="mt-2 max-h-[420px] overflow-auto rounded-md border border-zinc-800">
        <table className="w-full whitespace-nowrap text-right text-xs"><caption className="sr-only">Evolução mensal · {metrics.find(([key]) => key === metric)?.[1]}</caption>
          <thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-400"><tr><th scope="col" className="p-3 text-left">{dimension === "categories" ? "Categoria" : dimension === "natures" ? "Natureza" : "Grupo"}</th>{data.series.map(item => <th scope="col" className="p-3" key={item.competence}>{month(item.competence)}</th>)}<th scope="col" className="p-3">Total</th></tr></thead>
          <tbody>{(dimension === "all" ? [{ id: "all", name: "Consolidado", series: data.series }] : groups).map(item => <tr key={item.id} className={`border-t border-zinc-800 ${group?.id === item.id ? "bg-cyan-400/5" : "hover:bg-zinc-900"}`}><th scope="row" className="max-w-60 whitespace-normal p-3 text-left font-medium"><button disabled={dimension === "all"} type="button" title={`Visualizar ${item.name} no gráfico`} onClick={() => selectGroup(item.id)} className="text-cyan-200 hover:underline disabled:text-zinc-300">{item.name}</button></th>{item.series.map(point => <td className={`p-3 tabular-nums ${point[metric] < 0 ? "text-rose-300" : "text-zinc-300"}`} key={point.competence}>{money(point[metric])}</td>)}<td className="p-3 font-semibold text-zinc-100">{money(item.series.reduce((sum, point) => sum + point[metric], 0))}</td></tr>)}</tbody>
        </table>
      </div>
    </details> : null}
    {!loading && data && dimension === "all" ? <details className="border-t border-zinc-800 pt-3"><summary className="cursor-pointer text-sm text-zinc-300">Categorias com maior impacto no resultado</summary><div className="mt-3 space-y-3">{data.categories.map((item, index) => <div key={`${item.name}-${index}`}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="min-w-0 break-words text-zinc-400">{item.name}</span><strong className={`shrink-0 ${item.amountCents < 0 ? "text-rose-300" : "text-emerald-300"}`}>{money(item.amountCents)}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${item.amountCents < 0 ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${Math.abs(item.amountCents) / Math.max(1, ...data.categories.map(category => Math.abs(category.amountCents))) * 100}%` }} /></div></div>)}</div></details> : null}
  </div>;
}

function MonthlyChart({ series, metric, hovered, onHover }: { series: MonthlyFinancialPoint[]; metric: FinancialSeriesMetric; hovered: number | null; onHover: (index: number | null) => void }) {
  const values = series.map(item => item[metric]);
  const min = Math.min(0, ...values), max = Math.max(100, ...values), range = max - min;
  const left = 78, right = 730, top = 20, bottom = 200;
  const points = values.map((value, index) => ({ x: left + index / Math.max(1, series.length - 1) * (right - left), y: top + (max - value) / range * (bottom - top) }));
  const active = hovered === null ? null : series[hovered];
  return <div className="mt-2 min-w-0">
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 text-xs text-zinc-400" aria-live="polite">{active ? <><span>{month(active.competence)} · {active.transactionCount} lançamento(s)</span><strong className="text-cyan-200">{money(active[metric])}</strong></> : <span>{series.length} competências</span>}</div>
    <div className="overflow-x-auto"><svg viewBox="0 0 760 245" className="h-auto w-full min-w-[600px]" role="img" aria-label="Gráfico de evolução financeira" onPointerLeave={() => onHover(null)} onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - bounds.left) / bounds.width * 760; onHover(Math.max(0, Math.min(series.length - 1, Math.round((x - left) / (right - left) * (series.length - 1))))); }}>
      {[min, (min + max) / 2, max].map((value, index) => { const y = top + (max - value) / range * (bottom - top); return <g key={index}><line x1={left} x2={right} y1={y} y2={y} stroke="#3f3f46" strokeDasharray="3 5" /><text x={left - 10} y={y + 4} textAnchor="end" fontSize={11} fill="#a1a1aa">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value / 100)}</text></g>; })}
      <path d={points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ")} stroke="#22d3ee" fill="none" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => <g key={series[index].competence}><circle role="button" tabIndex={0} aria-label={`${month(series[index].competence)}: ${money(values[index])}`} onFocus={() => onHover(index)} onBlur={() => onHover(null)} onClick={() => onHover(index)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onHover(index); } }} cx={point.x} cy={point.y} r={hovered === index ? 6 : 4} stroke="#22d3ee" strokeWidth={2} fill={hovered === index ? "#ecfeff" : "#18181b"} /><text x={point.x} y={230} textAnchor="middle" fill="#a1a1aa" fontSize={11}>{month(series[index].competence)}</text></g>)}
    </svg></div>
  </div>;
}
