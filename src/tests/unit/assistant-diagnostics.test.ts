// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assistantDiagnostics, readAssistantErrorResponse, assistantAdminFailureMessage } from "@/services/openrouter/assistant-diagnostics";
describe("assistant provider diagnostics", () => {
  it("distinguishes actual HTTP status from an inline provider code", () => {
    const data = assistantDiagnostics(200, { error: { code: 402, message: "Insufficient credits", metadata: { limit_source: "openrouter_key_limit" } } });
    expect(data).toMatchObject({ httpStatus: 200, providerCode: 402, reason: "credits", limitSource: "openrouter_key_limit" });
    expect(assistantAdminFailureMessage(data)).toMatch(/créditos|limite/i);
  });
  it("identifies incompatible privacy, routing and request parameters without relaxing them", () => {
    expect(assistantDiagnostics(404, { error: { code: 404, message: "No endpoints found matching your data policy (ZDR)" } }).reason).toBe("privacy_route");
    expect(assistantDiagnostics(404, { error: { message: "No endpoints found supporting the requested parameters" } }).reason).toBe("parameters");
    expect(assistantDiagnostics(503, { error: { message: "No available provider" } }).reason).toBe("unavailable");
    expect(assistantDiagnostics(400, { error: { message: "Unsupported parameter provider.allow_safety_retention_google" } }).rejectedParameters).toContain("allow_safety_retention_google");
  });
  it("never exposes arbitrary provider messages, credentials, customer text, raw metadata or personal data", () => {
    const secrets = ["sk-or-v1-private-credential"];
    const data = assistantDiagnostics(400, { error: { code: "arbitrary-private-code", message: "Invalid messages.0.content for Maria loja@example.test 52998224725 sk-or-v1-private-credential", metadata: { raw: "secret body", provider_name: "private customer", user_id: "private-user" } }, prompt: "private conversation" }, new Headers({ "x-request-id": secrets[0] }), secrets);
    expect(JSON.stringify(data)).not.toMatch(/Maria|loja@example|529982|sk-or|secret body|private customer|private conversation|private-user|arbitrary-private/);
    expect(data.rejectedParameters).toContain("messages");
  });
  it("captures only safe support references and bounded retry hints", () => {
    const data = assistantDiagnostics(429, {}, new Headers({ "x-request-id": "req-valid-reference-123", "retry-after": "30" }));
    expect(data).toMatchObject({ reason: "rate_limit", providerRequestId: "req-valid-reference-123", retryAfterSeconds: 30 });
    expect(assistantDiagnostics(429, {}, new Headers({ "retry-after": "9999999999" })).retryAfterSeconds).toBeUndefined();
  });
  it("bounds error body reads and ignores raw HTML/text", async () => {
    const html = await readAssistantErrorResponse(new Response("<html>private content</html>", { status: 503 }));
    expect(html.bodyKind).toBe("html"); expect(JSON.stringify(html)).not.toContain("private");
    const large = await readAssistantErrorResponse(new Response("x".repeat(40000), { status: 500 }));
    expect(large.bodyKind).toBe("truncated"); expect(JSON.stringify(large)).not.toContain("xxx");
  });
});
