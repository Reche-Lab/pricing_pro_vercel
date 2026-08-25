import {
  decodeCsv,
  normalizeText,
  parseCsv,
  parseMoneyToCents,
  parseStatementDate,
  rowsToRecords
} from "@/domain/finance/csv";
import type {
  BankStatementAdapter,
  FileMetadata,
  ImportInput,
  NormalizedFinancialTransaction,
  ParsedStatement,
  RawCsvRow,
  ValidationResult
} from "@/domain/finance/types";

abstract class CsvAdapter implements BankStatementAdapter {
  abstract canHandle(input: FileMetadata, sampleRows: RawCsvRow[]): Promise<number>;
  abstract parse(input: ImportInput): Promise<ParsedStatement>;
  abstract getSourceType(): ParsedStatement["sourceType"];

  validate(statement: ParsedStatement): ValidationResult {
    const errors: string[] = [];
    if (statement.transactions.length === 0) errors.push("Nenhuma movimentação válida foi encontrada.");
    if (statement.transactions.some((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.transactionDate))) {
      errors.push("Há datas inválidas no extrato.");
    }
    return { valid: errors.length === 0, errors, warnings: statement.warnings };
  }
}

export class NubankStatementAdapter extends CsvAdapter {
  getSourceType() { return "nubank" as const; }
  async canHandle(input: FileMetadata) {
    if (input.headers.some((header) => normalizeText(header) === "ORIGEM / DESTINO")) return 0;
    return hasHeaders(input.headers, ["Data", "Valor", "Identificador", "Descrição"]) ? 0.99 : 0;
  }
  async parse(input: ImportInput): Promise<ParsedStatement> {
    const { headers, records } = tabularRows(input.text);
    const transactions = records.map((row) => normalizeRow({
      row, input, sourceType: "nubank", date: row.values.Data, amount: row.values.Valor,
      identifier: row.values.Identificador, description: row.values["Descrição"],
      counterparty: extractPixCounterparty(row.values["Descrição"])
    }));
    return statement("Nubank CSV", "nubank", headers, records, transactions);
  }
}

export class OlistStatementAdapter extends CsvAdapter {
  getSourceType() { return "olist" as const; }
  async canHandle(input: FileMetadata) {
    return hasHeaders(input.headers, ["Data", "Valor", "Origem / Destino", "Descrição"]) ? 1 : 0;
  }
  async parse(input: ImportInput): Promise<ParsedStatement> {
    const { headers, records } = tabularRows(input.text);
    const transactions = records.map((row) => {
      const description = row.values["Descrição"];
      const informative = normalizeText(description).includes("SALDO DE FECHAMENTO");
      return normalizeRow({
        row, input, sourceType: "olist", date: row.values.Data, amount: row.values.Valor,
        identifier: row.values.Identificador === "-" ? undefined : row.values.Identificador,
        description, counterparty: emptyToUndefined(row.values["Origem / Destino"]), informative
      });
    });
    return statement("Olist Conta Digital CSV", "olist", headers, records, transactions);
  }
}

export class MercadoPagoStatementAdapter extends CsvAdapter {
  getSourceType() { return "mercado_pago" as const; }
  async canHandle(input: FileMetadata, sampleRows: RawCsvRow[]) {
    const allHeaders = [input.headers.join("|"), ...sampleRows.map((row) => [...Object.keys(row.values), ...Object.values(row.values)].join("|"))].join("|");
    return allHeaders.includes("TRANSACTION_NET_AMOUNT") && allHeaders.includes("REFERENCE_ID") ? 1 : 0;
  }
  async parse(input: ImportInput): Promise<ParsedStatement> {
    const parsed = parseCsv(input.text);
    const summaryIndex = parsed.rows.findIndex((row) => row.cells.includes("INITIAL_BALANCE"));
    const transactionIndex = parsed.rows.findIndex((row) => row.cells.includes("RELEASE_DATE"));
    if (transactionIndex < 0) throw new Error("Cabeçalho de movimentações do Mercado Pago não encontrado.");
    const headers = parsed.rows[transactionIndex].cells;
    const records = rowsToRecords(headers, parsed.rows.slice(transactionIndex + 1));
    const summary = summaryIndex >= 0 ? parsed.rows[summaryIndex + 1]?.cells : undefined;
    const transactions = records.map((row) => normalizeRow({
      row, input, sourceType: "mercado_pago", date: row.values.RELEASE_DATE,
      amount: row.values.TRANSACTION_NET_AMOUNT, identifier: row.values.REFERENCE_ID,
      description: row.values.TRANSACTION_TYPE
    }));
    return {
      ...statement("Mercado Pago CSV", "mercado_pago", headers, records, transactions),
      initialBalanceCents: summary ? parseMoneyToCents(summary[0]) : undefined,
      finalBalanceCents: summary ? parseMoneyToCents(summary[3]) : undefined
    };
  }
}

export class PayPalStatementAdapter extends CsvAdapter {
  getSourceType() { return "paypal" as const; }
  async canHandle(input: FileMetadata) {
    const normalized = input.headers.map(normalizeText);
    return normalized.includes("ID DA TRANSACAO") && normalized.some((header) => header.includes("MOEDA")) ? 0.95 : 0;
  }
  async parse(input: ImportInput): Promise<ParsedStatement> {
    const { headers, records } = tabularRows(input.text);
    const pick = (row: RawCsvRow, candidates: string[]) => {
      const key = Object.keys(row.values).find((header) => candidates.includes(normalizeText(header)));
      return key ? row.values[key] : "";
    };
    const transactions = records.map((row) => normalizeRow({
      row, input, sourceType: "paypal", date: pick(row, ["DATA", "DATE"]),
      amount: pick(row, ["LIQUIDO", "NET", "VALOR LIQUIDO"]),
      identifier: pick(row, ["ID DA TRANSACAO", "TRANSACTION ID"]),
      description: pick(row, ["NOME", "NAME", "TIPO", "TYPE"]),
      counterparty: pick(row, ["NOME", "NAME"]),
      currency: pick(row, ["MOEDA", "CURRENCY"]) || "BRL",
      grossAmount: pick(row, ["BRUTO", "GROSS"]), feeAmount: pick(row, ["TARIFA", "FEE"])
    }));
    return statement("PayPal CSV", "paypal", headers, records, transactions);
  }
}

export class GenericStatementAdapter extends CsvAdapter {
  getSourceType() { return "generic" as const; }
  async canHandle() { return 0.1; }
  async parse(input: ImportInput): Promise<ParsedStatement> {
    if (!input.mapping) throw new Error("O CSV não foi reconhecido. Configure o mapeamento de colunas.");
    const { headers, records } = tabularRows(input.text);
    const mapping = input.mapping;
    const transactions = records.map((row) => {
      const amount = mapping.amount
        ? row.values[mapping.amount]
        : String(parseMoneyToCents(row.values[mapping.credit ?? ""]) - Math.abs(parseMoneyToCents(row.values[mapping.debit ?? ""])));
      return normalizeRow({
        row, input, sourceType: "generic", date: row.values[mapping.date], amount,
        amountIsCents: !mapping.amount, identifier: mapping.identifier ? row.values[mapping.identifier] : undefined,
        description: row.values[mapping.description], counterparty: mapping.counterparty ? row.values[mapping.counterparty] : undefined,
        currency: mapping.currency ? row.values[mapping.currency] : "BRL"
      });
    });
    return statement("CSV genérico", "generic", headers, records, transactions);
  }
}

export const statementAdapters: BankStatementAdapter[] = [
  new NubankStatementAdapter(), new OlistStatementAdapter(), new MercadoPagoStatementAdapter(),
  new PayPalStatementAdapter(), new GenericStatementAdapter()
];

export async function detectAndParseStatement(input: ImportInput) {
  const parsed = parseCsv(input.text);
  const candidateHeaders = parsed.rows.map((row) => row.cells).find((cells) => cells.length > 2) ?? [];
  const metadata: FileMetadata = {
    filename: input.filename, contentType: input.contentType, size: input.bytes.length, headers: candidateHeaders
  };
  const sampleRows = rowsToRecords(candidateHeaders, parsed.rows.slice(1, 6));
  const scored = await Promise.all(statementAdapters.map(async (adapter) => ({ adapter, score: await adapter.canHandle(metadata, sampleRows) })));
  scored.sort((left, right) => right.score - left.score);
  const winner = scored[0];
  if (!winner || winner.score < 0.5) {
    if (!input.mapping) return { status: "needs_mapping" as const, confidence: winner?.score ?? 0, headers: candidateHeaders };
  }
  const adapter = input.mapping ? new GenericStatementAdapter() : winner.adapter;
  const statement = await adapter.parse(input);
  const validation = adapter.validate(statement);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  return { status: "parsed" as const, confidence: winner?.score ?? 1, statement };
}

function tabularRows(text: string) {
  const parsed = parseCsv(text);
  const headerIndex = parsed.rows.findIndex((row) => row.cells.length > 2);
  if (headerIndex < 0) throw new Error("Cabeçalho CSV não encontrado.");
  const headers = parsed.rows[headerIndex].cells;
  return { headers, records: rowsToRecords(headers, parsed.rows.slice(headerIndex + 1)) };
}

function normalizeRow(input: {
  row: RawCsvRow; input: ImportInput; sourceType: NormalizedFinancialTransaction["sourceType"];
  date: string; amount: string; amountIsCents?: boolean; identifier?: string; description: string;
  counterparty?: string; informative?: boolean; currency?: string; grossAmount?: string; feeAmount?: string;
}): NormalizedFinancialTransaction {
  const amountCents = input.amountIsCents ? Number(input.amount) : parseMoneyToCents(input.amount);
  const date = parseStatementDate(input.date);
  const informative = Boolean(input.informative);
  return {
    sourceIdentifier: emptyToUndefined(input.identifier), sourceLineNumber: input.row.lineNumber,
    transactionDate: date, competence: `${date.slice(0, 7)}-01`,
    originalDescription: input.description.trim(), normalizedDescription: normalizeText(input.description),
    counterparty: emptyToUndefined(input.counterparty), amountCents,
    currency: (input.currency || "BRL").slice(0, 3).toUpperCase(),
    grossAmountCents: input.grossAmount ? parseMoneyToCents(input.grossAmount) : undefined,
    feeAmountCents: input.feeAmount ? parseMoneyToCents(input.feeAmount) : undefined,
    netAmountCents: amountCents,
    direction: informative ? "neutral" : amountCents > 0 ? "inflow" : amountCents < 0 ? "outflow" : "neutral",
    sourceType: input.sourceType, nature: informative ? "informative" : "unclassified",
    includeExternalCashFlow: !informative, includeOperatingResult: false,
    reviewRequired: !informative, rawData: input.row.values
  };
}

function statement(adapterName: string, sourceType: ParsedStatement["sourceType"], headers: string[], rawRows: RawCsvRow[], transactions: NormalizedFinancialTransaction[]): ParsedStatement {
  return { sourceType, adapterName, adapterVersion: "1.0.0", currency: transactions[0]?.currency ?? "BRL", headers, rawRows, transactions, ignoredRows: 0, warnings: [] };
}

function hasHeaders(headers: string[], expected: string[]) {
  const available = new Set(headers.map(normalizeText));
  return expected.every((header) => available.has(normalizeText(header)));
}

function extractPixCounterparty(description: string) {
  const match = /PIX\s+-\s+(.+?)\s+-\s+(?:\*|•|\d)/i.exec(description);
  return match?.[1]?.trim();
}

function emptyToUndefined(value?: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "-" ? trimmed : undefined;
}

export function readStatementText(bytes: Uint8Array) { return decodeCsv(bytes); }
