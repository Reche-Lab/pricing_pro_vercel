// @vitest-environment node
import { describe, expect, it } from "vitest";
import { paymentFailureMessage, readPaymentProviderResponse } from "@/services/commerce/payment-diagnostics";

describe("Mercado Pago safe diagnostics", () => {
  it("extracts root and nested policy errors plus the provider request reference", async () => {
    const { diagnostics } = await readPaymentProviderResponse(Response.json({
      code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", message: "At least one policy returned UNAUTHORIZED.",
      cause: [{ code: 40301, description: "Application is not authorized." }],
    }, { status: 403, headers: { "x-request-id": "provider-request-123" } }));
    expect(diagnostics.codes).toEqual(["PA_UNAUTHORIZED_RESULT_FROM_POLICIES", "40301"]);
    expect(diagnostics.messages).toContain("Application is not authorized.");
    expect(diagnostics.providerRequestId).toBe("provider-request-123");
    expect(diagnostics.bodyKind).toBe("json");
  });
  it("redacts credentials, card tokens and payer details and ignores arbitrary response fields", async () => {
    const accessToken = "APP_USR-sensitive-private-token", cardToken = "ab0123456789abcdef0123456789abcdef";
    const { diagnostics } = await readPaymentProviderResponse(Response.json({
      error: "forbidden", message: `Denied for buyer@example.test, CPF 529.982.247-25, token ${accessToken}; ${cardToken}`,
      errors: [{ code: "invalid_token", message: "webhook-super-secret was rejected" }],
      payer: { name: "Private Customer", email: "buyer@example.test" },
      transactions: [{ payment_method: { token: cardToken } }],
    }, { status: 403 }), [accessToken, cardToken, "webhook-super-secret"]);
    const serialized = JSON.stringify(diagnostics);
    for (const secret of [accessToken, cardToken, "webhook-super-secret", "buyer@example.test", "529.982.247-25", "Private Customer"])
      expect(serialized).not.toContain(secret);
    expect(diagnostics.codes).toEqual(["forbidden", "invalid_token"]);
  });
  it("does not log success bodies or html/plain error payloads", async () => {
    const success = await readPaymentProviderResponse(Response.json({ id: "ORD123", token: "private" }));
    expect(success.data).toMatchObject({ id: "ORD123" });
    expect(JSON.stringify(success.diagnostics)).not.toContain("private");
    const html = await readPaymentProviderResponse(new Response("<html>private-email@example.test</html>", { status: 403, headers: { "content-type": "text/html" } }));
    expect(html.diagnostics.bodyKind).toBe("html");
    expect(JSON.stringify(html.diagnostics)).not.toContain("private-email");
    const text = await readPaymentProviderResponse(new Response("Bearer secret-token", { status: 403 }));
    expect(text.diagnostics.bodyKind).toBe("text");
    expect(JSON.stringify(text.diagnostics)).not.toContain("secret-token");
  });
  it("handles errors expressed as objects, arrays and invalid JSON without exposing raw data", async () => {
    const nested = await readPaymentProviderResponse(Response.json({ error: { code: "forbidden", message: "Permission denied" }, errors: [{ code: "application_not_authorized", details: [{ code: "invalid_scope" }] }] }, { status: 403 }));
    expect(nested.diagnostics.codes).toEqual(["forbidden", "application_not_authorized", "invalid_scope"]);
    const invalid = await readPaymentProviderResponse(new Response('{"private": broken', { status: 502, headers: { "content-type": "application/json" } }));
    expect(invalid.diagnostics.bodyKind).toBe("invalid_json");
    expect(invalid.diagnostics.messages).toEqual([]);
  });
  it("distinguishes seller authorization from buyer validation and uncertain outcomes", () => {
    expect(paymentFailureMessage(403)).toContain("habilitação");
    expect(paymentFailureMessage(403)).not.toContain("Confira os dados");
    expect(paymentFailureMessage(401)).toContain("conexão");
    expect(paymentFailureMessage(400)).toContain("dados");
    expect(paymentFailureMessage(500)).toContain("Não realize outra cobrança");
  });
  it("bounds oversized bodies instead of exposing or accepting their content", async () => {
    const result = await readPaymentProviderResponse(new Response("x".repeat(2 * 1024 * 1024 + 1), { status: 403 }));
    expect(result.data).toBeNull();
    expect(result.diagnostics.bodyKind).toBe("truncated");
    expect(result.diagnostics.messages).toEqual([]);
  });
});
