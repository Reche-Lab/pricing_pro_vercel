import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildFinancialWorkbook, type ExportData } from "@/services/finance/export";

describe("financial Excel export", () => {
  it("includes the detailed Lancamentos model and preserves the summary sheet", async () => {
    const buffer = await buildFinancialWorkbook(exportFixture());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("Lancamentos");
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("Lancamentos_Resumo");

    const sheet = workbook.getWorksheet("Lancamentos");
    expect(sheet).toBeDefined();
    expect(sheet?.columnCount).toBe(24);
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      "UID", "Data", "Competência", "Conta", "Arquivo de origem", "Linha original",
      "Identificador original", "Tipo original", "Descrição original", "Contraparte", "Valor (R$)",
      "Direção", "Natureza", "Categoria", "Subcategoria", "Incluir no fluxo externo?",
      "Incluir no resultado operacional?", "Revisar?", "Chave de transferência", "Observação",
      "Entrada externa (R$)", "Saída externa (R$)", "Fluxo externo (R$)", "Resultado operacional (R$)"
    ]);
  });

  it("fills traceability, classification and calculated values whenever available", async () => {
    const buffer = await buildFinancialWorkbook(exportFixture());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    const sheet = workbook.getWorksheet("Lancamentos");
    const row = sheet?.getRow(2);

    expect(row?.getCell(1).value).toBe("A7D1A07C250D435F");
    expect(row?.getCell(4).value).toBe("Nubank");
    expect(row?.getCell(5).value).toBe("extrato.csv");
    expect(row?.getCell(6).value).toBe(17);
    expect(row?.getCell(7).value).toBe("NU-123");
    expect(row?.getCell(8).value).toBe("Transferência enviada pelo Pix");
    expect(row?.getCell(9).value).toBe("'=descrição potencialmente perigosa");
    expect(row?.getCell(13).value).toBe("Despesa operacional");
    expect(row?.getCell(14).value).toBe("Despesas operacionais");
    expect(row?.getCell(15).value).toBe("Sistemas e software");
    expect(row?.getCell(16).value).toBe("Sim");
    expect(row?.getCell(17).value).toBe("Sim");
    expect(row?.getCell(18).value).toBe("Não");
    expect(row?.getCell(19).value).toBe("TRF-1234567890ABCDEF");
    expect(row?.getCell(20).value).toBe("Assinatura mensal");

    expect(row?.getCell(21).value).toMatchObject({ formula: 'IF(AND(P2="Sim",K2>0),K2,0)' });
    expect(row?.getCell(22).value).toMatchObject({ formula: 'IF(AND(P2="Sim",K2<0),-K2,0)', result: 181.42 });
    expect(row?.getCell(23).value).toMatchObject({ formula: 'IF(P2="Sim",K2,0)', result: -181.42 });
    expect(row?.getCell(24).value).toMatchObject({ formula: 'IF(Q2="Sim",K2,0)', result: -181.42 });
    expect(row?.getCell(16).dataValidation.formulae).toEqual(['"Sim,Não"']);
  });
});

function exportFixture() {
  return {
    competence: "2026-07",
    metrics: {
      externalInflowsCents: 0,
      externalOutflowsCents: 18142,
      externalNetCashFlowCents: -18142,
      operationalRevenueCents: 0,
      operationalExpenseCents: 18142,
      operatingResultCents: -18142,
      debtPaymentsCents: 0,
      refundsNetCents: 0,
      unclassifiedOutflowsCents: 0,
      internalTransfersExcludedCents: 0
    },
    imports: [],
    rules: [],
    rawRows: [],
    transactions: [{
      id: "a7d1a07c-250d-435f-bf30-6f3375462548",
      transaction_date: "2026-07-03",
      competence: "2026-07-01",
      original_description: "=descrição potencialmente perigosa",
      normalized_description: "DESCRICAO POTENCIALMENTE PERIGOSA",
      counterparty: "Olist Tiny Tecnologia",
      amount_cents: "-18142",
      direction: "outflow",
      nature: "operating_expense",
      nature_name: "Despesa operacional",
      include_external_cash_flow: true,
      include_operating_result: true,
      review_required: false,
      review_status: "reviewed",
      classification_confidence: "1",
      classification_source: "manual",
      source_type: "nubank",
      account_name: "Nubank",
      account_id: "account-id",
      source_line_number: 17,
      source_identifier: "NU-123",
      raw_payload: { Descrição: "Transferência enviada pelo Pix - OLIST TINY TECNOLOGIA" },
      category_id: "category-id",
      category_name: "Sistemas e software",
      category_parent_name: "Despesas operacionais",
      subcategory_name: "Sistemas e software",
      transfer_status: "confirmed",
      transfer_key: "TRF-1234567890ABCDEF",
      notes: "Assinatura mensal",
      import_filename: "extrato.csv"
    }]
  } as unknown as ExportData;
}
