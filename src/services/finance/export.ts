import ExcelJS from "exceljs";
import type { FinancialTransactionRow } from "@/repositories/finance";

type ExportData = Awaited<ReturnType<typeof import("@/repositories/finance").getFinancialExportData>>;

export function buildFinancialCsv(data: ExportData) {
  const headers = ["Data", "Conta", "Origem", "Descrição", "Contraparte", "Direção", "Natureza", "Categoria", "Valor", "Revisão", "Conciliação"];
  const rows = data.transactions.map((item) => [
    item.transaction_date.slice(0, 10), item.account_name, item.source_type, item.original_description,
    item.counterparty ?? "", item.direction, item.nature, item.category_name ?? "",
    (Number(item.amount_cents) / 100).toFixed(2), item.review_status, item.transfer_status ?? ""
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

export async function buildFinancialWorkbook(data: ExportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pricing Pro";
  workbook.created = new Date();
  addDashboard(workbook, data);
  addTransactions(workbook, data.transactions);
  addEvolution(workbook, data);
  addImports(workbook, data.imports);
  addRules(workbook, data.rules);
  addRawData(workbook, data.rawRows);
  addPending(workbook, data.transactions);
  addReconciliation(workbook, data.transactions);
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}

function addDashboard(workbook: ExcelJS.Workbook, data: ExportData) {
  const sheet = workbook.addWorksheet("Dashboard");
  sheet.addRow(["Relatório Financeiro", data.competence]);
  sheet.addRow([]);
  const metrics = data.metrics as Record<string, number>;
  const labels: Record<string, string> = {
    externalInflowsCents: "Entradas externas", externalOutflowsCents: "Saídas externas",
    externalNetCashFlowCents: "Fluxo líquido externo", operationalRevenueCents: "Receita operacional identificada",
    operationalExpenseCents: "Despesas operacionais identificadas", operatingResultCents: "Resultado operacional identificado",
    debtPaymentsCents: "Pagamentos de dívidas", refundsNetCents: "Impacto líquido de estornos",
    unclassifiedOutflowsCents: "Saídas não classificadas", internalTransfersExcludedCents: "Transferências internas excluídas"
  };
  Object.entries(labels).forEach(([key, label]) => {
    const row = sheet.addRow([label, (metrics[key] ?? 0) / 100]);
    row.getCell(2).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  });
  sheet.addRow([]);
  sheet.addRow(["Aviso", "Resultado gerencial. Fluxo de caixa não é necessariamente lucro e não substitui a contabilidade."]);
  styleHeader(sheet, 1);
  sheet.columns = [{ width: 42 }, { width: 72 }];
}

function addTransactions(workbook: ExcelJS.Workbook, transactions: FinancialTransactionRow[]) {
  const sheet = workbook.addWorksheet("Lancamentos");
  sheet.addRow(["Data", "Conta", "Origem", "Descrição", "Contraparte", "Direção", "Natureza", "Categoria", "Valor", "Revisão", "Regra", "Transferência"]);
  transactions.forEach((item) => {
    const row = sheet.addRow([
      item.transaction_date.slice(0, 10), safeSpreadsheetText(item.account_name), item.source_type,
      safeSpreadsheetText(item.original_description), safeSpreadsheetText(item.counterparty ?? ""), item.direction,
      item.nature, item.category_name ?? "", Number(item.amount_cents) / 100, item.review_status,
      item.classification_source, item.transfer_status ?? ""
    ]);
    row.getCell(9).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  });
  styleTable(sheet, [12, 24, 18, 64, 28, 14, 24, 28, 16, 14, 18, 16]);
}

function addEvolution(workbook: ExcelJS.Workbook, data: ExportData) {
  const sheet = workbook.addWorksheet("Evolucao_Mensal");
  sheet.addRow(["Competência", "Entradas externas", "Saídas externas", "Fluxo líquido", "Resultado operacional"]);
  sheet.addRow([data.competence, data.metrics.externalInflowsCents / 100, data.metrics.externalOutflowsCents / 100,
    data.metrics.externalNetCashFlowCents / 100, data.metrics.operatingResultCents / 100]);
  for (let column = 2; column <= 5; column += 1) sheet.getRow(2).getCell(column).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  styleTable(sheet, [16, 20, 20, 20, 24]);
}

function addImports(workbook: ExcelJS.Workbook, imports: ExportData["imports"]) {
  const sheet = workbook.addWorksheet("Controle_Importacoes");
  sheet.addRow(["Arquivo", "Origem", "Status", "Linhas brutas", "Movimentações", "Duplicadas", "Ignoradas", "Entradas", "Saídas", "Importado em"]);
  imports.forEach((item) => sheet.addRow([
    safeSpreadsheetText(String(item.original_filename)), item.source_type, item.status, item.raw_row_count,
    item.transaction_row_count, item.duplicate_row_count, item.ignored_row_count,
    Number(item.credit_total_cents) / 100, Number(item.debit_total_cents) / 100, String(item.imported_at)
  ]));
  styleTable(sheet, [36, 18, 16, 14, 16, 14, 12, 16, 16, 24]);
}

function addRules(workbook: ExcelJS.Workbook, rules: ExportData["rules"]) {
  const sheet = workbook.addWorksheet("Regras_Categorizacao");
  sheet.addRow(["Nome", "Prioridade", "Origem", "Condições", "Ações", "Ativa"]);
  rules.forEach((rule) => sheet.addRow([safeSpreadsheetText(String(rule.name)), rule.priority, rule.source_type ?? "Todas",
    safeSpreadsheetText(JSON.stringify(rule.conditions)), safeSpreadsheetText(JSON.stringify(rule.actions)), rule.enabled ? "Sim" : "Não"]));
  styleTable(sheet, [36, 12, 18, 56, 56, 10]);
}

function addRawData(workbook: ExcelJS.Workbook, rows: ExportData["rawRows"]) {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const source = String(row.source_type);
    grouped.set(source, [...(grouped.get(source) ?? []), row]);
  }
  for (const [source, sourceRows] of grouped) {
    const sheet = workbook.addWorksheet(`RAW_${source}`.slice(0, 31));
    sheet.addRow(["Arquivo", "Linha", "Dados brutos"]);
    sourceRows.forEach((row) => sheet.addRow([safeSpreadsheetText(String(row.original_filename)), row.source_line_number,
      safeSpreadsheetText(JSON.stringify(row.raw_payload))]));
    styleTable(sheet, [36, 10, 120]);
  }
}

function addPending(workbook: ExcelJS.Workbook, transactions: FinancialTransactionRow[]) {
  addTransactionsSheet(workbook, "Pendencias", transactions.filter((item) => item.review_required && item.review_status === "pending"));
}

function addReconciliation(workbook: ExcelJS.Workbook, transactions: FinancialTransactionRow[]) {
  addTransactionsSheet(workbook, "Conciliacao_Olist", transactions.filter((item) => item.transfer_status || item.nature === "internal_transfer"));
}

function addTransactionsSheet(workbook: ExcelJS.Workbook, name: string, transactions: FinancialTransactionRow[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(["Data", "Conta", "Descrição", "Valor", "Natureza", "Situação"]);
  transactions.forEach((item) => {
    const row = sheet.addRow([item.transaction_date.slice(0, 10), safeSpreadsheetText(item.account_name),
      safeSpreadsheetText(item.original_description), Number(item.amount_cents) / 100, item.nature, item.transfer_status ?? item.review_status]);
    row.getCell(4).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  });
  styleTable(sheet, [12, 24, 72, 16, 24, 18]);
}

function safeSpreadsheetText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown) {
  const safe = safeSpreadsheetText(String(value ?? ""));
  return `"${safe.replace(/"/g, '""')}"`;
}

function styleTable(sheet: ExcelJS.Worksheet, widths: number[]) {
  styleHeader(sheet, 1);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
  sheet.columns = widths.map((width) => ({ width }));
}

function styleHeader(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: "FF18181B" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBBF24" } };
}
