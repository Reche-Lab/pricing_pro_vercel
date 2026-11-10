// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/commerce/admin/olist/route";
import { POST } from "@/app/api/commerce/admin/orders/[orderId]/olist/route";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile, userHasPermission } from "@/repositories/users";
import { getCommerceOlistAdmin, saveCommerceOlistSettings } from "@/repositories/commerce-olist";
import { authorizedCommerceOrder } from "@/services/commerce/order-artworks";
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/repositories/users", () => ({ getSessionProfile: vi.fn(), userHasPermission: vi.fn() }));
vi.mock("@/repositories/commerce-olist", () => ({ getCommerceOlistAdmin: vi.fn(), saveCommerceOlistSettings: vi.fn(), getCommerceOlistSettings: vi.fn(), getCommerceOlistJob: vi.fn(), queueCommerceOlistOrder: vi.fn() }));
vi.mock("@/services/commerce/order-artworks", () => ({ authorizedCommerceOrder: vi.fn(), assertCommerceProofsReady: vi.fn() }));
const profile = { user_id: "actor", tenant_id: "tenant", role: "owner", is_super_admin: false } as NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>;
const request = (body: unknown, origin = "https://app.example.test") => new Request("https://app.example.test/api/commerce/admin/olist", { method: "PUT", headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.stubEnv("COMMERCE_ENABLED", "true"); vi.stubEnv("APP_URL", "https://app.example.test");
  vi.mocked(getCurrentSession).mockResolvedValue({ userId: "actor", tenantId: "tenant", role: "owner", email: "admin@example.test" });
  vi.mocked(getSessionProfile).mockResolvedValue(profile); vi.mocked(userHasPermission).mockResolvedValue(false);
  vi.mocked(getCommerceOlistAdmin).mockResolvedValue({ configured: true, settings: {} as never, options: [] });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("commerce Olist authorization boundaries", () => {
  it("denies anonymous access and does not trust admin claims from inactive memberships", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null); expect((await GET()).status).toBe(401);
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: "actor", tenantId: "tenant", role: "owner", email: "admin@example.test" });
    vi.mocked(getSessionProfile).mockResolvedValue(null as never); expect((await GET()).status).toBe(403);
    expect(getCommerceOlistAdmin).not.toHaveBeenCalled();
  });
  it("restricts configuration to owner/admin or a database-authorized superadmin", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue({ ...profile, role: "viewer" }); expect((await GET()).status).toBe(403);
    vi.mocked(getSessionProfile).mockResolvedValue({ ...profile, role: "viewer", is_super_admin: true }); expect((await GET()).status).toBe(200);
    expect(getCommerceOlistAdmin).toHaveBeenCalledWith("tenant");
  });
  it("rejects cross-origin requests and tenant overrides before saving anything", async () => {
    expect((await PUT(request({ enabled: true }, "https://attacker.test"))).status).toBe(403);
    expect((await PUT(request({ tenantId: "another", enabled: true }))).status).toBe(400);
    expect(saveCommerceOlistSettings).not.toHaveBeenCalled();
  });
  it("does not permit readers to run mutations or accept an injected tenant", async () => {
    const params = { params: Promise.resolve({ orderId: "11111111-1111-4111-8111-111111111111" }) };
    vi.mocked(getSessionProfile).mockResolvedValue({ ...profile, role: "viewer" });
    expect((await POST(request({ action: "retry", note: "Tentativa indevida" }), params)).status).toBe(403);
    vi.mocked(getSessionProfile).mockResolvedValue(profile);
    expect((await POST(request({ action: "retry", note: "Conferir etapas", tenantId: "another" }), params)).status).toBe(400);
    expect(authorizedCommerceOrder).not.toHaveBeenCalled();
  });
});
