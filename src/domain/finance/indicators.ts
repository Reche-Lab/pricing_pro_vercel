export type FinancialIndicatorUnit = "currency" | "number";
export type FinancialIndicatorOperation = "add" | "subtract";
export type FinancialIndicatorAggregation = "sum" | "average" | "count";
export type FinancialIndicatorAmountMode = "absolute" | "signed";

export type FinancialIndicatorFilters = {
  directions?: Array<"inflow" | "outflow" | "neutral">;
  natureKeys?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  accountIds?: string[];
  sourceTypes?: string[];
  reviewStatuses?: string[];
  includeInternalTransfers?: boolean;
};

export type FinancialIndicatorComponent = {
  id: string;
  label: string;
  operation: FinancialIndicatorOperation;
  aggregation: FinancialIndicatorAggregation;
  amountMode: FinancialIndicatorAmountMode;
  filters: FinancialIndicatorFilters;
};

export type FinancialIndicatorFormula = {
  components: FinancialIndicatorComponent[];
  sourceIndicatorId?: string;
  adjustment?: { operation: "percentage" | "multiply" | "divide"; factor: number };
};

export type FinancialIndicatorTransaction = {
  id: string;
  amountCents: number;
  direction: "inflow" | "outflow" | "neutral";
  nature: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  accountId: string;
  sourceType: string;
  reviewStatus: string;
  internalTransferConfirmed?: boolean;
};

export type FinancialIndicatorComponentResult = {
  componentId: string;
  label: string;
  operation: FinancialIndicatorOperation;
  aggregation: FinancialIndicatorAggregation;
  matchedCount: number;
  value: number;
  contribution: number;
  transactionIds: string[];
  sourceIndicatorId?: string;
  sourceVersionId?: string;
};

export class FinancialIndicatorError extends Error {}

export type FinancialIndicatorEvaluation = { value: number; components: FinancialIndicatorComponentResult[] };
export type FinancialIndicatorDefinition = {
  id: string; name: string; unit: FinancialIndicatorUnit; formula: FinancialIndicatorFormula;
  versionId?: string; frozen?: FinancialIndicatorEvaluation;
};

export function createFinancialIndicatorResolver(definitions: FinancialIndicatorDefinition[], transactions: FinancialIndicatorTransaction[]) {
  const byId = new Map(definitions.map((item) => [item.id, item]));
  const cache = new Map<string, FinancialIndicatorEvaluation>();
  const visiting = new Set<string>();
  function resolve(id: string): FinancialIndicatorEvaluation {
    const definition = byId.get(id);
    if (!definition) throw new FinancialIndicatorError("O indicador-base não está disponível nesta competência.");
    if (visiting.has(id)) throw new FinancialIndicatorError("A fórmula cria uma dependência circular entre indicadores.");
    const cached = cache.get(id);
    if (cached) return cached;
    if (definition.frozen) { cache.set(id, definition.frozen); return definition.frozen; }
    visiting.add(id);
    try {
      const result = evaluateFinancialIndicator(definition.formula, transactions, (sourceId) => {
        const source = byId.get(sourceId);
        if (!source) throw new FinancialIndicatorError("O indicador-base não está disponível nesta competência.");
        if (source.unit !== definition.unit) throw new FinancialIndicatorError("O indicador e sua base precisam usar o mesmo formato de valor.");
        return { ...resolve(sourceId), name: source.name, versionId: source.versionId };
      });
      cache.set(id, result);
      return result;
    } finally { visiting.delete(id); }
  }
  return resolve;
}

export function describeIndicatorAdjustment(adjustment?: FinancialIndicatorFormula["adjustment"]) {
  if (!adjustment) return "";
  const factor = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(adjustment.factor);
  return adjustment.operation === "percentage" ? `${factor}% do resultado-base`
    : adjustment.operation === "divide" ? `Resultado-base ÷ ${factor}` : `Resultado-base × ${factor}`;
}

export function validateFinancialIndicatorVersions(versions: Array<FinancialIndicatorDefinition & { effective_from: string; version: number }>) {
  // A future version can introduce a cycle even when the current competence is valid.
  for (const date of new Set(versions.map((item) => item.effective_from))) {
    const selected = new Map<string, typeof versions[number]>();
    for (const item of versions.filter((item) => item.effective_from <= date)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from) || a.version - b.version)) selected.set(item.id, item);
    const resolve = createFinancialIndicatorResolver([...selected.values()], []);
    for (const id of selected.keys()) resolve(id);
  }
}

export function evaluateFinancialIndicator(
  formula: FinancialIndicatorFormula,
  transactions: FinancialIndicatorTransaction[],
  resolveSource?: (id: string) => FinancialIndicatorEvaluation & { name: string; versionId?: string }
) {
  if (formula.sourceIndicatorId && formula.components.length) throw new FinancialIndicatorError("Escolha lançamentos ou um indicador como base do cálculo.");
  let components: FinancialIndicatorComponentResult[];
  if (formula.sourceIndicatorId) {
    if (!resolveSource) throw new FinancialIndicatorError("O indicador-base não está disponível nesta competência.");
    const source = resolveSource(formula.sourceIndicatorId);
    const transactionIds = [...new Set(source.components.flatMap((component) => component.transactionIds))];
    components = [{ componentId: `indicator:${formula.sourceIndicatorId}`, label: source.name,
      operation: "add", aggregation: "sum", matchedCount: transactionIds.length, value: source.value,
      contribution: source.value, transactionIds, sourceIndicatorId: formula.sourceIndicatorId, sourceVersionId: source.versionId }];
  } else components = formula.components.map((component) => {
    const matches = transactions.filter((transaction) => matchesFilters(transaction, component.filters));
    const values = matches.map((transaction) => component.amountMode === "absolute"
      ? Math.abs(transaction.amountCents)
      : transaction.amountCents);
    const value = component.aggregation === "count"
      ? matches.length
      : component.aggregation === "average"
        ? round(values.reduce((total, amount) => total + amount, 0) / Math.max(1, values.length))
        : values.reduce((total, amount) => total + amount, 0);
    const contribution = component.operation === "subtract" ? -value : value;
    return {
      componentId: component.id,
      label: component.label,
      operation: component.operation,
      aggregation: component.aggregation,
      matchedCount: matches.length,
      value,
      contribution,
      transactionIds: matches.map((transaction) => transaction.id)
    } satisfies FinancialIndicatorComponentResult;
  });

  const baseValue = components.reduce((total, component) => total + component.contribution, 0);
  const adjustment = formula.adjustment;
  if (adjustment && (!Number.isFinite(adjustment.factor) || adjustment.factor < 0 || (adjustment.operation === "divide" && adjustment.factor === 0))) {
    throw new FinancialIndicatorError("Informe um fator válido; o divisor deve ser maior que zero.");
  }
  const value = !adjustment ? baseValue : adjustment.operation === "divide" ? baseValue / adjustment.factor
    : adjustment.operation === "percentage" ? baseValue * (adjustment.factor / 100) : baseValue * adjustment.factor;
  if (!Number.isFinite(value) || Math.abs(value) >= 1e14) throw new FinancialIndicatorError("O resultado excede o limite permitido para indicadores.");
  return { value: round(value), components };
}

function matchesFilters(transaction: FinancialIndicatorTransaction, filters: FinancialIndicatorFilters) {
  if (!filters.includeInternalTransfers && transaction.internalTransferConfirmed) return false;
  if (filters.directions?.length && !filters.directions.includes(transaction.direction)) return false;
  if (filters.natureKeys?.length && !filters.natureKeys.includes(transaction.nature)) return false;
  if (filters.categoryIds?.length && !filters.categoryIds.some((id) => id === transaction.categoryId || id === transaction.subcategoryId)) return false;
  if (filters.subcategoryIds?.length && (!transaction.subcategoryId || !filters.subcategoryIds.includes(transaction.subcategoryId))) return false;
  if (filters.accountIds?.length && !filters.accountIds.includes(transaction.accountId)) return false;
  if (filters.sourceTypes?.length && !filters.sourceTypes.includes(transaction.sourceType)) return false;
  if (filters.reviewStatuses?.length && !filters.reviewStatuses.includes(transaction.reviewStatus)) return false;
  return true;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
