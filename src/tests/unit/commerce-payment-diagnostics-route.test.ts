// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/commerce/admin/payments/diagnostics/route";
import { requireCommerceAdmin } from "@/services/commerce/http";
import { diagnosePaymentConnection } from "@/services/commerce/payment-connection-diagnostics";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), requireCommerceAdmin: vi.fn() }));
vi.mock("@/services/commerce/payment-connection-diagnostics", () => ({ diagnosePaymentConnection: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn() }));
const request = (body: unknown = { environment: "test" }, origin = "https://panel.test") => new Request("https://panel.test/api/commerce/admin/payments/diagnostics", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://panel.test");
  vi.mocked(requireCommerceAdmin).mockResolvedValue({ session: { tenantId: "authenticated-tenant" } } as never);
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
  vi.mocked(diagnosePaymentConnection).mockResolvedValue({ environment: "test", checks: [] });
});
afterEach(() => vi.unstubAllEnvs());
describe("admin payment diagnostic authorization", () => {
  it("requires an authenticated administrator and same origin", async () => {
    expect((await POST(request({}, "https://attacker.test"))).status).toBe(403);
    vi.mocked(requireCommerceAdmin).mockRejectedValue(new CommerceError("Entre na conta administrativa.", 401));
    expect((await POST(request())).status).toBe(401);
    expect(diagnosePaymentConnection).not.toHaveBeenCalled();
  });
  it("rejects caller-controlled tenants, credentials and environments", async () => {
    for (const body of [{ environment: "test", tenantId: "other" }, { environment: "test", accessToken: "private" }, { environment: "invalid" }]) expect((await POST(request(body))).status).toBe(400);
    expect(diagnosePaymentConnection).not.toHaveBeenCalled();
  });
  it("scopes the diagnosis to the session and applies throttling", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(diagnosePaymentConnection).toHaveBeenCalledWith("authenticated-tenant", "test");
    vi.mocked(diagnosePaymentConnection).mockClear();
    vi.mocked(enforcePublicRateLimit).mockResolvedValue(Response.json({ error: "Aguarde" }, { status: 429 }) as never);
    expect((await POST(request())).status).toBe(429);
    expect(diagnosePaymentConnection).not.toHaveBeenCalled();
  });
});
