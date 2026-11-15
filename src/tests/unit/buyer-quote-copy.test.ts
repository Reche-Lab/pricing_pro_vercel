// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { restoreBuyerQuote } from "@/repositories/commerce-buyer-quotes";
import { getPool } from "@/lib/db/client";
import { commerceProducts, commerceTransaction } from "@/repositories/commerce";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { savedBuyerQuote, quoteCart, quoteProduct } from "../fixtures/commerce-quote";
import type { CommerceStore } from "@/repositories/commerce";
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/repositories/commerce", async original => ({ ...await original<typeof import("@/repositories/commerce")>(), commerceProducts: vi.fn(), commerceTransaction: vi.fn() }));
const query = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPool).mockReturnValue({ query: vi.fn(async () => ({ rows: [{ ...savedBuyerQuote, contact_encrypted: encryptTenantSecret(savedBuyerQuote.contact) }] })) } as never);
  vi.mocked(commerceTransaction).mockImplementation(async work => work({ query } as never));
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes("update commerce_sessions") ? [{ id: "session" }] : [], rowCount: 1 }));
  vi.mocked(commerceProducts).mockResolvedValue([{ ...quoteProduct, variantId: "variant", margins: { bleedMm: 2, safeMarginMm: 2 }, geometry: null, pricingRule: "per_art", curve: { mode: "step", points: [{ quantity: 1, unitPrice: 5 }] }, platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 } }] as never);
});
describe("safe quote copy through the existing restore operation", () => {
  it("never updates the saved quote and restores only an authenticated, revision-matching cart", async () => {
    const original = JSON.stringify(savedBuyerQuote);
    await restoreBuyerQuote({ tenant_id: "tenant" } as CommerceStore, { id: "session", tenant_id: "tenant", customer_id: "buyer", revision: 7, cart: [] }, savedBuyerQuote.id, 7);
    expect(getPool().query).toHaveBeenCalledWith(expect.stringContaining("customer_id=$2"), ["tenant", "buyer", savedBuyerQuote.id]);
    const update = query.mock.calls.find(([sql]) => sql.includes("update commerce_sessions"))!;
    expect(update[1].slice(0, 3)).toEqual(["tenant", "session", 7]); expect(update[1][4]).toBe("buyer");
    const lines = JSON.parse(update[1][3]); expect(lines[0].id).not.toBe(quoteCart.lines[0].id); expect(lines[0].artworkId).toBeNull();
    expect(query.mock.calls.some(([sql]) => /(?:update|delete from) commerce_buyer_quotes/i.test(sql))).toBe(false);
    expect(JSON.stringify(savedBuyerQuote)).toBe(original);
  });
  it("does not drop unavailable products or create an empty copy silently", async () => {
    vi.mocked(commerceProducts).mockResolvedValue([]);
    await expect(restoreBuyerQuote({ tenant_id: "tenant" } as CommerceStore, { id: "session", tenant_id: "tenant", customer_id: "buyer", revision: 7, cart: [] }, savedBuyerQuote.id, 7)).rejects.toThrow(/disponível/);
    expect(query.mock.calls.some(([sql]) => sql.includes("update commerce_sessions"))).toBe(false);
  });
});
