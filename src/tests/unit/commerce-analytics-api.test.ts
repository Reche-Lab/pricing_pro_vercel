// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/commerce/admin/analytics/route";
import { requireCommerceAdmin, checkCommerceOrigin } from "@/services/commerce/http";
import { commerceAnalyticsReport, loadCommerceAnalyticsSettings, saveCommerceAnalyticsSettings } from "@/repositories/commerce-analytics";
import { CommerceError } from "@/domain/commerce/commerce";
import { analyticsFixtureReport as report, analyticsFixtureSettings as settings } from "../fixtures/commerce-analytics";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), requireCommerceAdmin: vi.fn(), checkCommerceOrigin: vi.fn() }));
vi.mock("@/repositories/commerce-analytics", () => ({ commerceAnalyticsReport: vi.fn(), loadCommerceAnalyticsSettings: vi.fn(), saveCommerceAnalyticsSettings: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn(async () => null) }));
afterEach(() => { vi.resetAllMocks(); });
function setup() { vi.mocked(requireCommerceAdmin).mockResolvedValue({ session: { tenantId: "tenant-a", userId: "user-a" } } as never); vi.mocked(loadCommerceAnalyticsSettings).mockResolvedValue(settings); vi.mocked(commerceAnalyticsReport).mockResolvedValue(report); }

describe("tenant analytics admin endpoints", () => {
  it("gets tenant scope exclusively from the authenticated administrator", async () => {
    setup(); const response = await GET(new Request("https://panel.test/api/commerce/admin/analytics?days=7&environment=test"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(commerceAnalyticsReport).toHaveBeenCalledWith("tenant-a", { days: "7", environment: "test" });
  });
  it("refuses caller-supplied tenant IDs, unsupported periods, and non-admin access", async () => {
    setup();
    for (const query of ["days=999", "tenantId=tenant-b", "environment=other"]) expect((await GET(new Request(`https://panel.test/api/commerce/admin/analytics?${query}`))).status).toBe(400);
    expect(commerceAnalyticsReport).not.toHaveBeenCalled();
    vi.mocked(requireCommerceAdmin).mockRejectedValue(new CommerceError("Somente administradores.", 403));
    expect((await GET(new Request("https://panel.test/api/commerce/admin/analytics"))).status).toBe(403);
  });
  it("enforces same-origin and strict settings before any configuration write", async () => {
    setup(); vi.mocked(saveCommerceAnalyticsSettings).mockResolvedValue(settings);
    const make = (body: unknown) => new Request("https://panel.test/api/commerce/admin/analytics", { method: "PUT", body: JSON.stringify(body), headers: { origin: "https://panel.test", "content-type": "application/json" } });
    expect((await PUT(make(settings))).status).toBe(200);
    expect(checkCommerceOrigin).toHaveBeenCalled(); expect(saveCommerceAnalyticsSettings).toHaveBeenCalledWith("tenant-a", "user-a", settings);
    vi.mocked(saveCommerceAnalyticsSettings).mockClear();
    expect((await PUT(make({ ...settings, tenantId: "tenant-b" }))).status).toBe(400);
    expect(saveCommerceAnalyticsSettings).not.toHaveBeenCalled();
    vi.mocked(checkCommerceOrigin).mockImplementation(() => { throw new CommerceError("Origem inválida", 403); });
    expect((await PUT(make(settings))).status).toBe(403);
  });
  it("explains a missing migration instead of exposing a raw PostgreSQL error", async () => {
    setup(); vi.mocked(loadCommerceAnalyticsSettings).mockRejectedValue({ code: "42703", message: "column analytics_settings does not exist" });
    const response = await GET(new Request("https://panel.test/api/commerce/admin/analytics"));
    expect(response.status).toBe(503); expect((await response.json()).error).toContain("0081_commerce_analytics.sql");
  });
});
