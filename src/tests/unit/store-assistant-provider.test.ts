// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeAssistantCompletion } from "@/services/openrouter/store-assistant";
import { reserveAssistantCall, settleAssistantCall } from "@/repositories/commerce-assistant";
vi.mock("@/repositories/commerce-assistant", () => ({ reserveAssistantCall: vi.fn(), settleAssistantCall: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ OPENROUTER_API_KEY: process.env.TEST_ASSISTANT_KEY, OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1", APP_URL: "https://store.example.test" }) }));
beforeEach(() => { process.env.TEST_ASSISTANT_KEY = "secret-never-for-client"; vi.mocked(reserveAssistantCall).mockResolvedValue({ model: "openai/gpt-4.1-mini", usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>); });
afterEach(() => { vi.clearAllMocks(); delete process.env.TEST_ASSISTANT_KEY; });
describe("store assistant provider boundaries", () => {
  it("applies privacy and price constraints, settles against the reserved UTC month and omits empty tools", async () => {
    const request = vi.fn(async () => Response.json({ choices: [{ message: { content: "Olá!" } }], usage: { total_tokens: 120, cost: .001 } }));
    const reply = await storeAssistantCompletion("tenant-a", [{ role: "user", content: "Olá" }], [], { request });
    expect(reply.content).toBe("Olá!");
    const input = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(input[1].body as string);
    expect(body.provider).toMatchObject({ require_parameters: true, data_collection: "deny", zdr: true, allow_safety_retention_google: false, allow_safety_retention_other: false, max_price: { prompt: 2, completion: 8, request: 0 } });
    expect(body.tools).toBeUndefined(); expect(input[1].redirect).toBe("error"); expect(body.max_tokens).toBe(900);
    expect(settleAssistantCall).toHaveBeenCalledWith("tenant-a", "2026-11-01", expect.any(Number), { tokens: 120, cost: .001 });
    expect(JSON.stringify(reply)).not.toContain("secret-never-for-client");
  });
  it("refuses missing credentials and excessive prompt sizes before reserving a billable call", async () => {
    delete process.env.TEST_ASSISTANT_KEY; const request = vi.fn();
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toMatchObject({ status: 503 });
    process.env.TEST_ASSISTANT_KEY = "secret";
    await expect(storeAssistantCompletion("t", [{ role: "user", content: "é".repeat(20000) }], [], { request })).rejects.toMatchObject({ status: 413 });
    expect(reserveAssistantCall).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });
  it("does not expose raw provider errors or release an unknown bill", async () => {
    const request = vi.fn(async () => Response.json({ error: { message: "private secret account details" } }, { status: 403 }));
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toThrow(/autorizar o provedor/);
    expect(settleAssistantCall).not.toHaveBeenCalled();
  });
  it("blocks the provider when the atomic quota reservation fails", async () => {
    vi.mocked(reserveAssistantCall).mockRejectedValueOnce(new Error("quota")); const request = vi.fn();
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toThrow("quota"); expect(request).not.toHaveBeenCalled();
  });
});
