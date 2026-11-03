// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/quotes/[quoteId]/route";
import { QuoteShippingError } from "@/domain/quotes/shipping";

const mocks = vi.hoisted(() => ({ session: vi.fn(), billing: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/billing/guard", () => ({ requireWritableBilling: mocks.billing }));
vi.mock("@/repositories/quotes", () => ({ updateQuoteShippingTotal: mocks.update, deleteQuote: vi.fn() }));
vi.mock("@/repositories/users", () => ({ userHasPermission: vi.fn() }));
const quoteId = "75f17ee8-598d-49b8-8114-b8c0007283d2";
const call = () => PATCH(new Request(`https://app.test/api/quotes/${quoteId}`, { method: "PATCH", body: JSON.stringify({ shippingTotal: 30 }) }), { params: Promise.resolve({ quoteId }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.session.mockResolvedValue({ userId: "user", tenantId: "tenant" });
  mocks.billing.mockResolvedValue(null);
});

describe("quote shipping update errors", () => {
  it.each(["delivery_method", "shipping_olist_sync_pending"])("identifies the pending pickup migration when %s is missing", async column => {
    mocks.update.mockRejectedValue(Object.assign(new Error(`column "${column}" does not exist`), { code: "42703" }));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "database_migration_required", requiredMigration: "0066_quote_pickup.sql", error: expect.stringContaining("0066_quote_pickup.sql") });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("Quote shipping update failed.", expect.objectContaining({ quoteId, tenantId: "tenant", databaseCode: "42703" }));
  });
  it("does not misdiagnose another database failure or expose its internal details", async () => {
    mocks.update.mockRejectedValue(Object.assign(new Error('column "private_column" does not exist'), { code: "42703" }));
    const response = await call();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Não foi possível atualizar o frete. Tente novamente ou informe o administrador.");
    expect(body).not.toHaveProperty("requiredMigration");
    expect(JSON.stringify(body)).not.toContain("private_column");
  });
  it("preserves actionable business-rule errors", async () => {
    mocks.update.mockRejectedValue(new QuoteShippingError("Orçamento com nota fiscal não permite alteração."));
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Orçamento com nota fiscal não permite alteração." });
  });
  it("still updates freight and returns the recalculated total when the database is migrated", async () => {
    mocks.update.mockResolvedValue({ id: quoteId, shipping_total: "30.00", grand_total: "180.00" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("user", "tenant", quoteId, 30);
    expect(await response.json()).toMatchObject({ ok: true, quote: { shipping_total: "30.00", grand_total: "180.00" } });
  });
  it("does not attempt a write for unauthenticated or billing-blocked requests", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(401);
    mocks.billing.mockResolvedValue(new Response("blocked", { status: 402 }));
    expect((await call()).status).toBe(402);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
