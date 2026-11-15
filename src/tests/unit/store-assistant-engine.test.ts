// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAssistantTurn, assistantSystemPrompt } from "@/services/commerce/assistant-engine";
import { storeAssistantCompletion } from "@/services/openrouter/store-assistant";
import { assistantConfig, assistantMessages, completeAssistantTurn } from "@/repositories/commerce-assistant";
import { executeAssistantTool, type AssistantToolContext } from "@/services/commerce/assistant-tools";
import { assistantSettingsSchema } from "@/domain/commerce/assistant";
import { ASSISTANT_FALLBACK_MODEL } from "@/domain/commerce/assistant-models";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
vi.mock("@/repositories/commerce-assistant", () => ({ assistantConfig: vi.fn(), assistantMessages: vi.fn(), requireAssistantConversation: vi.fn(), completeAssistantTurn: vi.fn(), reserveAssistantCall: vi.fn(), settleAssistantCall: vi.fn() }));
vi.mock("@/services/commerce/assistant-tools", () => ({ assistantToolDefinitions: [], executeAssistantTool: vi.fn() }));
vi.mock("@/services/openrouter/store-assistant", async original => ({ ...await original<typeof import("@/services/openrouter/store-assistant")>(), storeAssistantCompletion: vi.fn() }));
afterEach(() => vi.clearAllMocks());
describe("assistant fallback tool-loop continuity", () => {
  it("knows artwork creation, official benefits and no-commitment quoting without overriding store flags", () => {
    const context = { store: { slug: "test", art_library_enabled: false, settings: { name: "Loja", description: "", terms: "" } }, config: { settings: assistantSettingsSchema.parse({ allowQuotes: false, allowOrders: false }) } } as AssistantToolContext;
    const prompt = assistantSystemPrompt(context);
    for (const phrase of ["estúdio para criar com texto, imagens e cores", "retoque para ajustar fundo e bordas", "guia SVG", "enquadrar E aprovar", "limitado ao valor e percentual configurados", "sem comprar nem pagar", "mesmo sem ter a arte pronta", "Não confunda o estúdio manual com geração por IA", '"quotes":false', '"artworkLibrary":false']) expect(prompt).toContain(phrase);
  });
  it("offers a real quote action on an explicit continuation without a model call or mutation", async () => {
    const config = { tenant_id: "tenant", enabled: true, revision: 1, settings: assistantSettingsSchema.parse({}) };
    const context = { store: { tenant_id: "tenant", slug: "test", settings: { name: "Loja", description: "", terms: "" } }, config, session: { id: "session", cart: [{ productId: "product", quantity: 50, artworkName: "" }] }, conversationId: "conversation" } as AssistantToolContext;
    vi.mocked(assistantConfig).mockResolvedValue(config as never);
    vi.mocked(assistantMessages).mockResolvedValue([{ id: "message", role: "user", text: "Pode seguir com o orçamento", cards: [] }]);
    vi.mocked(executeAssistantTool).mockResolvedValue({ result: { hasItems: true }, card: { kind: "quote_continue" } } as never);
    await runAssistantTurn(context, "message", vi.fn());
    expect(storeAssistantCompletion).not.toHaveBeenCalled();
    expect(executeAssistantTool).toHaveBeenCalledTimes(1);
    expect(executeAssistantTool).toHaveBeenCalledWith(context, "continue_quote", {});
    expect(completeAssistantTurn).toHaveBeenCalledWith("tenant", "conversation", "message", expect.any(String), [{ kind: "quote_continue" }], false, 1);
  });
  it("replaces a hallucinated quote-link placeholder with an official action card", async () => {
    const config = { tenant_id: "tenant", enabled: true, revision: 1, settings: assistantSettingsSchema.parse({}) };
    const context = { store: { tenant_id: "tenant", slug: "test", settings: { name: "Loja", description: "", terms: "" } }, config, session: { id: "session", cart: [{ productId: "product", quantity: 50, artworkName: "" }] }, conversationId: "conversation" } as AssistantToolContext;
    vi.mocked(assistantConfig).mockResolvedValue(config as never);
    vi.mocked(assistantMessages).mockResolvedValue([{ id: "message", role: "user", text: "Como faço agora?", cards: [] }]);
    vi.mocked(storeAssistantCompletion).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, content: "Acesse [Link para o formulário seguro de orçamento] ..." });
    vi.mocked(executeAssistantTool).mockResolvedValue({ result: { hasItems: true }, card: { kind: "quote_continue" } } as never);
    await runAssistantTurn(context, "message", vi.fn());
    expect(vi.mocked(completeAssistantTurn).mock.calls[0][3]).not.toMatch(/\[Link|\.\.\./);
    expect(vi.mocked(completeAssistantTurn).mock.calls[0][4]).toEqual([{ kind: "quote_continue" }]);
  });
  it("does not offer quote navigation when the tenant disabled assistant quotes", async () => {
    const config = { tenant_id: "tenant", enabled: true, revision: 1, settings: assistantSettingsSchema.parse({ allowQuotes: false }) };
    const settings = storeSettingsSchema.parse({ name: "Loja", description: "", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "" });
    const context: AssistantToolContext = { store: { tenant_id: "tenant", slug: "test", enabled: true, status: "published", revision: 1, platform_id: "platform", settings }, config: { ...config, tested_revision: 1, tested_at: null }, session: { id: "session", tenant_id: "tenant", customer_id: null, revision: 0, cart: [] }, conversationId: "conversation" };
    vi.mocked(assistantConfig).mockResolvedValue(config as never);
    vi.mocked(assistantMessages).mockResolvedValue([{ id: "message", role: "user", text: "Pode seguir com o orçamento", cards: [] }]);
    vi.mocked(storeAssistantCompletion).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, content: "Abra [Link para o formulário de orçamento]." });
    await runAssistantTurn(context, "message", vi.fn());
    expect(executeAssistantTool).not.toHaveBeenCalled();
    expect(vi.mocked(completeAssistantTurn).mock.calls[0][4]).toEqual([{ kind: "handoff", summary: "" }]);
  });
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
