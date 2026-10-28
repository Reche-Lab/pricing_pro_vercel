import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateQuoteCustomerDelivery } from "@/repositories/quotes";
const { query, context } = vi.hoisted(() => ({ query: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ withTenantContext: context, getPool: vi.fn() }));
const input = { name: "Nome Olist", addressLine: "Rua Olist", phone: "11999999999", attentionTo: "Marina", sourceOlistExternalId: "2" };
beforeEach(() => {
  vi.resetAllMocks();
  context.mockImplementation((_user, _tenant, callback) => callback({ query }));
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes("from quotes")
    ? [{ customer_id: "customer", status: "draft", delivery_attention_to: "Marina" }]
    : sql.includes("from customers") ? [{ name: "Nome antigo", external_olist_id: "2" }]
      : sql.includes("update customers") ? [{ id: "customer", name: "Nome Olist", address_line: "Rua Olist", external_olist_id: "2" }] : [] }));
});
describe("persist reviewed Olist customer fields", () => {
  it("keeps the link, updates under tenant context and records the import source", async () => {
    const result = await updateQuoteCustomerDelivery("user", "tenant", "quote", input);
    expect(context).toHaveBeenCalledWith("user", "tenant", expect.any(Function));
    expect(result).toMatchObject({ customer: { external_olist_id: "2" }, deliveryAttentionTo: "Marina" });
    const update = query.mock.calls.find(([sql]) => sql.includes("update customers"));
    expect(update?.[1].slice(0, 3)).toEqual(["tenant", "customer", "Nome Olist"]);
    expect(update?.[0]).not.toMatch(/set external_olist_id/);
    const audit = query.mock.calls.find(([sql]) => sql.includes("insert into audit_logs"));
    expect(JSON.parse(audit?.[1][3])).toMatchObject({ customerId: "customer", sourceOlistExternalId: "2", attentionToChanged: false });
  });
  it("rejects a stale imported profile if another customer was linked before saving", async () => {
    await expect(updateQuoteCustomerDelivery("user", "tenant", "quote", { ...input, sourceOlistExternalId: "9" })).rejects.toThrow("vinculado mudou");
    expect(query.mock.calls.some(([sql]) => sql.includes("update customers"))).toBe(false);
  });
  it("rechecks acceptance inside the locked transaction", async () => {
    query.mockResolvedValue({ rows: [{ status: "accepted", customer_id: "customer" }] });
    await expect(updateQuoteCustomerDelivery("user", "tenant", "quote", input)).rejects.toThrow("fechado para edição");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
