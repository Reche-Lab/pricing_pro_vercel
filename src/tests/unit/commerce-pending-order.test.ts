// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changePendingOrder } from "@/services/commerce/pending-order";
import { commerceTransaction } from "@/repositories/commerce";
import { revokePendingPayment } from "@/services/commerce/payment-revocation";
import { testCommerceBilling } from "../fixtures/commerce-checkout";
vi.mock("@/repositories/commerce", () => ({ commerceTransaction: vi.fn() }));
vi.mock("@/services/commerce/payment-revocation", () => ({ revokePendingPayment: vi.fn() }));
vi.mock("@/lib/crypto/secrets", () => ({ encryptTenantSecret: vi.fn(() => "encrypted") }));
const query = vi.fn();
const lines = [{ id: "line", productId: "product", quantity: 10, artworkId: "art" }];
const order = { id: "order", tenant_id: "tenant", customer_id: "buyer", session_id: "session", cart_revision: 2, payment_status: "pending", fulfillment_status: "received", snapshot: { lines, items: [], products: [], billing: { ...testCommerceBilling, personType: "F" }, customer: {}, delivery: "pickup" } };
const session = { id: "session", tenant_id: "tenant", customer_id: "buyer", revision: 2, cart: lines };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(commerceTransaction).mockImplementation(work => work({ query } as never));
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes("id<>$4") ? [] : sql.includes("from commerce_orders") ? [order] : sql.includes("from commerce_sessions") ? [session] : [], rowCount: 1 }));
});
describe("pending purchase lifecycle", () => {
  it("reopens the same items and artworks without clearing them, after revoking payment", async () => {
    await changePendingOrder("tenant", session as never, "order", { action: "edit", revision: 2, confirm: true });
    expect(revokePendingPayment).toHaveBeenCalledWith(expect.anything(), order);
    const update = query.mock.calls.find(([sql]) => sql.startsWith("update commerce_sessions"));
    expect(JSON.parse(update![1][3])).toEqual(lines);
    expect(query.mock.calls.some(([sql]) => sql.includes("cancelled_at=now()"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes("commerce_order_events"))).toBe(true);
  });
  it.each(["paid", "refunded"])("never rewrites a %s order", async payment_status => {
    const base = query.getMockImplementation()!;
    query.mockImplementation((sql: string, ...args: unknown[]) => sql.includes("from commerce_orders") ? Promise.resolve({ rows: [{ ...order, payment_status }] }) : base(sql, ...args));
    await expect(changePendingOrder("tenant", session as never, "order", { action: "clear", revision: 2, confirm: true })).rejects.toMatchObject({ status: 409 });
    expect(revokePendingPayment).not.toHaveBeenCalled();
  });
  it("fails closed when cancellation cannot be confirmed", async () => {
    vi.mocked(revokePendingPayment).mockRejectedValueOnce(new Error("Pagamento em processamento"));
    await expect(changePendingOrder("tenant", session as never, "order", { action: "clear", revision: 2, confirm: true })).rejects.toThrow("processamento");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("update"))).toBe(false);
  });
  it("rejects stale revisions and unconfirmed replacement of a different cart", async () => {
    await expect(changePendingOrder("tenant", session as never, "order", { action: "edit", revision: 1, confirm: true })).rejects.toMatchObject({ status: 409 });
    const base = query.getMockImplementation()!;
    query.mockImplementation((sql: string, ...args: unknown[]) => sql.includes("from commerce_sessions") ? Promise.resolve({ rows: [{ ...session, revision: 5, cart: [{ id: "other" }] }] }) : base(sql, ...args));
    await expect(changePendingOrder("tenant", session as never, "order", { action: "edit", revision: 5, confirm: true })).rejects.toMatchObject({ status: 409 });
    expect(revokePendingPayment).not.toHaveBeenCalled();
  });
  it("clears only after explicit confirmation, preserving the previous order history", async () => {
    await changePendingOrder("tenant", session as never, "order", { action: "clear", revision: 2, confirm: true });
    expect(JSON.parse(query.mock.calls.find(([sql]) => sql.startsWith("update commerce_sessions"))![1][3])).toEqual([]);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("delete from commerce_orders"))).toBe(false);
  });
  it("scopes the operation to the signed-in buyer and tenant", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(changePendingOrder("tenant", session as never, "foreign", { action: "edit", revision: 2, confirm: true })).rejects.toMatchObject({ status: 404 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("customer_id=$2"), ["tenant", "buyer", "foreign"]);
    expect(revokePendingPayment).not.toHaveBeenCalled();
  });
});
