export type TenantFinancialContext = { userId: string; tenantId: string };
export type FinancialMatchCriteria = { dateFrom: string; dateTo: string; limit?: number };
export type ExternalFinancialAccount = { id: string; name: string; type?: string; raw: unknown };
export type ExternalFinancialTransaction = {
  id: string; recordType: "accounts_receivable" | "accounts_payable";
  date: string | null; dueDate: string | null; amountCents: number | null;
  status: string | null; counterparty: string | null; document: string | null; raw: unknown;
};

export interface FinancialIntegrationProvider {
  readonly provider: string;
  readonly capabilities: { listAccounts: boolean; readTransactions: boolean; createTransaction: boolean; createTransfer: boolean; reconcile: boolean };
  listAccounts(context: TenantFinancialContext): Promise<ExternalFinancialAccount[]>;
  searchTransactions(context: TenantFinancialContext, criteria: FinancialMatchCriteria): Promise<ExternalFinancialTransaction[]>;
}

