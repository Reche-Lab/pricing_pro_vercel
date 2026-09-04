import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectAndParseStatement, readStatementText } from "@/domain/finance/adapters";
import { classifyTransaction } from "@/domain/finance/classification";
import { parseCsv, parseMoneyToCents } from "@/domain/finance/csv";
import { calculateFinancialMetrics } from "@/domain/finance/metrics";
import { suggestInternalTransfers } from "@/domain/finance/transfers";

describe("finance CSV core", () => {
  it("parses quoted delimiters, BOM and Brazilian money without floating point drift", () => {
    const parsed = parseCsv('\uFEFFData,Valor,Descrição\n02/07/2026,"1.234,56","Venda, cliente"');
    expect(parsed.rows[0].cells).toEqual(["Data", "Valor", "Descrição"]);
    expect(parsed.rows[1].cells[2]).toBe("Venda, cliente");
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("-22.78")).toBe(-2278);
  });

  it("keeps Olist closing balance informational and out of cash flow", async () => {
    const text = "Data,Valor,Identificador,Origem / Destino,Descrição\n13/07/2026,376.17,-,-,Saldo de fechamento do dia\n";
    const bytes = new TextEncoder().encode(text);
    const result = await detectAndParseStatement({ filename: "olist.csv", contentType: "text/csv", bytes, text, competence: "2026-07" });
    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;
    expect(result.statement.transactions[0]).toMatchObject({ direction: "neutral", nature: "informative", includeExternalCashFlow: false });
  });

  it("gives deterministic tenant rules priority", () => {
    const transaction = {
      sourceLineNumber: 2, transactionDate: "2026-07-02", competence: "2026-07-01",
      originalDescription: "OLIST TINY TECNOLOGIA", normalizedDescription: "OLIST TINY TECNOLOGIA",
      amountCents: -18142, currency: "BRL", direction: "outflow" as const, sourceType: "nubank" as const,
      nature: "unclassified", includeExternalCashFlow: true, includeOperatingResult: false, reviewRequired: true, rawData: {}
    };
    const result = classifyTransaction(transaction, [{
      id: "rule", priority: 10, sourceType: "nubank", conditions: { descriptionContains: "olist tiny" },
      actions: { nature: "operating_expense", includeOperatingResult: true, reviewRequired: false }
    }]);
    expect(result.nature).toBe("operating_expense");
    expect(result.classificationSource).toBe("rule");
  });
});

describe("financial metrics and transfers", () => {
  it("does not inflate consolidated cash flow with confirmed internal transfers", () => {
    const metrics = calculateFinancialMetrics([
      tx(-10000, { internalTransferConfirmed: true }), tx(10000, { internalTransferConfirmed: true }),
      tx(25000, { nature: "operating_revenue", includeOperatingResult: true }),
      tx(-5000, { nature: "operating_expense", includeOperatingResult: true })
    ]);
    expect(metrics.externalInflowsCents).toBe(25000);
    expect(metrics.externalOutflowsCents).toBe(5000);
    expect(metrics.externalNetCashFlowCents).toBe(20000);
    expect(metrics.internalTransfersExcludedCents).toBe(10000);
    expect(metrics.operationalInflowsCents).toBe(25000);
    expect(metrics.operationalOutflowsCents).toBe(5000);
    expect(metrics.operatingResultCents).toBe(20000);
  });

  it("suggests equal transfers across company accounts and penalizes personal accounts", () => {
    const company = suggestInternalTransfers([
      transfer("out", "a", -20300, "2026-07-02", "Pix para Mercado Pago", "company"),
      transfer("in", "b", 20300, "2026-07-02", "Pix recebido", "company")
    ]);
    const personal = suggestInternalTransfers([
      transfer("out", "a", -20300, "2026-07-02", "Pix", "personal"),
      transfer("in", "b", 20300, "2026-07-02", "Pix", "company")
    ]);
    expect(company).toHaveLength(1);
    expect(company[0].score).toBeGreaterThan(personal[0]?.score ?? 0);
    expect(personal[0]?.requiresConfirmation).toBe(true);
  });
});

const FIXTURE_DIR = "/home/inngage/Documentos/GroundShop/Financeiro/Extratos/2026-07";
describe.runIf(existsSync(FIXTURE_DIR))("Ground Shop July 2026 reference files", () => {
  it("normalizes 86 source lines and one informational Olist balance", async () => {
    const files = ["2026-07_NuBank.csv", "2026-07_Olist.csv", "2026-07_mercado_pago.csv"];
    let count = 0;
    let informational = 0;
    for (const filename of files) {
      const source = readFileSync(`${FIXTURE_DIR}/${filename}`);
      const bytes = new Uint8Array(source);
      const result = await detectAndParseStatement({ filename, contentType: "text/csv", bytes, text: readStatementText(bytes), competence: "2026-07" });
      expect(result.status).toBe("parsed");
      if (result.status !== "parsed") continue;
      count += result.statement.transactions.length;
      informational += result.statement.transactions.filter((item) => item.direction === "neutral").length;
      if (filename.includes("mercado_pago")) expect(result.statement.finalBalanceCents).toBe(2784);
    }
    expect(count).toBe(86);
    expect(informational).toBe(1);
  });

  it("reproduces the July external cash-flow totals after high-confidence transfers", async () => {
    const files = ["2026-07_NuBank.csv", "2026-07_Olist.csv", "2026-07_mercado_pago.csv"];
    const all: Array<{
      id: string; accountId: string; transactionDate: string; amountCents: number; currency: string;
      description: string; ownershipType: string; sameEconomicEntity: boolean; direction: "inflow" | "outflow" | "neutral";
      nature: string; includeExternalCashFlow: boolean; includeOperatingResult: boolean;
    }> = [];
    for (const filename of files) {
      const source = readFileSync(`${FIXTURE_DIR}/${filename}`);
      const bytes = new Uint8Array(source);
      const result = await detectAndParseStatement({ filename, contentType: "text/csv", bytes, text: readStatementText(bytes), competence: "2026-07" });
      if (result.status !== "parsed") continue;
      result.statement.transactions.forEach((item, index) => all.push({
        ...item, id: `${result.statement.sourceType}-${index}`, accountId: result.statement.sourceType,
        description: item.originalDescription, ownershipType: "company", sameEconomicEntity: true
      }));
    }
    const suggestions = suggestInternalTransfers(all.filter((item) => item.direction !== "neutral"));
    const paired = new Set(suggestions.filter((item) => !item.requiresConfirmation).flatMap((item) => [item.outgoingTransactionId, item.incomingTransactionId]));
    const metrics = calculateFinancialMetrics(all.map((item) => ({ ...item, internalTransferConfirmed: paired.has(item.id) })));
    expect(metrics.externalInflowsCents).toBe(283034);
    expect(metrics.externalOutflowsCents).toBe(202029);
    expect(metrics.externalNetCashFlowCents).toBe(81005);
    expect(metrics.internalTransfersExcludedCents).toBe(82617);
  });
});

function tx(amountCents: number, override: Record<string, unknown> = {}) {
  return { amountCents, direction: amountCents > 0 ? "inflow" as const : "outflow" as const,
    nature: "unclassified", includeExternalCashFlow: true, includeOperatingResult: false, ...override };
}
function transfer(id: string, accountId: string, amountCents: number, transactionDate: string, description: string, ownershipType: string) {
  return { id, accountId, amountCents, transactionDate, description, ownershipType, currency: "BRL", sameEconomicEntity: true };
}
