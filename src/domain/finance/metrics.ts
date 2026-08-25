export type FinancialMetricTransaction = {
  amountCents: number;
  direction: "inflow" | "outflow" | "neutral";
  nature: string;
  includeExternalCashFlow: boolean;
  includeOperatingResult: boolean;
  internalTransferConfirmed?: boolean;
  reviewRequired?: boolean;
  reviewStatus?: string;
};

export type FinancialMetrics = ReturnType<typeof calculateFinancialMetrics>;

export function calculateFinancialMetrics(transactions: FinancialMetricTransaction[]) {
  const external = transactions.filter((item) => item.includeExternalCashFlow && !item.internalTransferConfirmed);
  const externalInflowsCents = sum(external.filter((item) => item.amountCents > 0).map((item) => item.amountCents));
  const externalOutflowsCents = Math.abs(sum(external.filter((item) => item.amountCents < 0).map((item) => item.amountCents)));
  const operatingResultCents = sum(transactions.filter((item) => item.includeOperatingResult).map((item) => item.amountCents));
  const operationalRevenueCents = sum(transactions.filter((item) => item.nature === "operating_revenue").map((item) => Math.max(0, item.amountCents)));
  const operationalExpenseCents = Math.abs(sum(transactions.filter((item) => item.nature === "operating_expense").map((item) => Math.min(0, item.amountCents))));
  return {
    transactionCount: transactions.filter((item) => item.direction !== "neutral").length,
    externalInflowsCents,
    externalOutflowsCents,
    externalNetCashFlowCents: externalInflowsCents - externalOutflowsCents,
    operationalRevenueCents,
    operationalExpenseCents,
    operatingResultCents,
    debtPaymentsCents: Math.abs(sum(transactions.filter((item) => item.nature === "debt" && item.amountCents < 0).map((item) => item.amountCents))),
    refundsNetCents: sum(transactions.filter((item) => item.nature === "refund").map((item) => item.amountCents)),
    unclassifiedOutflowsCents: Math.abs(sum(transactions.filter((item) => item.nature === "unclassified" && item.amountCents < 0).map((item) => item.amountCents))),
    internalTransfersExcludedCents: Math.abs(sum(transactions.filter((item) => item.internalTransferConfirmed && item.amountCents < 0).map((item) => item.amountCents))),
    reviewCount: transactions.filter((item) => item.reviewRequired && item.reviewStatus !== "reviewed").length,
    unclassifiedCount: transactions.filter((item) => item.nature === "unclassified").length
  };
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }

