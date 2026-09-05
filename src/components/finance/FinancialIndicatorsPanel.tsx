"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart3, Check, ChevronRight, CircleDollarSign, Hash, Loader2, Pencil,
  Plus, Sigma, Trash2, X
} from "lucide-react";
import type { FinanceIndicator, FinanceOverview } from "@/components/finance/FinanceWorkspace";
import { describeIndicatorAdjustment } from "@/domain/finance/indicators";
import type {
  FinancialIndicatorAggregation,
  FinancialIndicatorAmountMode,
  FinancialIndicatorComponent,
  FinancialIndicatorFilters,
  FinancialIndicatorFormula,
  FinancialIndicatorOperation,
  FinancialIndicatorUnit
} from "@/domain/finance/indicators";

type Message = { tone: "success" | "error" | "info"; text: string };
type Props = {
  overview: FinanceOverview;
  onRefresh: () => Promise<void>;
  onMessage: (message: Message) => void;
  onDrilldown: (label: string, ids: string[]) => void;
};
type Draft = {
  id?: string;
  name: string;
  description: string;
  unit: FinancialIndicatorUnit;
  sortOrder: number;
  effectiveFrom: string;
  components: FinancialIndicatorComponent[];
  source: "transactions" | "indicator";
  sourceIndicatorId: string;
  adjustmentOperation: "none" | "percentage" | "multiply" | "divide";
  factor: string;
};
type Preview = { value: number; components: FinanceIndicator["component_results"] };

export function FinancialIndicatorsPanel({ overview, onRefresh, onMessage, onDrilldown }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function openNew() {
    setDraft({
      name: "", description: "", unit: "currency", effectiveFrom: overview.competence,
      sortOrder: Math.max(0, ...overview.indicators.map((item) => item.sort_order)) + 10,
      components: [newComponent("Componente 1")], source: "transactions", sourceIndicatorId: "", adjustmentOperation: "none", factor: "15"
    });
    setPreview(null);
    setError("");
    setConfirmDelete(false);
  }

  function openEdit(indicator: FinanceIndicator) {
    setDraft({
      id: indicator.id, name: indicator.name, description: indicator.description ?? "",
      unit: indicator.unit, effectiveFrom: overview.competence, sortOrder: indicator.sort_order,
      components: indicator.formula.components.length ? indicator.formula.components : [newComponent("Componente 1")],
      source: indicator.formula.sourceIndicatorId ? "indicator" : "transactions",
      sourceIndicatorId: indicator.formula.sourceIndicatorId ?? "",
      adjustmentOperation: indicator.formula.adjustment?.operation ?? "none",
      factor: String(indicator.formula.adjustment?.factor ?? 15).replace(".", ",")
    });
    setPreview({ value: indicator.value, components: indicator.component_results });
    setError("");
    setConfirmDelete(false);
  }

  async function requestPreview() {
    if (!draft) return;
    setBusy("preview"); setError("");
    try {
      const response = await fetch("/api/finance/indicators/preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ competence: draft.effectiveFrom, indicatorId: draft.id, unit: draft.unit, formula: formula(draft) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiError(payload.error));
      setPreview(payload.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível calcular a prévia.");
    } finally { setBusy(null); }
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setError("Informe o nome do indicador."); return; }
    setBusy("save"); setError("");
    try {
      const response = await fetch(draft.id ? `/api/finance/indicators/${draft.id}` : "/api/finance/indicators", {
        method: draft.id ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name, description: draft.description || null, unit: draft.unit,
          sortOrder: draft.sortOrder, active: true, effectiveFrom: draft.effectiveFrom, formula: formula(draft)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiError(payload.error));
      setDraft(null);
      await onRefresh();
      onMessage({ tone: "success", text: draft.id ? "Nova versão do indicador salva." : "Indicador criado para este tenant." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o indicador.");
    } finally { setBusy(null); }
  }

  async function deactivate() {
    if (!draft?.id) return;
    setBusy("delete"); setError("");
    try {
      const response = await fetch(`/api/finance/indicators/${draft.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiError(payload.error));
      setDraft(null);
      await onRefresh();
      onMessage({ tone: "success", text: "Indicador desativado. O histórico mensal foi preservado." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível desativar o indicador.");
    } finally { setBusy(null); }
  }

  return <>
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-400/10 text-amber-300"><BarChart3 size={18}/></div>
          <div><h2 className="font-semibold text-white">Indicadores personalizados</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">Combine lançamentos classificados em métricas próprias do tenant, com memória de cálculo por competência.</p></div>
        </div>
        <button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300" onClick={openNew} type="button"><Plus size={15}/>Novo indicador</button>
      </div>
      {overview.indicators.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{overview.indicators.map((indicator) =>
        <article className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/40 p-3" key={indicator.id}>
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${indicator.unit === "currency" ? "bg-emerald-400/10 text-emerald-300" : "bg-cyan-400/10 text-cyan-300"}`}>{indicator.unit === "currency" ? <CircleDollarSign size={18}/> : <Hash size={18}/>}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-zinc-100">{indicator.name}</h3>{indicator.is_frozen ? <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-200">Fechado</span> : <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">Prévia atual</span>}</div><p className="mt-1 text-2xl font-semibold text-white">{formatValue(indicator.value, indicator.unit)}</p>{indicator.description ? <p className="mt-1 text-xs leading-5 text-zinc-500">{indicator.description}</p> : null}</div>
            <button aria-label={`Editar ${indicator.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={() => openEdit(indicator)} title="Editar indicador"><Pencil size={14}/></button>
          </div>
          {indicator.formula.adjustment ? <p className="mt-2 text-xs text-amber-200">{describeIndicatorAdjustment(indicator.formula.adjustment)} · Base: {formatValue(indicator.component_results.reduce((sum, item) => sum + item.contribution, 0), indicator.unit)}</p> : null}
          <div className="mt-3 divide-y divide-zinc-800/80 border-t border-zinc-800">{indicator.component_results.map((component) =>
            <button className="flex w-full items-center gap-2 py-2 text-left text-xs hover:text-white disabled:cursor-default" disabled={!component.transactionIds.length} key={component.componentId} onClick={() => onDrilldown(`${indicator.name}: ${component.label}`, component.transactionIds)} type="button">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${component.operation === "subtract" ? "bg-rose-400/10 text-rose-300" : "bg-emerald-400/10 text-emerald-300"}`}>{component.operation === "subtract" ? "−" : "+"}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-400">{component.label} · {component.matchedCount} lançamento(s)</span>
              <strong className="shrink-0 text-zinc-200">{formatValue(component.value, indicator.unit)}</strong>
              {component.transactionIds.length ? <ChevronRight className="text-zinc-600" size={13}/> : null}
            </button>)}</div>
        </article>)} </div> : <div className="mt-4 rounded-md border border-dashed border-zinc-800 p-6 text-center"><Sigma className="mx-auto text-zinc-700" size={24}/><p className="mt-2 text-sm text-zinc-400">Nenhum indicador personalizado nesta competência.</p><p className="mt-1 text-xs text-zinc-600">Crie, por exemplo, uma base de comissão com vendas menos fretes.</p></div>}
    </section>

    {draft ? <IndicatorModal
      busy={busy} confirmDelete={confirmDelete} draft={draft} error={error} overview={overview} preview={preview}
      onChange={(next) => { setDraft(next); setPreview(null); setError(""); }} onClose={() => { if (!busy) setDraft(null); }}
      onDelete={() => confirmDelete ? void deactivate() : setConfirmDelete(true)} onPreview={() => void requestPreview()}
      onSave={() => void save()} onCancelDelete={() => setConfirmDelete(false)}
    /> : null}
  </>;
}

function IndicatorModal({ draft, overview, preview, busy, error, confirmDelete, onChange, onClose, onPreview, onSave, onDelete, onCancelDelete }: {
  draft: Draft; overview: FinanceOverview; preview: Preview | null; busy: string | null; error: string;
  confirmDelete: boolean; onChange: (draft: Draft) => void; onClose: () => void; onPreview: () => void;
  onSave: () => void; onDelete: () => void; onCancelDelete: () => void;
}) {
  const sources = useMemo(() => [...new Set(overview.transactions.map((item) => item.source_type))].sort(), [overview.transactions]);
  function updateComponent(id: string, patch: Partial<FinancialIndicatorComponent>) {
    onChange({ ...draft, components: draft.components.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }
  function updateFilter(id: string, key: keyof FinancialIndicatorFilters, value: string | boolean) {
    onChange({ ...draft, components: draft.components.map((item) => item.id === id ? {
      ...item, filters: { ...item.filters, [key]: typeof value === "boolean" ? value : value ? [value] : undefined }
    } : item) });
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-2 sm:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={draft.id ? "Editar indicador" : "Novo indicador"} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3"><div><h2 className="font-semibold text-white">{draft.id ? "Editar indicador" : "Novo indicador"}</h2><p className="text-xs text-zinc-500">Defina a base e o cálculo desta métrica.</p></div><button aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-800" onClick={onClose}><X size={18}/></button></div>
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px]">
          <Field label="Nome do indicador"><input maxLength={100} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Ex.: Base de comissão" value={draft.name}/></Field>
          <Field label="Formato"><select disabled={draft.source === "indicator"} value={draft.unit} onChange={(event) => { const unit = event.target.value as FinancialIndicatorUnit; onChange({ ...draft, unit, components: draft.components.map((item) => ({ ...item, aggregation: unit === "currency" ? "sum" : "count" })) }); }}><option value="currency">Valor em reais</option><option value="number">Quantidade</option></select></Field>
          <Field label="Válido a partir de"><input type="month" value={draft.effectiveFrom} onChange={(event) => onChange({ ...draft, effectiveFrom: event.target.value })}/></Field>
        </div>
        <Field label="Descrição para quem consulta"><textarea className="min-h-16" maxLength={500} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="Explique o que este número representa." value={draft.description}/></Field>

        <div className="grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2">
          <Field label="Base do cálculo"><select value={draft.source} onChange={(event) => onChange({ ...draft, source: event.target.value as Draft["source"], components: draft.components.map((item) => ({ ...item, aggregation: draft.unit === "currency" ? "sum" : "count" })) })}><option value="transactions">Combinar lançamentos</option><option value="indicator">Usar outro indicador</option></select></Field>
          {draft.source === "indicator" ? <Field label="Indicador-base"><select value={draft.sourceIndicatorId} onChange={(event) => {
            const source = overview.indicators.find((item) => item.id === event.target.value);
            onChange({ ...draft, sourceIndicatorId: event.target.value, unit: source?.unit ?? draft.unit });
          }}><option value="">Selecione o indicador</option>{draft.sourceIndicatorId && !overview.indicators.some((item) => item.id === draft.sourceIndicatorId) ? <option value={draft.sourceIndicatorId}>Base vinculada (fora desta listagem)</option> : null}{overview.indicators.filter((item) => item.id !== draft.id).map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inativo)"}</option>)}</select></Field> : null}
        </div>

        {draft.source === "transactions" ? <>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-4"><div><h3 className="text-sm font-semibold text-zinc-200">Componentes da fórmula</h3><p className="text-xs text-zinc-600">Cada componente filtra e agrega lançamentos desta competência.</p></div><button disabled={draft.components.length >= 12} className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40" onClick={() => onChange({ ...draft, components: [...draft.components, { ...newComponent(`Componente ${draft.components.length + 1}`), aggregation: draft.unit === "number" ? "count" : "sum" }] })}><Plus size={14}/>Componente</button></div>

        <div className="space-y-3">{draft.components.map((component, index) => <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3" key={component.id}>
          <div className="grid gap-2 sm:grid-cols-[92px_minmax(0,1fr)_150px_150px_auto] sm:items-end">
            <Field label="Operação"><select disabled={index === 0} value={index === 0 ? "add" : component.operation} onChange={(event) => updateComponent(component.id, { operation: event.target.value as FinancialIndicatorOperation })}><option value="add">Somar (+)</option><option value="subtract">Subtrair (−)</option></select></Field>
            <Field label="Nome do componente"><input maxLength={100} value={component.label} onChange={(event) => updateComponent(component.id, { label: event.target.value })}/></Field>
            <Field label="Cálculo"><select value={component.aggregation} onChange={(event) => updateComponent(component.id, { aggregation: event.target.value as FinancialIndicatorAggregation })}>{draft.unit === "currency" ? <><option value="sum">Somar valores</option><option value="average">Valor médio</option></> : <option value="count">Contar lançamentos</option>}</select></Field>
            <Field label="Tratamento"><select disabled={draft.unit === "number"} value={component.amountMode} onChange={(event) => updateComponent(component.id, { amountMode: event.target.value as FinancialIndicatorAmountMode })}><option value="absolute">Valor positivo</option><option value="signed">Com sinal original</option></select></Field>
            <button aria-label="Remover componente" className="flex h-[42px] w-[42px] items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-30" disabled={draft.components.length === 1} onClick={() => onChange({ ...draft, components: draft.components.filter((item) => item.id !== component.id) })} title="Remover componente"><Trash2 size={15}/></button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Direção"><select value={first(component.filters.directions)} onChange={(event) => updateFilter(component.id, "directions", event.target.value)}><option value="">Entradas e saídas</option><option value="inflow">Somente entradas</option><option value="outflow">Somente saídas</option><option value="neutral">Somente neutros</option></select></Field>
            <Field label="Natureza"><select value={first(component.filters.natureKeys)} onChange={(event) => updateFilter(component.id, "natureKeys", event.target.value)}><option value="">Todas as naturezas</option>{overview.natures.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></Field>
            <Field label="Categoria"><select value={first(component.filters.categoryIds)} onChange={(event) => updateFilter(component.id, "categoryIds", event.target.value)}><option value="">Todas as categorias</option>{overview.categories.map((item) => <option key={item.id} value={item.id}>{item.parent_id ? "↳ " : ""}{item.name}</option>)}</select></Field>
            <Field label="Conta"><select value={first(component.filters.accountIds)} onChange={(event) => updateFilter(component.id, "accountIds", event.target.value)}><option value="">Todas as contas</option>{overview.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Origem"><select value={first(component.filters.sourceTypes)} onChange={(event) => updateFilter(component.id, "sourceTypes", event.target.value)}><option value="">Todas as origens</option>{sources.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}</select></Field>
            <Field label="Revisão"><select value={first(component.filters.reviewStatuses)} onChange={(event) => updateFilter(component.id, "reviewStatuses", event.target.value)}><option value="">Qualquer situação</option><option value="reviewed">Revisados</option><option value="pending">Pendentes</option><option value="ignored">Ignorados</option></select></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><input checked={component.filters.includeInternalTransfers ?? false} onChange={(event) => updateFilter(component.id, "includeInternalTransfers", event.target.checked)} type="checkbox"/>Incluir transferências internas confirmadas neste componente</label>
        </div>)}</div>

        </> : null}
        <div className="grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2">
          <Field label="Aplicar ao resultado completo"><select value={draft.adjustmentOperation} onChange={(event) => onChange({ ...draft, adjustmentOperation: event.target.value as Draft["adjustmentOperation"] })}><option value="none">Manter resultado da base</option><option value="percentage">Calcular percentual (%)</option><option value="multiply">Multiplicar (×)</option><option value="divide">Dividir (÷)</option></select></Field>
          {draft.adjustmentOperation !== "none" ? <Field label={draft.adjustmentOperation === "percentage" ? "Percentual (%)" : draft.adjustmentOperation === "divide" ? "Divisor" : "Multiplicador"}><input inputMode="decimal" maxLength={24} placeholder={draft.adjustmentOperation === "percentage" ? "15" : "2"} value={draft.factor} onChange={(event) => onChange({ ...draft, factor: event.target.value })}/></Field> : null}
        </div>
        <p aria-live="polite" className="break-words rounded-md bg-zinc-950/60 p-3 text-sm text-amber-200">{draftExpression(draft, overview.indicators)}</p>
        {preview ? <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs uppercase text-cyan-200/70">Prévia em {draft.effectiveFrom}</p><p className="mt-1 text-2xl font-semibold text-white">{formatValue(preview.value, draft.unit)}</p></div><div className="flex flex-wrap gap-2">{preview.components.map((component) => <span className="rounded bg-zinc-950/60 px-2 py-1 text-xs text-zinc-400" key={component.componentId}>{component.operation === "subtract" ? "−" : "+"} {component.label}: {formatValue(component.value, draft.unit)}</span>)}</div></div></div> : null}
        {error ? <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
        {confirmDelete ? <div className="flex flex-col gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 sm:flex-row sm:items-center"><p className="flex-1 text-sm text-rose-100">Desativar este indicador? As competências já fechadas continuarão preservadas.</p><button className="rounded-md border border-zinc-700 px-3 py-2 text-xs" onClick={onCancelDelete}>Cancelar</button><button className="rounded-md bg-rose-500 px-3 py-2 text-xs font-semibold text-white" disabled={busy === "delete"} onClick={onDelete}>{busy === "delete" ? <Loader2 className="mr-1 inline animate-spin" size={14}/> : null}Desativar</button></div> : null}
      </fieldset>
      <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-zinc-800 bg-zinc-900 p-3 sm:flex-row sm:items-center">
        {draft.id && !confirmDelete ? <button className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10" onClick={onDelete}><Trash2 size={14}/>Desativar</button> : null}
        <div className="flex-1"/>
        <button className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800" onClick={onClose}>Cancelar</button>
        <button className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-400/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50" disabled={Boolean(busy)} onClick={onPreview}>{busy === "preview" ? <Loader2 className="animate-spin" size={15}/> : <Sigma size={15}/>}Calcular prévia</button>
        <button className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50" disabled={Boolean(busy)} onClick={onSave}>{busy === "save" ? <Loader2 className="animate-spin" size={15}/> : <Check size={15}/>}Salvar indicador</button>
      </div>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-xs font-medium text-zinc-400"><span>{label}</span>{children}</label>;
}

function newComponent(label: string): FinancialIndicatorComponent {
  return { id: crypto.randomUUID(), label, operation: "add", aggregation: "sum", amountMode: "absolute", filters: {} };
}

function formula(draft: Draft): FinancialIndicatorFormula {
  if (draft.source === "indicator" && !draft.sourceIndicatorId) throw new Error("Selecione o indicador-base.");
  const value: FinancialIndicatorFormula = draft.source === "indicator"
    ? { components: [], sourceIndicatorId: draft.sourceIndicatorId }
    : { components: draft.components.map((component, index) => ({ ...component, operation: index === 0 ? "add" : component.operation })) };
  if (draft.adjustmentOperation !== "none") {
    const text = draft.factor.trim().replace(",", ".");
    const factor = Number(text);
    if (!/^\d+(\.\d+)?$/.test(text) || !Number.isFinite(factor) || factor > 1_000_000 || (draft.adjustmentOperation === "divide" && factor === 0)) throw new Error("Informe um fator válido; o divisor deve ser maior que zero.");
    value.adjustment = { operation: draft.adjustmentOperation, factor };
  }
  return value;
}

function draftExpression(draft: Draft, indicators: FinanceIndicator[]) {
  const base = draft.source === "indicator" ? indicators.find((item) => item.id === draft.sourceIndicatorId)?.name ?? "Indicador-base"
    : draft.components.map((item, index) => `${index ? item.operation === "subtract" ? " − " : " + " : ""}${item.label || "Componente"}`).join("");
  const factor = draft.factor || "?";
  return draft.adjustmentOperation === "none" ? base : draft.adjustmentOperation === "percentage" ? `${factor}% × (${base})`
    : `(${base}) ${draft.adjustmentOperation === "divide" ? "÷" : "×"} ${factor}`;
}

function first(values?: string[]) { return values?.[0] ?? ""; }
function formatValue(value: number, unit: FinancialIndicatorUnit) {
  return unit === "currency"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100)
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
function sourceLabel(value: string) {
  return ({ nubank: "Nubank", olist: "Olist", mercado_pago: "Mercado Pago", paypal: "PayPal", generic: "CSV genérico" } as Record<string, string>)[value] ?? value;
}
function apiError(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const flattened = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const messages = [...(flattened.formErrors ?? []), ...Object.values(flattened.fieldErrors ?? {}).flat()];
    if (messages.length) return messages.join(" ");
  }
  return "Os dados informados não são válidos.";
}
