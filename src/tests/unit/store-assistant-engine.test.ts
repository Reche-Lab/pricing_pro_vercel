// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAssistantTurn, assistantSystemPrompt } from "@/services/commerce/assistant-engine";
import { storeAssistantCompletion } from "@/services/openrouter/store-assistant";
import { assistantConfig, assistantMessages, completeAssistantTurn } from "@/repositories/commerce-assistant";
import { executeAssistantTool, type AssistantToolContext } from "@/services/commerce/assistant-tools";
import { assistantSettingsSchema } from "@/domain/commerce/assistant";
import { ASSISTANT_FALLBACK_MODEL } from "@/domain/commerce/assistant-models";
vi.mock("@/repositories/commerce-assistant", () => ({ assistantConfig: vi.fn(), assistantMessages: vi.fn(), requireAssistantConversation: vi.fn(), completeAssistantTurn: vi.fn(), reserveAssistantCall: vi.fn(), settleAssistantCall: vi.fn() }));
vi.mock("@/services/commerce/assistant-tools", () => ({ assistantToolDefinitions: [], executeAssistantTool: vi.fn() }));
vi.mock("@/services/openrouter/store-assistant", async original => ({ ...await original<typeof import("@/services/openrouter/store-assistant")>(), storeAssistantCompletion: vi.fn() }));
afterEach(() => vi.clearAllMocks());
describe("assistant fallback tool-loop continuity", () => {
  it("provides authoritative cart totals without leaking artwork personal data or corrupting product IDs", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const context = { store: { slug: "test", settings: { name: "Loja", description: "", terms: "" } }, config: { settings: assistantSettingsSchema.parse({}) }, session: { cart: [{ productId: id, quantity: 30, artworkName: "Campanha" }, { productId: id, quantity: 20, artworkName: "cliente@example.test" }] } } as AssistantToolContext;
    const prompt = assistantSystemPrompt(context);
    expect(prompt).toContain(JSON.stringify(id)); expect(prompt).toContain('"quantity":50'); expect(prompt).toContain('"artworks":2');
    expect(prompt).not.toContain("cliente@example.test");
  });
  it("keeps the virtual assistant identity without discussing internal providers or infrastructure", () => {
    const context = { store: { slug: "test", settings: { name: "Loja teste", description: "", terms: "" } }, config: { settings: assistantSettingsSchema.parse({}) } } as AssistantToolContext;
    const prompt = assistantSystemPrompt(context);
    expect(prompt).toContain("Identifique-se como IA");
    expect(prompt).toContain("Não exponha fornecedores, modelos, infraestrutura ou configurações internas");
    expect(prompt).toContain("Não detalhe seguro nem valor declarado do frete nas respostas");
    expect(prompt).toContain("quantidade FINAL desejada");
    expect(prompt).toContain("validar o e-mail e preencher os dados pessoais ou da empresa");
  });
  it("keeps the fallback for the rest of the turn, preserving signatures without replaying a proposal or storing reasoning", async () => {
    const config = { tenant_id: "tenant", enabled: true, revision: 1, settings: assistantSettingsSchema.parse({}), tested_revision: 1, tested_at: null };
    const context = { store: { tenant_id: "tenant", slug: "test", settings: { name: "Loja teste", description: "", terms: "" } }, config, session: { id: "session", customer_id: null }, conversationId: "conversation" } as AssistantToolContext;
    vi.mocked(assistantConfig).mockResolvedValue(config); vi.mocked(assistantMessages).mockResolvedValue([{ id: "message", role: "user", text: "Quero um orçamento", cards: [] }]);
    vi.mocked(storeAssistantCompletion).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, content: null, tool_calls: [{ id: "call", type: "function", function: { name: "prepare_quote", arguments: '{"items":[]}' } }], reasoning_details: [{ type: "reasoning.encrypted", data: "opaque-private-signature", format: "google-gemini-v1" }] }).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, content: "Confira a proposta e confirme para continuar." });
    vi.mocked(executeAssistantTool).mockResolvedValue({ result: { proposed: true }, card: { kind: "proposal", actionId: "action", items: [], totalCents: 10000, expiresAt: "2099-01-01" } });
    await runAssistantTurn(context, "message", vi.fn());
    expect(executeAssistantTool).toHaveBeenCalledTimes(1); expect(completeAssistantTurn).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(storeAssistantCompletion).mock.calls;
    expect(calls[1][3]).toMatchObject({ preferredModel: ASSISTANT_FALLBACK_MODEL });
    expect(calls[1][1].find(m => m.role === "assistant" && m.tool_calls)?.reasoning_details?.[0]).toMatchObject({ data: "opaque-private-signature" });
    expect(JSON.stringify(vi.mocked(completeAssistantTurn).mock.calls)).not.toContain("opaque-private-signature");
  });
});
