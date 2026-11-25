// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/client";
import { sendStoreEmail } from "@/services/email/store-email";
import { processCommerceOrderNotifications } from "@/services/commerce/order-notifications";

vi.mock("@/services/email/store-email", () => ({ sendStoreEmail: vi.fn() }));
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("transactional email receipts in isolated PostgreSQL", () => {
  const tenants: string[] = [];
  beforeAll(() => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Isolated local database required");
    vi.stubEnv("DATABASE_URL", url); vi.stubEnv("DATABASE_SSL", "false"); vi.stubEnv("COMMERCE_ENABLED", "true");
    vi.stubEnv("APP_URL", "https://app.example.test"); vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", "");
  });
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(sendStoreEmail).mockResolvedValue({ sent: true, provider: "smtp", message: "mock SMTP" }); });
  afterAll(async () => {
    try {
      if (tenants.length) {
        for (const table of ["commerce_order_notifications", "commerce_orders", "commerce_sessions", "commerce_customers", "commerce_stores"])
          await getPool().query(`delete from ${table} where tenant_id=any($1::uuid[])`, [tenants]);
        await getPool().query("delete from tenants where id=any($1::uuid[])", [tenants]);
      }
    }
    finally { await getPool().end(); globalThis.__pricingPool = undefined; vi.unstubAllEnvs(); }
  });
  async function fixture(name = "Loja de teste", discount: unknown = 1500) {
    const db = getPool();
    const slug = `email-${randomUUID()}`;
    const tenant = (await db.query("insert into tenants(name,slug) values($1,$2) returning id", [name, slug])).rows[0].id;
    tenants.push(tenant);
    await db.query("insert into commerce_stores(tenant_id,enabled,settings) values($1,true,$2)", [tenant, { name, logoUrl: "https://cdn.example.test/logo.png", accent: "#25bbdd", contactEmail: "loja@example.test" }]);
    const customer = (await db.query("insert into commerce_customers(tenant_id,name,email) values($1,'Ana','buyer@example.test') returning id", [tenant])).rows[0].id;
    const session = (await db.query("insert into commerce_sessions(tenant_id,customer_id,token_hash) values($1,$2,$3) returning id", [tenant, customer, randomUUID()])).rows[0].id;
    const snapshot = {
      items: [{ name: "Botton & Ímã", artworkName: "Campanha <especial>", quantity: 50, unitCents: 300, totalCents: 13500, artworkDiscountCents: 1500 }],
      address: { name: "Ana", street: "Rua A", number: "123", complement: "Sala 2", district: "Centro", city: "São Paulo", state: "SP", postalCode: "01001000", attention: "Recepção", document: "sensitive-do-not-email" },
      production: { productionDays: 3, transportDays: 2, deliveryDate: "2026-12-02" },
      shippingOption: { name: "Correios · SEDEX" }, delivery: "delivery", artworkDiscountCents: discount,
    };
    const order = (await db.query("insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment,payment_status,fulfillment_status) values($1,$2,$3,0,$4,13500,2000,15500,'manual','production','paid','received') returning id", [tenant, customer, session, snapshot])).rows[0].id;
    return { tenant, order, slug };
  }

  it("reads the live tenant and frozen receipt, then persists both accepted notifications", async () => {
    const f = await fixture();
    expect(await processCommerceOrderNotifications(f.tenant, 5, f.order)).toBe(2);
    expect(sendStoreEmail).toHaveBeenCalledTimes(2);
    for (const [tenant, mail] of vi.mocked(sendStoreEmail).mock.calls) {
      expect(tenant).toBe(f.tenant); expect(mail.to).toBe("buyer@example.test");
      expect(mail.text).toContain("50 un. × R$ 3,00 = R$ 150,00"); expect(mail.text).toContain("Total do pedido: R$ 155,00");
      expect(mail.html).toContain("Campanha &lt;especial&gt;"); expect(mail.html).toContain('src="https://cdn.example.test/logo.png"');
      expect(mail.text).toContain("Correios · SEDEX"); expect(mail.text).toContain("Aos cuidados de: Recepção");
      expect(mail.text).toContain("Produção: 3 dias úteis"); expect(mail.text).toContain(`https://app.example.test/loja/${f.slug}/pedidos/${f.order}`);
      expect(mail.html).not.toContain("sensitive-do-not-email");
    }
    const rows = (await getPool().query("select status,sent_at,attempts from commerce_order_notifications where tenant_id=$1 and order_id=$2", [f.tenant, f.order])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.status === "sent" && row.sent_at && row.attempts === 1)).toBe(true);
    expect(await processCommerceOrderNotifications(f.tenant, 5, f.order)).toBe(0);
  });

  it("never reads or sends another tenant's pending order", async () => {
    const first = await fixture("Primeira loja"), second = await fixture("Segunda loja");
    expect(await processCommerceOrderNotifications(first.tenant, 5, second.order)).toBe(0);
    expect(sendStoreEmail).not.toHaveBeenCalled();
    await processCommerceOrderNotifications(second.tenant, 5, second.order);
    for (const [tenant, mail] of vi.mocked(sendStoreEmail).mock.calls) {
      expect(tenant).toBe(second.tenant); expect(mail.html).toContain("Segunda loja"); expect(mail.html).not.toContain("Primeira loja");
    }
  });

  it("does not fail SQL when an old discount snapshot is malformed, nor mark rejected SMTP as sent", async () => {
    const f = await fixture("Loja antiga", "invalid historical value");
    vi.mocked(sendStoreEmail).mockResolvedValue({ sent: false, provider: "smtp", message: "rejected" });
    expect(await processCommerceOrderNotifications(f.tenant, 5, f.order)).toBe(2);
    const rows = (await getPool().query("select status,sent_at,last_error_code from commerce_order_notifications where tenant_id=$1 and order_id=$2", [f.tenant, f.order])).rows;
    expect(rows.every(row => row.status === "pending" && !row.sent_at && row.last_error_code === "smtp_unavailable")).toBe(true);
  });
});
