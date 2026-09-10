// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { detectAndParseStatement } from "@/domain/finance/adapters";
import { paymentMatch } from "@/domain/finance/card-statements";

// Optional private fixtures are parsed in memory only, never committed or imported.
describe.skipIf(!process.env.FINANCE_CARD_SAMPLE || !process.env.FINANCE_BANK_SAMPLE)("provided Nubank samples", () => {
  it("separates previous payment and locates current bill payment with one-cent discrepancy", async () => {
    async function parse(path: string) {
      const bytes = await readFile(path);
      const result = await detectAndParseStatement({ filename: "fixture.csv", bytes, contentType: "text/csv", text: bytes.toString("utf8"), competence: "2026-05", dueDate: "2026-05-28" });
      if (result.status !== "parsed") throw new Error("Fixture not detected");
      return result.statement;
    }
    const card = await parse(process.env.FINANCE_CARD_SAMPLE!);
    const bank = await parse(process.env.FINANCE_BANK_SAMPLE!);
    expect(card.transactions).toHaveLength(103);
    expect(card.invoiceTotalCents).toBe(710916);
    expect(card.transactions.filter(t => t.entryKind === "card_payment").map(t => t.amountCents)).toEqual([685694]);
    const candidates = bank.transactions.filter(t => paymentMatch(card.invoiceTotalCents!, t.amountCents, "2026-05-28", t.transactionDate).suggested);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ amountCents: -710917, transactionDate: "2026-05-27", entryKind: "bill_payment" });
  });
});
