// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/store/[slug]/assistant/route";
import { buyerContext } from "@/services/commerce/http";
import { assistantConfig, assistantLimits, findAssistantConversation, startAssistantConversation, assistantMessages, requireAssistantConversation, assistantConfirmedActions } from "@/repositories/commerce-assistant";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { runAssistantTurn } from "@/services/commerce/assistant-engine";
import { CommerceError } from "@/domain/commerce/commerce";
import { assistantSettingsSchema } from "@/domain/commerce/assistant";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), buyerContext: vi.fn() }));
vi.mock("@/repositories/commerce-assistant", () => ({ assistantConfig: vi.fn(), assistantLimits: vi.fn(), findAssistantConversation: vi.fn(), startAssistantConversation: vi.fn(), assistantMessages: vi.fn(), requireAssistantConversation: vi.fn(), assistantConfirmedActions: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn() }));
vi.mock("@/services/commerce/assistant-engine", () => ({ runAssistantTurn: vi.fn() }));
vi.mock("@/services/commerce/assistant-tools", () => ({ confirmAssistantCart: vi.fn() }));
const context = { params: Promise.resolve({ slug: "shop" }) };
const conversation = { id: "00000000-0000-4000-8000-000000000001", tenant_id: "tenant", session_id: "session", status: "active", expires_at: "2099-01-01" };
const session = { id: "session", tenant_id: "tenant", customer_id: "buyer" };
const request = (body: unknown = { action: "resume" }, origin = "https://shop.test") => new Request("https://shop.test/api/store/shop/assistant", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://shop.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
  vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "tenant" }, session } as never);
  vi.mocked(assistantConfig).mockResolvedValue({ enabled: true, settings: assistantSettingsSchema.parse({}) } as never);
  vi.mocked(assistantLimits).mockResolvedValue({ allowed: true } as never);
  vi.mocked(findAssistantConversation).mockResolvedValue(conversation);
  vi.mocked(requireAssistantConversation).mockResolvedValue(conversation);
  vi.mocked(assistantMessages).mockResolvedValue([{ id: "message", role: "assistant", text: "Continuando seu orçamento", cards: [] }]);
  vi.mocked(assistantConfirmedActions).mockResolvedValue(["already-applied"]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("store assistant safe resumption", () => {
  it("resumes only from the authenticated cookie context, without creating sessions, conversations or model calls", async () => {
    const response = await POST(request(), context), body = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ conversation, customer: true, confirmedActionIds: ["already-applied"], messages: [{ text: "Continuando seu orçamento" }] });
    expect(buyerContext).toHaveBeenCalledWith("shop", false, true);
    expect(findAssistantConversation).toHaveBeenCalledWith("tenant", session);
    expect(requireAssistantConversation).toHaveBeenCalledWith("tenant", session, conversation.id);
    expect(assistantConfirmedActions).toHaveBeenCalledWith("tenant", conversation.id);
    expect(startAssistantConversation).not.toHaveBeenCalled(); expect(runAssistantTurn).not.toHaveBeenCalled();
  });
  it("asks for consent only when no existing session or active conversation can be resumed", async () => {
    vi.mocked(buyerContext).mockRejectedValueOnce(new CommerceError("Sessão ausente", 401));
    expect(await (await POST(request(), context)).json()).toMatchObject({ conversation: null, messages: [], confirmedActionIds: [] });
    expect(findAssistantConversation).not.toHaveBeenCalled();
    vi.mocked(findAssistantConversation).mockResolvedValueOnce(null);
    expect(await (await POST(request(), context)).json()).toMatchObject({ conversation: null, messages: [] });
    expect(assistantMessages).not.toHaveBeenCalled(); expect(startAssistantConversation).not.toHaveBeenCalled();
  });
  it("does not accept a caller-selected tenant, account or conversation", async () => {
    for (const field of ["tenantId", "customerId", "conversationId"]) expect((await POST(request({ action: "resume", [field]: conversation.id }), context)).status).toBe(400);
    expect(buyerContext).not.toHaveBeenCalled(); expect(assistantMessages).not.toHaveBeenCalled();
  });
  it("protects origin and rate limits before session access", async () => {
    expect((await POST(request(undefined, "https://attacker.test"), context)).status).toBe(403);
    vi.mocked(enforcePublicRateLimit).mockResolvedValueOnce(Response.json({}, { status: 429 }) as never);
    expect((await POST(request(), context)).status).toBe(429);
    expect(buyerContext).not.toHaveBeenCalled();
  });
  it("never reads history when disabled or ownership validation fails", async () => {
    vi.mocked(assistantLimits).mockResolvedValueOnce({ allowed: false } as never);
    expect((await POST(request(), context)).status).toBe(404);
    vi.mocked(requireAssistantConversation).mockRejectedValueOnce(new CommerceError("Outra conta", 404));
    expect((await POST(request(), context)).status).toBe(404);
    expect(assistantMessages).not.toHaveBeenCalled();
  });
});
