// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/commerce/admin/orders/[orderId]/route";
import { deleteCommerceOrder } from "@/repositories/commerce-orders";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile } from "@/repositories/users";
vi.mock("@/repositories/commerce-orders", () => ({
  deleteCommerceOrder: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/repositories/users", () => ({ getSessionProfile: vi.fn() }));
const id = "11111111-2222-4333-8444-555555555555",
  input = { confirmation: "EXCLUIR 11111111", reason: "Compra duplicada" };
const params = { params: Promise.resolve({ orderId: id }) };
const request = (body: unknown = input, origin = "https://app.example.test") =>
  new Request(`https://app.example.test/api/commerce/admin/orders/${id}`, {
    method: "DELETE",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const profile = {
  user_id: "actor",
  tenant_id: "tenant",
  role: "admin",
  is_super_admin: false,
} as NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>;
beforeEach(() => {
  vi.stubEnv("COMMERCE_ENABLED", "true");
  vi.stubEnv("APP_URL", "https://app.example.test");
  vi.mocked(getCurrentSession).mockResolvedValue({
    tenantId: "tenant",
    userId: "actor",
    email: "admin@example.test",
    role: "admin",
  });
  vi.mocked(getSessionProfile).mockResolvedValue(profile);
  vi.mocked(deleteCommerceOrder).mockResolvedValue({ alreadyDeleted: false });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("order DELETE security boundary", () => {
  it.each([
    { role: "owner", is_super_admin: false },
    { role: "admin", is_super_admin: false },
    { role: "viewer", is_super_admin: true },
  ])(
    "allows an authorized $role with superadmin=$is_super_admin",
    async (role) => {
      vi.mocked(getSessionProfile).mockResolvedValue({ ...profile, ...role });
      const response = await DELETE(request(), params);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(deleteCommerceOrder).toHaveBeenCalledWith(
        "tenant",
        "actor",
        id,
        input,
      );
    },
  );
  it("denies missing sessions and non-admin staff even if their token claims admin", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    expect((await DELETE(request(), params)).status).toBe(401);
    vi.mocked(getCurrentSession).mockResolvedValue({
      tenantId: "tenant",
      userId: "actor",
      email: "staff@example.test",
      role: "admin",
    });
    vi.mocked(getSessionProfile).mockResolvedValue({
      ...profile,
      role: "manager",
    });
    expect((await DELETE(request(), params)).status).toBe(403);
    expect(deleteCommerceOrder).not.toHaveBeenCalled();
  });
  it("rejects invalid origins, IDs, confirmations, reasons and tenant overrides", async () => {
    expect(
      (await DELETE(request(input, "https://attacker.test"), params)).status,
    ).toBe(403);
    expect(
      (
        await DELETE(request(), {
          params: Promise.resolve({ orderId: "hook.js" }),
        })
      ).status,
    ).toBe(404);
    for (const body of [
      { ...input, confirmation: "excluir" },
      { ...input, reason: " " },
      { ...input, tenantId: "other" },
    ])
      expect((await DELETE(request(body), params)).status).toBe(400);
    expect(deleteCommerceOrder).not.toHaveBeenCalled();
  });
  it("returns a debug reference without leaking internal database errors", async () => {
    vi.mocked(deleteCommerceOrder).mockRejectedValueOnce(
      new Error("private-db-error"),
    );
    const response = await DELETE(request(), params),
      body = await response.json();
    expect(response.status).toBe(500);
    expect(body.debugId).toBeTruthy();
    expect(body.error).not.toContain("private-db-error");
  });
});
