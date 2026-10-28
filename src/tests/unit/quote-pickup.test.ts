import { beforeEach, describe, expect, it, vi } from "vitest";
import { setQuotePickup } from "@/repositories/quote-shipping";
import { quoteShippingEditBlock, pickupNotes } from "@/domain/quotes/shipping";

const { query, context } = vi.hoisted(() => ({ query: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ withTenantContext: context }));
vi.mock("@/repositories/quotes", () => ({ rebalanceQuotePaymentInstallments: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  context.mockImplementation((_user, _tenant, callback) => callback({ query }));
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes("for update") ? [{ id: "quote", status: "draft", shipping_total: "30", subtotal: "200", discount_total: "20", grand_total: "210", notes: "Observação do cliente\nFrete incluido: R$ 30,00", external_olist_order_id: "123" }] : [] }));
});
describe("quote pickup", () => {
  it("locks the tenant quote and records the old/new totals, actor, reason and pending ERP adjustment", async () => {
    const result = await setQuotePickup("user", "tenant", "quote", { expectedShippingTotal: 30, reason: "Cliente vem buscar" });
    expect(result).toMatchObject({ shippingTotal: 0, grandTotal: 180, olistPending: true });
    expect(context).toHaveBeenCalledWith("user", "tenant", expect.any(Function));
    expect(query.mock.calls[0]).toEqual([expect.stringContaining("for update"), ["tenant", "quote"]]);
    const audit = query.mock.calls.find(([sql]) => sql.includes("insert into quote_edit_logs"));
    expect(audit?.[1]).toEqual(expect.arrayContaining(["tenant", "quote", "user", "Cliente vem buscar"]));
    expect(JSON.parse(audit?.[1][4])).toMatchObject({ quote: { shippingTotal: 30, grandTotal: 210 } });
    expect(JSON.parse(audit?.[1][5])).toMatchObject({ quote: { shippingTotal: 0, grandTotal: 180, deliveryMethod: "pickup" } });
  });
  it("rejects stale totals before any update", async () => {
    await expect(setQuotePickup("user", "tenant", "quote", { expectedShippingTotal: 40, reason: "Retirada" })).rejects.toThrow("mudou");
    expect(query.mock.calls.some(([sql]) => sql.includes("update quotes"))).toBe(false);
  });
  it("does not repeat local mutations or audit on a second confirmed click", async () => {
    query.mockResolvedValue({ rows: [{ status: "draft", delivery_method: "pickup", shipping_total: "0", subtotal: "200", discount_total: "20", shipping_olist_sync_pending: true }] });
    expect(await setQuotePickup("user", "tenant", "quote", { expectedShippingTotal: 0, reason: "Retirada" })).toMatchObject({ alreadyPickup: true, olistPending: true });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("blocks invoiced and accepted quotes unless administratively reopened", () => {
    expect(quoteShippingEditBlock({ external_olist_invoice_id: "123" })).toMatch(/nota fiscal/);
    expect(quoteShippingEditBlock({ status: "accepted" })).toMatch(/reabra/i);
    expect(quoteShippingEditBlock({ status: "accepted", edit_reopened_at: "2026-10-28" })).toBeNull();
    expect(quoteShippingEditBlock({ status: "cancelled" })).toBeTruthy();
  });
  it("replaces generated shipping notes, preserves unrelated notes, and stays idempotent", () => {
    const notes = pickupNotes("Urgente\nCEP origem: 11111-111\nServico de frete: SEDEX\nFrete incluido: R$ 30\nCEP destino: 22222-222");
    expect(notes).toContain("Urgente");
    expect(notes).not.toContain("SEDEX");
    expect(notes).not.toContain("Frete incluido:");
    expect(notes).toContain("Retirada no local");
    expect(pickupNotes(notes)).toBe(notes);
  });
});
