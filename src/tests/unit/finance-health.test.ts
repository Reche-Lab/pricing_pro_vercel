import { describe, expect, it } from "vitest";
import { calculateFinancialHealth } from "@/domain/finance/health";

describe("calculateFinancialHealth", () => {
  it("indica uma competência pronta quando todos os controles estão resolvidos", () => {
    expect(calculateFinancialHealth({ requiredAccounts: 3, missingAccounts: 0, failedImports: 0,
      importsNeedingReview: 0, balanceMismatches: 0, pendingReviews: 0,
      unclassifiedTransactions: 0, suggestedTransfers: 0 })).toMatchObject({ score: 100, readyToClose: true });
  });

  it("separa bloqueios de itens que apenas pedem atenção", () => {
    const result = calculateFinancialHealth({ requiredAccounts: 2, missingAccounts: 1, failedImports: 0,
      importsNeedingReview: 0, balanceMismatches: 0, pendingReviews: 2,
      unclassifiedTransactions: 4, suggestedTransfers: 1 });
    expect(result.readyToClose).toBe(false);
    expect(result.blockingCount).toBe(3);
    expect(result.attentionCount).toBe(5);
    expect(result.score).toBeLessThan(100);
  });
});
