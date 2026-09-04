import ExcelJS from "exceljs";
import type { FinancialTransactionRow } from "@/repositories/finance";

export type ExportData = Awaited<ReturnType<typeof import("@/repositories/finance").getFinancialExportData>>;

const DETAILED_HEADERS = [
  "UID", "Data", "Competência", "Conta", "Arquivo de origem", "Linha original",
  "Identificador original", "Tipo original", "Descrição original", "Contraparte", "Valor (R$)",
  "Direção", "Natureza", "Categoria", "Subcategoria", "Incluir no fluxo externo?",
  "Incluir no resultado operacional?", "Revisar?", "Chave de transferência", "Observação",
  "Entrada externa (R$)", "Saída externa (R$)", "Fluxo externo (R$)", "Resultado operacional (R$)"
] as const;

const DETAILED_WIDTHS = [
  20.42, 13.61, 14.75, 23.83, 32.91, 11.34, 27.23, 35.18, 59.02, 35.18, 15.88, 12.48,
  28.37, 27.23, 32.91, 19.29, 27.25, 12.48, 27.23, 48.8, 18.15, 18.15, 18.15, 21.56
] as const;

const CURRENCY_FORMAT = '"R$ "#,##0.00;[RED]"(R$ "#,##0.00);-';

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
  workbook.calcProperties.fullCalcOnLoad = true;
  addDashboard(workbook, data);
  addDetailedTransactions(workbook, data.transactions);
  addTransactionsSummary(workbook, data.transactions);
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

function addTransactionsSummary(workbook: ExcelJS.Workbook, transactions: FinancialTransactionRow[]) {
  const sheet = workbook.addWorksheet("Lancamentos_Resumo");
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

function addDetailedTransactions(workbook: ExcelJS.Workbook, transactions: FinancialTransactionRow[]) {
  const sheet = workbook.addWorksheet("Lancamentos");
  sheet.addRow([...DETAILED_HEADERS]);
  sheet.getRow(1).height = 34;
  sheet.columns = DETAILED_WIDTHS.map((width) => ({ width }));

  [...transactions]
    .sort((left, right) => left.transaction_date.localeCompare(right.transaction_date)
      || left.account_name.localeCompare(right.account_name, "pt-BR")
      || left.source_line_number - right.source_line_number)
    .forEach((item, index) => {
    const rowNumber = index + 2;
    const amount = Number(item.amount_cents) / 100;
    const transactionDate = spreadsheetDate(item.transaction_date);
    const competenceDate = spreadsheetDate(item.competence);
    const includeExternal = yesNo(item.include_external_cash_flow);
    const includeOperating = yesNo(item.include_operating_result);
    const review = yesNo(item.review_required && item.review_status === "pending");
    const row = sheet.addRow([
      transactionUid(item.id),
      transactionDate,
      { formula: `DATE(YEAR(B${rowNumber}),MONTH(B${rowNumber}),1)`, result: competenceDate },
      safeSpreadsheetText(item.account_name),
      safeSpreadsheetText(item.import_filename),
      item.source_line_number,
      safeSpreadsheetText(item.source_identifier ?? ""),
      safeSpreadsheetText(originalTransactionType(item)),
      safeSpreadsheetText(item.original_description),
      safeSpreadsheetText(item.counterparty ?? ""),
      amount,
      { formula: `IF(K${rowNumber}>0,"Entrada",IF(K${rowNumber}<0,"Saída","Neutro"))`, result: directionLabel(item.direction) },
      safeSpreadsheetText(item.nature_name ?? humanizeNature(item.nature)),
      safeSpreadsheetText(item.category_parent_name ?? item.category_name ?? "A classificar"),
      safeSpreadsheetText(item.subcategory_name ?? ""),
      includeExternal,
      includeOperating,
      review,
      safeSpreadsheetText(item.transfer_key ?? ""),
      safeSpreadsheetText(item.notes ?? ""),
      { formula: `IF(AND(P${rowNumber}="Sim",K${rowNumber}>0),K${rowNumber},0)`, result: includeExternal === "Sim" && amount > 0 ? amount : 0 },
      { formula: `IF(AND(P${rowNumber}="Sim",K${rowNumber}<0),-K${rowNumber},0)`, result: includeExternal === "Sim" && amount < 0 ? -amount : 0 },
      { formula: `IF(P${rowNumber}="Sim",K${rowNumber},0)`, result: includeExternal === "Sim" ? amount : 0 },
      { formula: `IF(Q${rowNumber}="Sim",K${rowNumber},0)`, result: includeOperating === "Sim" ? amount : 0 }
    ]);

    row.font = { name: "Calibri", size: 11 };
    for (let column = 1; column <= 20; column += 1) {
      row.getCell(column).font = { name: "Calibri", size: 11, color: { argb: "FF0000FF" } };
    }
    row.getCell(2).numFmt = "dd/mm/yyyy";
    row.getCell(3).numFmt = "mmm/yyyy";
    for (const column of [11, 21, 22, 23, 24]) row.getCell(column).numFmt = CURRENCY_FORMAT;
    for (const column of [16, 17, 18]) {
      row.getCell(column).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"Sim,Não"'],
        showErrorMessage: true,
        errorTitle: "Valor inválido",
        error: "Escolha Sim ou Não."
      };
    }
    });

  styleDetailedHeader(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  sheet.autoFilter = { from: "A1", to: `X${Math.max(1, sheet.rowCount)}` };
  sheet.addConditionalFormatting({
    ref: `R2:R${Math.max(2, sheet.rowCount)}`,
    rules: [{
      type: "expression",
      priority: 1,
      formulae: ['R2="Sim"'],
      style: {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } },
        font: { bold: true, color: { argb: "FF92400E" } }
      }
    }]
  });
  sheet.addConditionalFormatting({
    ref: `N2:N${Math.max(2, sheet.rowCount)}`,
    rules: [{
      type: "expression",
      priority: 2,
      formulae: ['N2="A classificar"'],
      style: {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } },
        font: { bold: true, color: { argb: "FF991B1B" } }
      }
    }]
  });
  sheet.pageSetup = {
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.7875, right: 0.7875, top: 1.025, bottom: 1.025, header: 0.7875, footer: 0.7875 }
  };
  sheet.headerFooter.oddHeader = "&C&A";
  sheet.headerFooter.oddFooter = "&CPágina &P de &N";
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

function styleDetailedHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function transactionUid(id: string) {
  return id.replace(/[^a-f0-9]/gi, "").slice(0, 16).toUpperCase() || id.slice(0, 16).toUpperCase();
}

function spreadsheetDate(value: string) {
  const date = value.slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function yesNo(value: boolean) {
  return value ? "Sim" : "Não";
}

function directionLabel(direction: FinancialTransactionRow["direction"]) {
  if (direction === "inflow") return "Entrada";
  if (direction === "outflow") return "Saída";
  return "Neutro";
}

function humanizeNature(value: string) {
  return value.replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function originalTransactionType(item: FinancialTransactionRow) {
  const payload = item.raw_payload ?? {};
  const preferredKeys = [
    "TRANSACTION_TYPE", "Tipo", "TYPE", "Type", "tipo", "Descrição", "Descricao", "Description", "description"
  ];
  for (const preferredKey of preferredKeys) {
    const exact = payload[preferredKey];
    if (typeof exact === "string" && exact.trim()) return exact.trim().split(/\s+-\s+/)[0];
    const matchedKey = Object.keys(payload).find((key) => key.toLocaleLowerCase("pt-BR") === preferredKey.toLocaleLowerCase("pt-BR"));
    const value = matchedKey ? payload[matchedKey] : null;
    if (typeof value === "string" && value.trim()) return value.trim().split(/\s+-\s+/)[0];
  }
  return item.original_description.split(/\s+-\s+/)[0] || item.source_type;
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
