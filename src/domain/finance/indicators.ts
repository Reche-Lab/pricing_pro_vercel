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
};

export function evaluateFinancialIndicator(
  formula: FinancialIndicatorFormula,
  transactions: FinancialIndicatorTransaction[]
) {
  const components = formula.components.map((component) => {
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

  return {
    value: round(components.reduce((total, component) => total + component.contribution, 0)),
    components
  };
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
