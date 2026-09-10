import { describe, expect, it } from "vitest";
import { detectAndParseStatement } from "@/domain/finance/adapters";
import { paymentMatch } from "@/domain/finance/card-statements";
import { classifyTransaction } from "@/domain/finance/classification";

describe("card statement import", () => {
  it("separates purchases, refunds and previous payments, preserving duplicate purchases", async () => {
    const text = 'date,title,amount\n2026-04-23,Loja - 2/3,"100,00"\n2026-04-23,Loja - 2/3,"100,00"\n2026-04-28,Pagamento recebido,"- 500,00"\n2026-05-02,Estorno,"- 10,00"';
    const parsed = await detectAndParseStatement({ filename: "card.csv", contentType: "text/csv", bytes: new TextEncoder().encode(text), text, competence: "2026-05" });
    if (parsed.status !== "parsed") throw new Error("Card not detected");
    expect(parsed.statement.statementKind).toBe("card");
    expect(parsed.statement.invoiceTotalCents).toBe(19000);
    expect(parsed.statement.transactions.map(t => t.entryKind)).toEqual(["card_purchase", "card_purchase", "card_payment", "card_refund"]);
    expect(parsed.statement.transactions.every(t => !t.includeExternalCashFlow && t.competence === "2026-05-01")).toBe(true);
    expect(parsed.statement.transactions[2].includeOperatingResult).toBe(false);
    expect(parsed.statement.transactions[0].transactionDate).toBe("2026-04-23");
    const classified = classifyTransaction(parsed.statement.transactions[0], [{
      id: "rule", priority: 1, conditions: { descriptionContains: "Loja" },
      actions: { nature: "operating_expense", includeExternalCashFlow: true, includeOperatingResult: true }
    }]);
    expect(classified.classificationSource).toBe("rule");
    expect(classified.includeExternalCashFlow).toBe(false);
    expect(classified.includeOperatingResult).toBe(true);
  });
  it("identifies bank bill payments without counting them again as expenses", async () => {
    const text = "Data,Valor,Identificador,Descrição\n27/05/2026,-20.01,test,Pagamento de fatura";
    const parsed = await detectAndParseStatement({ filename: "bank.csv", contentType: "text/csv", bytes: new TextEncoder().encode(text), text, competence: "2026-05" });
    if (parsed.status !== "parsed") throw new Error("Bank not detected");
    expect(parsed.statement.transactions[0]).toMatchObject({ entryKind: "bill_payment", includeOperatingResult: false, includeExternalCashFlow: true });
    expect(classifyTransaction(parsed.statement.transactions[0], [{ id: "rule", priority: 1, conditions: {}, actions: { nature: "operating_expense", includeOperatingResult: true } }]).includeOperatingResult).toBe(false);
  });
  it("suggests a one-cent difference but never silently reconciles", () => {
    expect(paymentMatch(710916, -710917, "2026-05-28", "2026-05-27")).toEqual({ suggested: true, differenceCents: 1 });
    expect(paymentMatch(710916, -685694, "2026-05-28", "2026-04-28").suggested).toBe(false);
    expect(paymentMatch(710916, -710900, "2026-05-28", "2026-05-27").suggested).toBe(false);
  });
});
