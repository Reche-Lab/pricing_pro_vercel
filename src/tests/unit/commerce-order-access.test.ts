// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCommerceOrderAccess, requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { commerceEnabled } from "@/repositories/commerce";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile, userHasPermission } from "@/repositories/users";
vi.mock("@/repositories/commerce", () => ({ commerceEnabled: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/repositories/users", () => ({ getSessionProfile: vi.fn(), userHasPermission: vi.fn() }));
const profile = { user_id: "actor", tenant_id: "tenant", role: "viewer", is_super_admin: false } as NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>;
beforeEach(() => { vi.mocked(commerceEnabled).mockReturnValue(true); vi.mocked(getCurrentSession).mockResolvedValue({ userId: "actor", tenantId: "tenant", role: "viewer", email: "viewer@example.test" }); vi.mocked(getSessionProfile).mockResolvedValue(profile); vi.mocked(userHasPermission).mockImplementation(async (_user, _tenant, permission) => permission === "commerce:orders:read"); });
afterEach(() => vi.clearAllMocks());
describe("commerce staff authorization", () => {
  it("allows read-only staff without granting configuration, payment or editing privileges", async () => {
    expect(await getCommerceOrderAccess(profile)).toEqual({ read: true, manage: false, artworks: false, configure: false });
    await expect(requireCommerceOrderAccess()).resolves.toMatchObject({ session: { tenantId: "tenant" } });
    await expect(requireCommerceOrderAccess("commerce:artworks:write")).rejects.toMatchObject({ status: 403 });
    await expect(requireCommerceOrderAccess("commerce:orders:manage")).rejects.toMatchObject({ status: 403 });
    expect(userHasPermission).toHaveBeenCalledWith("actor", "tenant", "commerce:orders:read");
  });
  it("permits production editing independently from payment management", async () => {
    vi.mocked(userHasPermission).mockImplementation(async (_user, _tenant, permission) => permission !== "commerce:orders:manage");
    expect(await getCommerceOrderAccess(profile)).toEqual({ read: true, manage: false, artworks: true, configure: false });
    await expect(requireCommerceOrderAccess("commerce:artworks:write")).resolves.toBeTruthy();
  });
  it("never trusts a permission without read access, nor a missing membership or session", async () => {
    vi.mocked(userHasPermission).mockImplementation(async (_user, _tenant, permission) => permission !== "commerce:orders:read");
    await expect(requireCommerceOrderAccess("commerce:artworks:write")).rejects.toMatchObject({ status: 403 });
    vi.mocked(getSessionProfile).mockResolvedValue(null as unknown as typeof profile);
    await expect(requireCommerceOrderAccess()).rejects.toMatchObject({ status: 403 });
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    await expect(requireCommerceOrderAccess()).rejects.toMatchObject({ status: 401 });
  });
  it("hides the module when disabled, including for administrators", async () => {
    vi.mocked(commerceEnabled).mockReturnValue(false);
    expect((await getCommerceOrderAccess({ ...profile, role: "owner" })).read).toBe(false);
    await expect(requireCommerceOrderAccess()).rejects.toMatchObject({ status: 404 });
  });
});
