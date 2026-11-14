import { describe, expect, it } from "vitest";
import { assistantSettingsSchema, assistantRequestSchema, assistantProposalSchema, redactAssistantText, safeAssistantReply, isQuoteContinuationRequest, hasAssistantQuoteNavigation } from "@/domain/commerce/assistant";
describe("store assistant contracts", () => {
  it("keeps replies short at complete sentence boundaries and removes invented navigation", () => {
    expect(safeAssistantReply("Primeira frase. Segunda frase. Terceira frase. Quarta frase longa e desnecessária.")).toBe("Primeira frase. Segunda frase. Terceira frase.");
    expect(safeAssistantReply("Uma explicação muito longa ".repeat(100)).length).toBeLessThanOrEqual(420);
    const quoted = "Para formalizar o orçamento, acesse [Link para o formulário seguro de orçamento] ...";
    expect(hasAssistantQuoteNavigation(quoted)).toBe(true);
    expect(safeAssistantReply(quoted)).not.toMatch(/\[|Link para|\.\.\./);
    expect(safeAssistantReply("Abra [o orçamento](https://attacker.test/login)")).not.toContain("attacker.test");
  });
  it("recognizes clear continuation requests without skipping additions, negation or questions about prices", () => {
    for (const text of ["Pode seguir com o orçamento", "Sim, vamos continuar com o orçamento.", "quero gerar o orçamento em PDF"]) expect(isQuoteContinuationRequest(text)).toBe(true);
    expect(isQuoteContinuationRequest("pode seguir", true)).toBe(true);
    expect(isQuoteContinuationRequest("pode seguir", false)).toBe(false);
    for (const text of ["Não pode seguir com o orçamento", "Antes de seguir com o orçamento quero acrescentar 20", "Pode seguir com o orçamento mas inclua outro produto", "Quanto custa esse orçamento?"]) expect(isQuoteContinuationRequest(text, true)).toBe(false);
  });
  it("rejects tenant impersonation, arbitrary tools and client-supplied prices", () => {
    expect(assistantRequestSchema.safeParse({ action: "start", consent: true, tenantId: "other" }).success).toBe(false);
    expect(assistantProposalSchema.safeParse({ items: [{ productId: crypto.randomUUID(), quantity: 100, unitPrice: 1 }] }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ model: "expensive-model" }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ action: "resume" }).success).toBe(true);
    expect(assistantRequestSchema.safeParse({ action: "resume", conversationId: crypto.randomUUID() }).success).toBe(false);
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
