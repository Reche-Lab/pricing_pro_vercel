// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutPayment } from "@/services/commerce/payments";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/repositories/commerce", () => ({ commerceTransaction: vi.fn() }));
vi.mock("@/lib/crypto/secrets", () => ({ decryptTenantSecret: () => ({ accessToken: "private-token", sellerId: "seller", webhookSecret: "secret" }), encryptTenantSecret: vi.fn() }));
const query = vi.fn(), fetcher = vi.fn();
const store = { tenant_id: "tenant", slug: "ground-shop", settings: { name: "Ground Shop" } };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://panel.example.test"); vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", '{"groundshop.com.br":"ground-shop"}');
  vi.stubGlobal("fetch", fetcher);
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(commerceTransaction).mockImplementation(work => work({ query } as never));
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("encrypted_credentials")) return { rows: [{ encrypted_credentials: "encrypted" }] };
    if (sql.includes("for update")) return { rows: [{ id: "order", provider: "mercado_pago", payment_status: "pending", total_cents: 12345, snapshot: { customer: { email: "buyer@example.test" } } }] };
    if (sql.includes("mp_enabled")) return { rows: [{ mp_enabled: true, checkout_settings: { pix: true, credit: true, debit: false, boleto: false, maxInstallments: 4 } }] };
    return { rows: [] };
  });
  fetcher.mockResolvedValue(Response.json({ id: "preference", init_point: "https://www.mercadopago.com.br/checkout/pay" }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("tenant Checkout Pro preference", () => {
  it("sends the seller's restrictions, final amount and safe domain return without moving the webhook", async () => {
    expect(await checkoutPayment(store as never, "buyer", "order")).toEqual({ url: "https://www.mercadopago.com.br/checkout/pay" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences");
    const payload = JSON.parse(init.body);
    expect(payload.payment_methods).toEqual({ excluded_payment_methods: [], excluded_payment_types: [{ id: "debit_card" }, { id: "ticket" }], installments: 4 });
    expect(payload.items[0].unit_price).toBe(123.45);
    expect(payload.back_urls.success).toBe("https://groundshop.com.br/pedidos/order");
    expect(payload.notification_url).toBe("https://panel.example.test/api/store/ground-shop/payment-webhook?source_news=webhooks");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("tenant_id=$1 and customer_id=$2"), ["tenant", "buyer", "order"]);
  });
  it("does not accept a provider redirect to a foreign payment site", async () => {
    fetcher.mockResolvedValue(Response.json({ id: "preference", init_point: "https://attacker.test/checkout" }));
    await expect(checkoutPayment(store as never, "buyer", "order")).rejects.toThrow("URL de pagamento inválida");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("update commerce_orders"))).toBe(false);
  });
});
