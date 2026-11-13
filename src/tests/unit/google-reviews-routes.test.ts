// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST, PUT } from "@/app/api/commerce/admin/google-reviews/route";
import { googleReviewsHttp } from "@/services/commerce/google-reviews-http";
import { requireCommerceAdmin } from "@/services/commerce/http";
import { getCommerceStore } from "@/repositories/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import { loadGoogleReviews, safeGoogleReviews, saveGoogleReviews, toggleGoogleReviews } from "@/repositories/commerce-google-reviews";
import { fetchGoogleReviews } from "@/services/commerce/google-reviews";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), requireCommerceAdmin: vi.fn() }));
vi.mock("@/repositories/commerce", () => ({ getCommerceStore: vi.fn() }));
vi.mock("@/services/commerce/preview", () => ({ requireCommercePreview: vi.fn() }));
vi.mock("@/repositories/commerce-google-reviews", async original => ({ ...await original<typeof import("@/repositories/commerce-google-reviews")>(), loadGoogleReviews: vi.fn(), saveGoogleReviews: vi.fn(), markGoogleReviewsTested: vi.fn(), toggleGoogleReviews: vi.fn(), removeGoogleReviewsKey: vi.fn() }));
vi.mock("@/services/commerce/google-reviews", () => ({ fetchGoogleReviews: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn(async () => null) }));
const session = { userId: "actor", tenantId: "tenant-a", email: "admin@example.test", role: "owner" as const };
const row = { tenant_id: session.tenantId, place_id: "ChIJtest123456789", title: "Avaliações", api_key_encrypted: "cipher-secret", daily_limit: 50, enabled: true, revision: 1, tested_revision: 1, tested_at: "2026-11-13T12:00:00Z", used_today: 0 };
const req = (body: object, method = "POST", origin = "https://panel.example.com") => new Request("https://panel.example.com/api/commerce/admin/google-reviews", { method, headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://panel.example.com"); vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", "{}");
  vi.mocked(requireCommerceAdmin).mockResolvedValue({ session, profile: {} } as never); vi.mocked(loadGoogleReviews).mockResolvedValue(row);
  vi.mocked(getCommerceStore).mockResolvedValue({ tenant_id: session.tenantId } as never); vi.mocked(requireCommercePreview).mockResolvedValue({ tenant_id: session.tenantId } as never);
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("Google reviews boundaries", () => {
  it("does not return secrets and requires administrative authentication", async () => {
    const response = await GET(); const data = await response.json(); expect(data.settings).toEqual(safeGoogleReviews(row)); expect(JSON.stringify(data)).not.toContain("cipher-secret"); expect(response.headers.get("cache-control")).toBe("no-store");
    vi.mocked(requireCommerceAdmin).mockRejectedValue(new CommerceError("Entre na conta.", 401)); expect((await GET()).status).toBe(401);
  });
  it("rejects cross-origin changes and tenant overrides", async () => {
    expect((await POST(req({ action: "test", revision: 1 }, "POST", "https://evil.test"))).status).toBe(403);
    const body = { placeId: row.place_id, title: "Avaliações", dailyLimit: 50, apiKey: "", revision: 1, tenantId: "other" };
    expect((await PUT(req(body, "PUT"))).status).toBe(400); expect(saveGoogleReviews).not.toHaveBeenCalled(); expect(fetchGoogleReviews).not.toHaveBeenCalled();
  });
  it("requires explicit profile confirmation before activating", async () => {
    expect((await POST(req({ action: "toggle", revision: 1, enabled: true }))).status).toBe(400); expect(toggleGoogleReviews).not.toHaveBeenCalled();
  });
  it("does not query Google for disabled or unconfigured public stores", async () => {
    vi.mocked(loadGoogleReviews).mockResolvedValue({ ...row, enabled: false });
    const response = await googleReviewsHttp(new Request("https://panel.example.com/api/store/store-a/google-reviews"), "store-a"); expect(await response.json()).toEqual({ enabled: false });
    expect((await googleReviewsHttp(req({}), "store-a")).status).toBe(404); expect(fetchGoogleReviews).not.toHaveBeenCalled();
  });
  it("uses published-store or authenticated preview resolution and rejects arbitrary place overrides", async () => {
    await googleReviewsHttp(new Request("https://panel.example.com/api/store/a/google-reviews"), "a"); expect(getCommerceStore).toHaveBeenCalledWith("a");
    vi.mocked(requireCommercePreview).mockRejectedValue(new CommerceError("Sem acesso.", 403)); expect((await googleReviewsHttp(req({}), "other-tenant", true)).status).toBe(403);
    expect((await googleReviewsHttp(req({ placeId: "another" }), "a")).status).toBe(400); expect(fetchGoogleReviews).not.toHaveBeenCalled();
  });
  it("honors rate limiting before the Google call", async () => {
    vi.mocked(enforcePublicRateLimit).mockResolvedValue(NextResponse.json({ ok: false, error: "blocked" }, { status: 429 }));
    expect((await googleReviewsHttp(req({}), "a")).status).toBe(429); expect(fetchGoogleReviews).not.toHaveBeenCalled();
  });
});
