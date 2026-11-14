// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeAssistantCompletion, assistantToolMessage, assistantWireMessages } from "@/services/openrouter/store-assistant";
import { reserveAssistantCall, settleAssistantCall } from "@/repositories/commerce-assistant";
import { ASSISTANT_FALLBACK_MODEL } from "@/domain/commerce/assistant-models";
vi.mock("@/repositories/commerce-assistant", () => ({ reserveAssistantCall: vi.fn(), settleAssistantCall: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ OPENROUTER_API_KEY: process.env.TEST_ASSISTANT_KEY, OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1", APP_URL: "https://store.example.test" }) }));
beforeEach(() => { process.env.TEST_ASSISTANT_KEY = "secret-never-for-client"; vi.mocked(reserveAssistantCall).mockResolvedValue({ model: "openai/gpt-4.1-mini", usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); delete process.env.TEST_ASSISTANT_KEY; });
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
  it("falls back once on a temporary failure, with a separate quota reservation and identical privacy rules", async () => {
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", "");
    vi.mocked(reserveAssistantCall).mockResolvedValueOnce({ model: "openai/gpt-4.1-mini", usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>);
    const request = vi.fn().mockResolvedValueOnce(Response.json({ error: "provider unavailable" }, { status: 503 })).mockResolvedValueOnce(Response.json({ model: ASSISTANT_FALLBACK_MODEL, choices: [{ message: { content: "Olá!" } }], usage: { total_tokens: 150, cost: .001 } }));
    const result = await storeAssistantCompletion("t", [{ role: "user", content: "Olá" }], [], { request });
    expect(result.model).toBe(ASSISTANT_FALLBACK_MODEL); expect(request).toHaveBeenCalledTimes(2); expect(reserveAssistantCall).toHaveBeenCalledTimes(2);
    expect(vi.mocked(reserveAssistantCall).mock.calls[1]).toEqual(["t", expect.any(Number), ASSISTANT_FALLBACK_MODEL]);
    const bodies = request.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(bodies[0].model).toBe("openai/gpt-4.1-mini"); expect(bodies[1].model).toBe(ASSISTANT_FALLBACK_MODEL);
    expect(bodies[1].provider).toEqual(bodies[0].provider); expect(bodies[1].reasoning).toEqual({ effort: "minimal" }); expect(bodies[0].reasoning).toBeUndefined();
    expect(settleAssistantCall).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 402, 403, 413])("does not switch models for validation, authorization, balance or moderation errors (%s)", async status => {
    const request = vi.fn(async () => Response.json({ error: { message: "private-provider-message" } }, { status }));
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toMatchObject({ status: 503 }); expect(request).toHaveBeenCalledTimes(1);
  });
  it("never switches after caller cancellation or when the fallback quota is exhausted", async () => {
    const abort = new AbortController(); abort.abort(); const cancelled = vi.fn();
    await expect(storeAssistantCompletion("t", [], [], { request: cancelled, signal: abort.signal })).rejects.toBeDefined();
    expect(cancelled).not.toHaveBeenCalled(); expect(reserveAssistantCall).not.toHaveBeenCalled();
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", "");
    vi.mocked(reserveAssistantCall).mockResolvedValueOnce({ model: "openai/gpt-4.1-mini", usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>).mockRejectedValueOnce(new Error("quota"));
    const request = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toThrow("quota"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not bypass an explicit model exclusion and stops after the fallback fails", async () => {
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", "openai/gpt-4.1-mini"); const request = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toBeDefined(); expect(request).toHaveBeenCalledTimes(1);
    vi.clearAllMocks(); vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", "");
    vi.mocked(reserveAssistantCall).mockResolvedValueOnce({ model: "openai/gpt-4.1-mini", usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>);
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toBeDefined(); expect(request).toHaveBeenCalledTimes(2);
  });
  it("preserves opaque Gemini tool signatures for server-side continuation", async () => {
    const request = vi.fn(async () => Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: "tool-1", type: "function", function: { name: "view_cart", arguments: "{}" }, extra_content: { google: { thought_signature: "opaque-signature" } } }], reasoning_details: [{ type: "reasoning.encrypted", data: "opaque-reasoning", format: "google-gemini-v1", id: "tool-1", index: 0 }] } }] }));
    const result = await storeAssistantCompletion("t", [], [{}], { request });
    expect(result.reasoning_details?.[0]).toMatchObject({ data: "opaque-reasoning" }); expect(result.tool_calls?.[0].extra_content?.google?.thought_signature).toBe("opaque-signature");
  });
  it("adapts previous GPT tool results on handoff and preserves Gemini signatures thereafter", () => {
    const gpt = assistantToolMessage({ model: "openai/gpt-4.1-mini", content: null, tool_calls: [{ id: "gpt-tool", type: "function", function: { name: "search_products", arguments: "{}" } }] });
    const gemini = assistantToolMessage({ model: ASSISTANT_FALLBACK_MODEL, content: null, tool_calls: [{ id: "gemini-tool", type: "function", function: { name: "view_cart", arguments: "{}" }, extra_content: { google: { thought_signature: "keep-this-signature" } } }], reasoning_details: [{ type: "reasoning.encrypted", data: "keep-this-blob", format: "google-gemini-v1" }] });
    const wire = assistantWireMessages([gpt, { role: "tool", content: '{"products":[]}', tool_call_id: "gpt-tool" }, gemini, { role: "tool", content: '{"items":[]}', tool_call_id: "gemini-tool" }], ASSISTANT_FALLBACK_MODEL);
    expect(wire.filter(m => m.role === "tool").map(m => m.tool_call_id)).toEqual(["gemini-tool"]);
    expect(wire[0].content).toContain("search_products"); expect(wire[1].content).toContain("products");
    expect(wire[2].tool_calls?.[0].extra_content?.google?.thought_signature).toBe("keep-this-signature"); expect(wire[2].reasoning_details?.[0]).toMatchObject({ data: "keep-this-blob" });
    expect(JSON.stringify(wire)).not.toContain("sourceModel");
  });
  it("does not send an unsupported parallel_tool_calls parameter to Gemini", async () => {
    vi.mocked(reserveAssistantCall).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>);
    const request = vi.fn().mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "Olá!" } }] }));
    await storeAssistantCompletion("t", [], [{}], { request, preferredModel: ASSISTANT_FALLBACK_MODEL });
    const body = JSON.parse(request.mock.calls[0][1].body); expect(body.tools).toHaveLength(1); expect(body.tool_choice).toBe("auto"); expect(body.parallel_tool_calls).toBeUndefined();
  });
  it("does not generate again when a successful response cannot be settled in the database", async () => {
    vi.mocked(settleAssistantCall).mockRejectedValueOnce(new Error("database unavailable"));
    const request = vi.fn(async () => Response.json({ choices: [{ message: { content: "Olá!" } }], usage: { total_tokens: 100, cost: .001 } }));
    await expect(storeAssistantCompletion("t", [], [], { request })).rejects.toThrow("database unavailable"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("falls back when the connection drops while reading the response body", async () => {
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", "");
    const interrupted = Response.json({}); vi.spyOn(interrupted, "json").mockRejectedValueOnce(new TypeError("body disconnected"));
    vi.mocked(reserveAssistantCall).mockResolvedValueOnce({ model: "openai/gpt-4.1-mini", usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>);
    const request = vi.fn().mockResolvedValueOnce(interrupted).mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "Olá!" } }] }));
    expect((await storeAssistantCompletion("t", [], [], { request })).model).toBe(ASSISTANT_FALLBACK_MODEL); expect(request).toHaveBeenCalledTimes(2);
  });
  it("recognizes temporary errors in an HTTP 200 envelope without retrying an inline moderation refusal", async () => {
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", "");
    vi.mocked(reserveAssistantCall).mockResolvedValueOnce({ model: "openai/gpt-4.1-mini", usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>);
    const request = vi.fn().mockResolvedValueOnce(Response.json({ error: { code: 503, message: "private provider message" } })).mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "Olá!" } }] }));
    expect((await storeAssistantCompletion("t", [], [], { request })).model).toBe(ASSISTANT_FALLBACK_MODEL);
    const refused = vi.fn(async () => Response.json({ error: { code: 403, message: "moderation refusal" } }));
    await expect(storeAssistantCompletion("t", [], [], { request: refused })).rejects.toBeDefined(); expect(refused).toHaveBeenCalledTimes(1);
  });
  it("accepts Gemini parallel catalog queries within the existing four-tool execution cap", async () => {
    vi.mocked(reserveAssistantCall).mockResolvedValueOnce({ model: ASSISTANT_FALLBACK_MODEL, usageMonth: "2026-11-01" } as Awaited<ReturnType<typeof reserveAssistantCall>>);
    const tool_calls = ["Botton", "Espelho", "Ímã"].map((query, i) => ({ id: `tool-${i}`, type: "function", function: { name: "search_products", arguments: JSON.stringify({ query }) } }));
    const request = vi.fn(async () => Response.json({ choices: [{ message: { content: null, tool_calls } }] }));
    expect((await storeAssistantCompletion("t", [], [{}], { request, preferredModel: ASSISTANT_FALLBACK_MODEL })).tool_calls).toHaveLength(3);
  });
});
