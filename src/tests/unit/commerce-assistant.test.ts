import { describe, expect, it } from "vitest";
import { assistantSettingsSchema, assistantRequestSchema, assistantProposalSchema, redactAssistantText, safeAssistantReply } from "@/domain/commerce/assistant";
describe("store assistant contracts", () => {
  it("rejects tenant impersonation, arbitrary tools and client-supplied prices", () => {
    expect(assistantRequestSchema.safeParse({ action: "start", consent: true, tenantId: "other" }).success).toBe(false);
    expect(assistantProposalSchema.safeParse({ items: [{ productId: crypto.randomUUID(), quantity: 100, unitPrice: 1 }] }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ model: "expensive-model" }).success).toBe(false);
  });
  it("redacts accidental sensitive text but retains a CEP for delivery estimates", () => {
    const text = redactAssistantText("email loja@example.com CPF 529.982.247-25 CEP 01001-000 senha segredo");
    expect(text).not.toContain("loja@example.com"); expect(text).not.toContain("529.982.247-25"); expect(text).not.toContain("segredo"); expect(text).toContain("01001-000");
  });
  it("never lets generated monetary values or bank numbers replace structured official cards", () => {
    expect(safeAssistantReply("O preço é R$ 50,00")).not.toContain("50");
    expect(safeAssistantReply("conta bancária: 12345")).not.toContain("12345");
    expect(safeAssistantReply("Quantas artes você deseja utilizar?")).toContain("Quantas artes");
  });
});
