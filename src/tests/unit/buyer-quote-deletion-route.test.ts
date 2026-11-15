// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/store/[slug]/quotes/[quoteId]/route";
import { deleteBuyerQuote } from "@/repositories/commerce-buyer-quotes";
import { buyerContext } from "@/services/commerce/http";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/repositories/commerce-buyer-quotes", () => ({ deleteBuyerQuote: vi.fn(), getBuyerQuote: vi.fn(), restoreBuyerQuote: vi.fn() }));
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), buyerContext: vi.fn() }));
const id = "aaaaaaaa-0000-4000-8000-000000000001", session = { id: "session", customer_id: "buyer" };
const context = (quoteId = id) => ({ params: Promise.resolve({ slug: "test", quoteId }) });
const request = (body: unknown = { confirmDelete: true }, origin = "https://shop.example.test") => new Request(`https://shop.example.test/api/store/test/quotes/${id}`, { method: "DELETE", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_URL", "https://shop.example.test");
  vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "tenant" }, session } as Awaited<ReturnType<typeof buyerContext>>);
  vi.mocked(deleteBuyerQuote).mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());
describe("buyer quote deletion HTTP boundary", () => {
  it("requires same-origin confirmation and derives ownership from the session", async () => {
    const response = await DELETE(request(), context());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deleteBuyerQuote).toHaveBeenCalledWith("tenant", session, id);
    expect(buyerContext).toHaveBeenCalledWith("test", false, true);
  });
  it("rejects forged origins, missing consent, invalid IDs and client-supplied ownership", async () => {
    expect((await DELETE(request({ confirmDelete: true }, "https://attacker.test"), context())).status).toBe(403);
    expect((await DELETE(request(), context("hook.js"))).status).toBe(404);
    for (const body of [{}, { confirmDelete: false }, { confirmDelete: true, tenantId: "other" }, { confirmDelete: true, customerId: "other" }])
      expect((await DELETE(request(body), context())).status).toBe(400);
    expect(deleteBuyerQuote).not.toHaveBeenCalled();
  });
  it("rejects expired sessions and returns a generic not-found response for inaccessible quotes", async () => {
    vi.mocked(buyerContext).mockRejectedValueOnce(new CommerceError("Sessão expirada.", 401));
    expect((await DELETE(request(), context())).status).toBe(401);
    expect(deleteBuyerQuote).not.toHaveBeenCalled();
    vi.mocked(deleteBuyerQuote).mockRejectedValueOnce(new CommerceError("Orçamento não encontrado nesta conta.", 404));
    expect((await DELETE(request(), context())).status).toBe(404);
  });
});
