// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBuyerQuote } from "@/repositories/commerce-buyer-quotes";
import { getPool } from "@/lib/db/client";
import type { BuyerSession } from "@/repositories/commerce";
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
const query = vi.fn(), session = { customer_id: "buyer" } as BuyerSession;
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getPool).mockReturnValue({ query } as never); });
describe("private buyer quote deletion", () => {
  it("atomically deletes only the quote owned by the authenticated tenant and buyer", async () => {
    query.mockResolvedValue({ rows: [{ id: "quote" }] });
    expect(await deleteBuyerQuote("tenant", session, "quote")).toEqual({ ok: true });
    expect(query).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledWith("delete from commerce_buyer_quotes where tenant_id=$1 and customer_id=$2 and id=$3 returning id", ["tenant", "buyer", "quote"]);
  });
  it("does not expose whether another buyer or tenant owns a missing quote", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(deleteBuyerQuote("tenant", session, "other")).rejects.toMatchObject({ status: 404 });
  });
  it("requires a signed-in buyer before issuing any database operation", async () => {
    await expect(deleteBuyerQuote("tenant", { ...session, customer_id: null }, "quote")).rejects.toMatchObject({ status: 401 });
    expect(query).not.toHaveBeenCalled();
  });
});
