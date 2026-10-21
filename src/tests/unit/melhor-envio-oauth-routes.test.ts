import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as pricingQuote } from "@/app/api/shipping/melhor-envio/quote/route";
import { POST as savedQuote } from "@/app/api/quotes/[quoteId]/melhor-envio/quote/route";
import { GET as authUrl } from "@/app/api/melhor-envio/auth-url/route";
import { GET as callback } from "@/app/api/melhor-envio/oauth/callback/route";
import { getCurrentSession } from "@/lib/auth/session";
import { createOAuthState, consumeOAuthState, getIntegrationConnection, updateIntegrationCredentials } from "@/repositories/integrations";
import { quoteMelhorEnvioShipping, exchangeMelhorEnvioAuthorizationCode, MelhorEnvioRequestError } from "@/services/melhor-envio/melhor-envio";

vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/repositories/integrations", () => ({ getIntegrationConnection: vi.fn(), decryptIntegrationCredentials: () => ({ clientId: "client", clientSecret: "secret" }), logIntegrationEvent: vi.fn(), createOAuthState: vi.fn(), consumeOAuthState: vi.fn(), updateIntegrationCredentials: vi.fn() }));
vi.mock("@/repositories/packaging", () => ({ estimatePackaging: vi.fn().mockResolvedValue({ boxesNeeded: 1 }) }));
vi.mock("@/repositories/shipments", () => ({ createShipmentDraft: vi.fn() }));
vi.mock("@/repositories/quotes", () => ({ getQuoteDetail: vi.fn().mockResolvedValue({ quote: { customer_postal_code: "11696202", grand_total: 1125 }, items: [{ product_variant_id: "product", quantity: 10 }] }) }));
vi.mock("@/repositories/tenant-settings", () => ({ getTenantShippingProfile: vi.fn().mockResolvedValue({ postal_code: "12212650" }) }));
vi.mock("@/services/melhor-envio/melhor-envio", async original => ({ ...await original<typeof import("@/services/melhor-envio/melhor-envio")>(), quoteMelhorEnvioShipping: vi.fn(), exchangeMelhorEnvioAuthorizationCode: vi.fn() }));
const quoteId = "d088fe4f-2322-49fb-926d-62b3fa21435a";
const attempt = "70b23630-9dc0-447f-9aef-acf4642db663";
const path = `/melhor-envio/oauth/complete?attempt=${attempt}`;
beforeEach(() => {
  vi.mocked(getCurrentSession).mockResolvedValue({ userId: "user", tenantId: "tenant" } as never);
  vi.mocked(getIntegrationConnection).mockResolvedValue({ status: "active", settings: { redirect_uri: "https://app.test/api/melhor-envio/oauth/callback" } } as never);
  vi.mocked(quoteMelhorEnvioShipping).mockRejectedValue(new MelhorEnvioRequestError("Unauthenticated.", 401, { message: "Unauthenticated." }));
  vi.mocked(consumeOAuthState).mockResolvedValue({ user_id: "user", tenant_id: "tenant", redirect_path: path } as never);
  vi.mocked(exchangeMelhorEnvioAuthorizationCode).mockResolvedValue({ access_token: "new-token", refresh_token: "new-refresh" });
});
afterEach(() => { vi.clearAllMocks(); });
describe("Melhor Envio quote and OAuth response contracts", () => {
  it.each(["pricing", "quote"])("marks expired upstream authentication in the %s flow", async flow => {
    const response = flow === "pricing"
      ? await pricingQuote(new Request("https://app.test", { method: "POST", body: JSON.stringify({ productVariantId: quoteId, quantity: 10, originPostalCode: "12212650", destinationPostalCode: "11696202" }) }))
      : await savedQuote(new Request("https://app.test", { method: "POST", body: "{}" }), { params: Promise.resolve({ quoteId }) });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "melhor_envio_oauth_invalid", reconnectRequired: true, provider: "melhor_envio", httpStatus: 401 });
  });
  it("does not treat the local platform session as an expired provider token", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const response = await pricingQuote(new Request("https://app.test", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("reconnectRequired");
  });
  it("stores only the permitted popup completion path in tenant-bound OAuth state", async () => {
    await authUrl(new Request(`https://app.test/api/melhor-envio/auth-url?redirectPath=${encodeURIComponent(path)}`));
    expect(createOAuthState).toHaveBeenCalledWith("user", "tenant", expect.objectContaining({ provider: "melhor_envio", redirectPath: path }));
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/settings?unsafe=1"])("rejects unexpected redirect targets %s", async redirect => {
    await authUrl(new Request(`https://app.test/api/melhor-envio/auth-url?redirectPath=${encodeURIComponent(redirect)}`));
    expect(createOAuthState).toHaveBeenCalledWith("user", "tenant", expect.objectContaining({ redirectPath: "/settings" }));
  });
  it("persists tokens under the state tenant and returns success to the original attempt", async () => {
    const response = await callback(new Request("https://app.test/api/melhor-envio/oauth/callback?state=state&code=code"));
    expect(updateIntegrationCredentials).toHaveBeenCalledWith("user", "tenant", expect.objectContaining({ provider: "melhor_envio", status: "active" }));
    expect(response.headers.get("location")).toBe(`https://app.test${path}&melhor_envio=connected`);
  });
  it("returns denial to the popup without exchanging or persisting tokens", async () => {
    const response = await callback(new Request("https://app.test/api/melhor-envio/oauth/callback?state=state&error=access_denied"));
    expect(response.headers.get("location")).toContain(`${path}&melhor_envio=error`);
    expect(exchangeMelhorEnvioAuthorizationCode).not.toHaveBeenCalled();
    expect(updateIntegrationCredentials).not.toHaveBeenCalled();
  });
});
