// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/commerce/admin/assistant/route";
import { requireCommerceAdmin } from "@/services/commerce/http";
import { assistantConfig, assistantLimits, setAssistantState } from "@/repositories/commerce-assistant";
import { storeAssistantCompletion } from "@/services/openrouter/store-assistant";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { AssistantProviderError, assistantDiagnostics } from "@/services/openrouter/assistant-diagnostics";
import { CommerceError } from "@/domain/commerce/commerce";

vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), requireCommerceAdmin: vi.fn() }));
vi.mock("@/repositories/commerce-assistant", () => ({ assistantConfig: vi.fn(), assistantLimits: vi.fn(), setAssistantState: vi.fn() }));
vi.mock("@/services/openrouter/store-assistant", () => ({ storeAssistantCompletion: vi.fn() }));
vi.mock("@/services/commerce/assistant-engine", () => ({ previewAssistantReply: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ OPENROUTER_API_KEY: "server-only-test-key" }) }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn() }));
const request = (body: unknown = { action: "test", revision: 3 }, origin = "https://panel.test") => new Request("https://panel.test/api/commerce/admin/assistant", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://panel.test");
  vi.mocked(requireCommerceAdmin).mockResolvedValue({ session: { tenantId: "session-tenant", userId: "session-user" } } as never);
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
  vi.mocked(assistantConfig).mockResolvedValue({ revision: 3 } as never);
  vi.mocked(assistantLimits).mockResolvedValue({ allowed: true } as never);
  vi.mocked(setAssistantState).mockResolvedValue({ revision: 3 } as never);
  vi.mocked(storeAssistantCompletion).mockResolvedValue({ content: "Olá!", model: "openai/gpt-4.1-mini" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("assistant admin connection diagnostics", () => {
  it("keeps origin, authorization, session tenant and throttling boundaries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request(undefined, "https://attacker.test"))).status).toBe(403);
    vi.mocked(requireCommerceAdmin).mockRejectedValueOnce(new CommerceError("Entre na conta administrativa.", 401));
    expect((await POST(request())).status).toBe(401);
    vi.mocked(enforcePublicRateLimit).mockResolvedValueOnce(Response.json({ error: "Aguarde" }, { status: 429 }) as never);
    expect((await POST(request())).status).toBe(429);
    expect(storeAssistantCompletion).not.toHaveBeenCalled();
  });
  it("rejects caller-controlled tenants and stale revisions before using the provider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request({ action: "test", revision: 3, tenantId: "other" }))).status).toBe(400);
    expect((await POST(request({ action: "test", revision: 2 }))).status).toBe(409);
    expect(storeAssistantCompletion).not.toHaveBeenCalled();
    expect(setAssistantState).not.toHaveBeenCalled();
  });
  it("shows an actionable admin failure and never validates or enables a failed test", async () => {
    const diagnostics = assistantDiagnostics(402, { error: { code: 402, message: "Insufficient credits for private-customer@example.test", metadata: { raw: "private prompt" } } }, new Headers({ "x-request-id": "req-support-123" }));
    const failure = new AssistantProviderError("reference-123", diagnostics, [{ model: "openai/gpt-4.1-mini", attempt: 1, diagnostics }]);
    vi.mocked(storeAssistantCompletion).mockRejectedValueOnce(failure);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request()), body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error).toContain("créditos"); expect(body.error).toContain("reference-123");
    expect(body.details).toMatchObject({ code: "assistant_openrouter_credits", upstreamStatus: 402, reference: "reference-123" });
    expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/private-customer|private prompt|server-only-test-key/);
    expect(log).toHaveBeenCalledWith("Commerce operation failed.", expect.objectContaining({ operation: "assistant.admin.action", errorType: "AssistantProviderError", providerReference: "reference-123", providerDiagnostics: expect.objectContaining({ httpStatus: 402 }) }));
    expect(setAssistantState).not.toHaveBeenCalled();
  });
  it("includes both models and upstream statuses in the same final error log", async () => {
    const first = assistantDiagnostics(404, { error: { message: "No endpoints matching privacy policy" } });
    const last = assistantDiagnostics(503, {});
    vi.mocked(storeAssistantCompletion).mockRejectedValueOnce(new AssistantProviderError("reference-fallback", last, [{ model: "openai/gpt-4.1-mini", attempt: 1, diagnostics: first }, { model: "google/gemini-3.1-flash-lite", attempt: 2, diagnostics: last }]));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request())).status).toBe(503);
    expect(log.mock.calls[0][1]).toMatchObject({ providerAttempts: [{ model: "openai/gpt-4.1-mini", httpStatus: 404, reason: "privacy_route" }, { model: "google/gemini-3.1-flash-lite", httpStatus: 503 }] });
    expect(setAssistantState).not.toHaveBeenCalled();
  });
  it("marks only a successful connection as tested, never automatically enabled", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).answer).toBe("Olá!");
    expect(storeAssistantCompletion).toHaveBeenCalledWith("session-tenant", expect.any(Array), [], expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(setAssistantState).toHaveBeenCalledTimes(1);
    expect(setAssistantState).toHaveBeenCalledWith("session-tenant", "session-user", 3, "tested");
  });
});
