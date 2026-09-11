export type MonthlyFinancialPoint = {
  competence: string;
  balanceCents: number;
  externalInflowsCents: number;
  externalOutflowsCents: number;
  operatingResultCents: number;
  transactionCount: number;
  pendingCount: number;
};
export type FinancialSeriesMetric = "balanceCents" | "externalInflowsCents" | "externalOutflowsCents" | "operatingResultCents";
export type MonthlyFinancialGroup = { id: string; name: string; series: MonthlyFinancialPoint[] };
export type MonthlyGroupRow = {
  dimension: "category" | "nature"; group_id: string; group_name: string; competence: string;
  balance_cents: string; external_inflows_cents: string; external_outflows_cents: string;
  operating_result_cents: string; transaction_count: string; pending_count: string;
};

export function summarizeFilteredTransactions(rows: Array<{ amount_cents: string | number; direction: string }>) {
  let inflowsCents = 0, outflowsCents = 0, informativeCount = 0;
  for (const row of rows) {
    if (row.direction === "neutral") { informativeCount++; continue; }
    const amount = Number(row.amount_cents);
    if (amount >= 0) inflowsCents += amount;
    else outflowsCents -= amount;
  }
  return { inflowsCents, outflowsCents, balanceCents: inflowsCents - outflowsCents, informativeCount };
}

export function buildMonthlyGroups(periods: string[], rows: MonthlyGroupRow[]) {
  const maps = { category: new Map<string, MonthlyFinancialGroup>(), nature: new Map<string, MonthlyFinancialGroup>() };
  for (const row of rows) {
    const map = maps[row.dimension];
    if (!map.has(row.group_id)) map.set(row.group_id, { id: row.group_id, name: row.group_name, series: periods.map(competence => ({ competence, balanceCents: 0, externalInflowsCents: 0, externalOutflowsCents: 0, operatingResultCents: 0, transactionCount: 0, pendingCount: 0 })) });
    const point = map.get(row.group_id)!.series.find(item => item.competence === row.competence.slice(0, 7));
    if (point) Object.assign(point, { balanceCents: Number(row.balance_cents), externalInflowsCents: Number(row.external_inflows_cents), externalOutflowsCents: Number(row.external_outflows_cents), operatingResultCents: Number(row.operating_result_cents), transactionCount: Number(row.transaction_count), pendingCount: Number(row.pending_count) });
  }
  const ordered = (map: Map<string, MonthlyFinancialGroup>) => [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
  return { categories: ordered(maps.category), natures: ordered(maps.nature) };
}
