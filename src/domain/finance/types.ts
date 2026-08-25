export type FinancialSourceType = "nubank" | "olist" | "mercado_pago" | "paypal" | "generic";
export type FinancialDirection = "inflow" | "outflow" | "neutral";

export type RawCsvRow = {
  lineNumber: number;
  values: Record<string, string>;
};

export type FileMetadata = {
  filename: string;
  contentType: string;
  size: number;
  headers: string[];
};

export type NormalizedFinancialTransaction = {
  sourceIdentifier?: string;
  sourceLineNumber: number;
  transactionDate: string;
  competence: string;
  originalDescription: string;
  normalizedDescription: string;
  counterparty?: string;
  amountCents: number;
  currency: string;
  grossAmountCents?: number;
  feeAmountCents?: number;
  netAmountCents?: number;
  direction: FinancialDirection;
  sourceType: FinancialSourceType;
  nature: string;
  includeExternalCashFlow: boolean;
  includeOperatingResult: boolean;
  reviewRequired: boolean;
  rawData: Record<string, string>;
};

export type ParsedStatement = {
  sourceType: FinancialSourceType;
  adapterName: string;
  adapterVersion: string;
  currency: string;
  headers: string[];
  rawRows: RawCsvRow[];
  transactions: NormalizedFinancialTransaction[];
  ignoredRows: number;
  initialBalanceCents?: number;
  finalBalanceCents?: number;
  warnings: string[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type GenericColumnMapping = {
  date: string;
  description: string;
  identifier?: string;
  counterparty?: string;
  amount?: string;
  credit?: string;
  debit?: string;
  currency?: string;
  balance?: string;
  dateFormat?: "dd/MM/yyyy" | "dd-MM-yyyy" | "yyyy-MM-dd";
};

export type ImportInput = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  text: string;
  competence: string;
  mapping?: GenericColumnMapping;
};

export interface BankStatementAdapter {
  canHandle(input: FileMetadata, sampleRows: RawCsvRow[]): Promise<number>;
  parse(input: ImportInput): Promise<ParsedStatement>;
  validate(statement: ParsedStatement): ValidationResult;
  getSourceType(): FinancialSourceType;
}

export type ClassificationRule = {
  id: string;
  priority: number;
  sourceType?: string | null;
  financialAccountId?: string | null;
  conditions: {
    descriptionContains?: string;
    descriptionStartsWith?: string;
    regex?: string;
    direction?: FinancialDirection;
    minimumAmountCents?: number;
    maximumAmountCents?: number;
    exactAmountCents?: number;
  };
  actions: {
    nature: string;
    categoryId?: string | null;
    categoryName?: string | null;
    includeExternalCashFlow?: boolean;
    includeOperatingResult?: boolean;
    reviewRequired?: boolean;
  };
};

export type ClassifiedTransaction = NormalizedFinancialTransaction & {
  categoryId?: string | null;
  classificationRuleId?: string;
  classificationConfidence: number;
  classificationSource: string;
};
