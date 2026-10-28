// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/quotes/[quoteId]/olist/customer/use/route";
const mocks = vi.hoisted(() => ({ load: vi.fn(), send: vi.fn(), link: vi.fn(), updateProfile: vi.fn(), guard: vi.fn(), billing: vi.fn() }));
vi.mock("@/repositories/customers", () => ({ updateCustomerExternalOlistId: mocks.link, updateCustomerFromOlistProfile: mocks.updateProfile }));
vi.mock("@/repositories/quotes", () => ({ assertQuoteCanBeEdited: mocks.guard }));
vi.mock("@/lib/billing/guard", () => ({ requireWritableBilling: mocks.billing }));
vi.mock("@/app/api/quotes/[quoteId]/olist/_shared", () => ({ loadQuoteOlistContext: mocks.load, sendOlistQuoteOperation: mocks.send, olistOperationErrorResponse: () => ({ ok: false, code: "olist_oauth_invalid", reconnectRequired: true, error: "Reconecte Olist" }) }));
const context = { params: Promise.resolve({ quoteId: "quote" }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.billing.mockResolvedValue(null);
  mocks.load.mockResolvedValue({ session: { userId: "user", tenantId: "tenant" }, detail: { quote: { customer_id: "customer", customer_external_olist_id: "2" } }, settings: {}, credentials: {} });
  mocks.send.mockResolvedValue({ result: { id: 2, nome: "Nome Olist", endereco: { cep: "01001000", endereco: "Rua Olist" } } });
});
describe("linking vs importing customer data", () => {
  it("links without silently updating local contact fields or trusting the browser raw result", async () => {
    const response = await POST(new Request("https://app.test", { method: "POST", body: JSON.stringify({ externalId: "2", raw: { id: 9, nome: "Untrusted" } }) }), context);
    expect(response.status).toBe(200);
    expect(mocks.link).toHaveBeenCalledWith("user", "tenant", "customer", "2");
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.guard).toHaveBeenCalledWith("user", "tenant", "quote");
  });
  it("reads the full authenticated contact only as a preview, without writing any local fields", async () => {
    const response = await GET(new Request("https://app.test?externalId=2"), context);
    expect(await response.json()).toMatchObject({ ok: true, externalId: "2", profile: { name: "Nome Olist", postalCode: "01001000", addressLine: "Rua Olist" } });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", path: "/contatos/2", userId: "user", tenantId: "tenant" }));
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("does not allow importing a contact that differs from the current quote link", async () => {
    const response = await GET(new Request("https://app.test?externalId=9"), context);
    expect(response.status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks approved/invoiced quotes before contact lookup or mutation", async () => {
    mocks.guard.mockRejectedValue(new Error("Orçamento fechado para edição."));
    const response = await GET(new Request("https://app.test?externalId=2"), context);
    expect(response.status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reports OAuth failure instead of claiming data was synchronized", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockRejectedValue(new Error("invalid_grant"));
    const response = await GET(new Request("https://app.test?externalId=2"), context);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ reconnectRequired: true, code: "olist_oauth_invalid" });
    expect(mocks.link).not.toHaveBeenCalled();
  });
});
