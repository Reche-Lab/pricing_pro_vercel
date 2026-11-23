// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { performCommerceOrderShipping } from "@/services/commerce/order-shipping";
import { commerceShippingRequest } from "@/services/commerce/shipping-client";
import { receiveShippingWebhook } from "@/services/commerce/shipping-webhook";
import { getOrderShipment, buyerShippingForOrders } from "@/repositories/commerce-shipping";
import { testCommerceBilling } from "../fixtures/commerce-checkout";
import { MelhorEnvioRequestError } from "@/services/melhor-envio/melhor-envio";

vi.mock("@/services/commerce/shipping-client", async original => ({ ...await original<typeof import("@/services/commerce/shipping-client")>(), commerceShippingRequest: vi.fn() }));
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("commerce shipping in isolated PostgreSQL", () => {
  let actor: string;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Isolated local database required");
    vi.stubEnv("DATABASE_URL", url); vi.stubEnv("DATABASE_SSL", "false"); vi.stubEnv("COMMERCE_ENABLED", "true");
    actor = (await getPool().query("insert into app_users(email,name,password_hash,status) values($1,'Shipping tester','fake','active') returning id", [`shipping-${randomUUID()}@example.test`])).rows[0].id;
  });
  afterAll(async () => { await getPool().end(); globalThis.__pricingPool = undefined; vi.unstubAllEnvs(); });
  afterEach(() => vi.mocked(commerceShippingRequest).mockReset());
  async function fixture(count = 1) {
    const pool = getPool();
    const tenantId = (await pool.query(`insert into tenants(name,slug,company_phone,company_document,postal_code,address_line,address_number,district,city,state)
      values('Shipping store',$1,'11999999999',$2,'12212650','Rua origem','10','Centro','São José dos Campos','SP') returning id`, [`ship-${randomUUID()}`, testCommerceBilling.document])).rows[0].id;
    await pool.query("insert into commerce_stores(tenant_id,enabled,settings) values($1,true,'{\"name\":\"Loja de teste\"}')", [tenantId]);
    const customer = (await pool.query("insert into commerce_customers(tenant_id,name,email) values($1,'Comprador','buyer@example.test') returning id", [tenantId])).rows[0].id;
    const session = (await pool.query("insert into commerce_sessions(tenant_id,customer_id,token_hash) values($1,$2,$3) returning id", [tenantId, customer, randomUUID()])).rows[0].id;
    const productId = randomUUID();
    const snapshot = { delivery: "delivery", address: { ...testCommerceBilling, attention: "Recepção", email: undefined }, billing: testCommerceBilling,
      customer: { name: "Comprador", email: "buyer@example.test" },
      shippingOption: { id: "melhor_envio:2", name: "Correios - SEDEX", priceCents: count * 1500,
        carrierSnapshot: { originPostalCode: "12212650", destinationPostalCode: testCommerceBilling.postalCode, insuranceValueCents: 10000,
          volumes: Array.from({ length: count }, () => ({ width: 15, height: 8, length: 20, weight: 0.5 })) } },
      products: [{ id: productId, name: "Botton", personalized: false }],
      lines: [{ id: randomUUID(), productId, quantity: 10 }], items: [{ id: randomUUID(), productId, name: "Botton", quantity: 10, unitCents: 1000, totalCents: 10000 }], terms: "Teste", storeRevision: 1 };
    const orderId = (await pool.query("insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment,payment_status,fulfillment_status) values($1,$2,$3,0,$4,10000,$5,$6,'manual','production','paid','production') returning id", [tenantId, customer, session, JSON.stringify(snapshot), count * 1500, 10000 + count * 1500])).rows[0].id;
    await pool.query("insert into integration_connections(tenant_id,provider,status,settings,credentials_encrypted) values($1,'melhor_envio','active','{}',$2)", [tenantId, encryptTenantSecret({ accessToken: "fake", clientSecret: "webhook-test-secret" })]);
    return { tenantId, orderId, customer, snapshot };
  }
  function provider(options: { loseCart?: boolean; losePurchase?: boolean; loseAfterFirst?: boolean; omitPrice?: boolean; rejectCart?: boolean } = {}) {
    const orders = new Map<string, Record<string, unknown>>();
    vi.mocked(commerceShippingRequest).mockImplementation(async (_tenant, path, method, body) => {
      if (path === "/me/shipment/calculate") return [{ id: 2, price: "15.00" }] as never;
      if (path === "/me/cart") {
        if (options.rejectCart) throw new MelhorEnvioRequestError("Unauthenticated.", 401, {});
        const id = randomUUID(); orders.set(id, { id, status: "pending", price: "15.00" });
        if (options.loseCart || options.loseAfterFirst && orders.size > 1) throw new Error("Connection lost after creating label");
        if (options.omitPrice) orders.set(id, { id, status: "pending" });
        return { id, ...(options.omitPrice ? {} : { price: "15.00" }) } as never;
      }
      if (path === "/me/shipment/checkout") {
        for (const id of (body as { orders: string[] }).orders) orders.set(id, { ...orders.get(id), status: "released", paid_at: new Date().toISOString() });
        if (options.losePurchase) throw new Error("Connection lost after charge");
        return { purchase: { id: "payment-test" } } as never;
      }
      if (path === "/me/shipment/generate") {
        for (const id of (body as { orders: string[] }).orders) orders.set(id, { ...orders.get(id), status: "generated", generated_at: new Date().toISOString(), tracking: "AA123456789BR", tracking_url: "https://www.melhorrastreio.com.br/rastreio/AA123456789BR" });
        return {} as never;
      }
      if (path === "/me/shipment/print") return { url: "https://www.melhorenvio.com.br/print/private-test" } as never;
      if (path.startsWith("/me/orders/") && (!method || method === "GET")) return orders.get(path.split("/").pop()!) as never;
      throw new Error(`Unexpected provider request ${method} ${path}`);
    });
    return { orders, calls: () => vi.mocked(commerceShippingRequest).mock.calls };
  }
  const fiscal = { invoiceKey: "1".repeat(44), senderStateRegister: "ISENTO", productionReady: true };
  const run = (f: { tenantId: string; orderId: string }, action: string, extra = {}) => performCommerceOrderShipping(f.tenantId, f.orderId, actor, { action, ...extra } as Parameters<typeof performCommerceOrderShipping>[3]);
  async function cart(f: { tenantId: string; orderId: string }, count = 1) {
    await run(f, "review", fiscal);
    await run(f, "cart", { ...fiscal, expectedCostCents: count * 1500 });
  }
  function webhook(data: Record<string, unknown>, event: string, secret = "webhook-test-secret") {
    const body = JSON.stringify({ event, data });
    return new Request("https://platform.example.test/api/commerce/webhooks/melhor-envio", { method: "POST", headers: { "x-me-signature": createHmac("sha256", secret).update(body).digest("base64") }, body });
  }
  it("preserves the service and persists cart, paid, label and private print without pretending tracking is posted", async () => {
    const f = await fixture(), api = provider();
    await cart(f);
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("cart");
    await run(f, "checkout", { expectedCostCents: 1500 });
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("purchased");
    await run(f, "generate"); await run(f, "print");
    const shipping = await getOrderShipment(f.tenantId, f.orderId);
    expect(shipping).toMatchObject({ status: "label_ready", tracking_code: "AA123456789BR", label_url: "https://www.melhorenvio.com.br/print/private-test" });
    expect((await getPool().query("select fulfillment_status from commerce_orders where id=$1", [f.orderId])).rows[0].fulfillment_status).toBe("production");
    const payload = api.calls().find(call => call[1] === "/me/cart")![3] as Record<string, unknown>;
    expect(payload).toMatchObject({ service: 2, to: { complement: expect.stringContaining("Recepção") }, options: { non_commercial: false, invoice: { key: fiscal.invoiceKey } } });
    await run(f, "checkout", { expectedCostCents: 1500 });
    expect(api.calls().filter(call => call[1] === "/me/shipment/checkout")).toHaveLength(1);
  });
  it("requires production, fiscal data, exact reviewed price and explicit acceptance of differences", async () => {
    const f = await fixture(); provider();
    await expect(run(f, "review")).rejects.toThrow("produção");
    await expect(run(f, "review", { productionReady: true })).rejects.toThrow("chave");
    await expect(run(f, "cart", { ...fiscal, expectedCostCents: 1 })).rejects.toThrow("custo");
    expect((await getOrderShipment(f.tenantId, f.orderId))?.parcels).toHaveLength(0);
    await getPool().query("update commerce_order_shipments set quoted_cents=1000 where tenant_id=$1 and order_id=$2", [f.tenantId, f.orderId]);
    await expect(run(f, "cart", { ...fiscal, expectedCostCents: 1500 })).rejects.toThrow("diferença");
    await run(f, "cart", { ...fiscal, expectedCostCents: 1500, acceptCostChange: true });
  });
  it("reconciles a lost checkout response without repeating the charge", async () => {
    const f = await fixture(), api = provider({ losePurchase: true }); await cart(f);
    await expect(run(f, "checkout", { expectedCostCents: 1500 })).rejects.toThrow("confirmar");
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("review");
    await run(f, "refresh"); await run(f, "checkout", { expectedCostCents: 1500 });
    expect(api.calls().filter(call => call[1] === "/me/shipment/checkout")).toHaveLength(1);
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("purchased");
  });
  it("blocks a lost cart response rather than creating a duplicate label", async () => {
    const f = await fixture(), api = provider({ loseCart: true });
    await expect(cart(f)).rejects.toThrow("confirmar");
    await expect(run(f, "cart", { ...fiscal, expectedCostCents: 1500 })).rejects.toThrow("já foi iniciada");
    expect(api.calls().filter(call => call[1] === "/me/cart")).toHaveLength(1);
  });
  it("allows a safe retry after an explicit OAuth rejection that created no labels", async () => {
    const f = await fixture(); provider({ rejectCart: true });
    await expect(cart(f)).rejects.toThrow("Unauthenticated");
    expect((await getOrderShipment(f.tenantId, f.orderId))?.parcels).toHaveLength(0);
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("quoted");
    provider(); await cart(f);
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("cart");
  });
  it("persists every expected volume before contacting the provider and blocks partial purchases", async () => {
    const f = await fixture(2), api = provider({ loseAfterFirst: true });
    await expect(cart(f, 2)).rejects.toThrow("confirmar");
    const shipment = (await getOrderShipment(f.tenantId, f.orderId))!;
    expect(shipment.parcels).toHaveLength(2);
    expect(shipment.parcels.filter(p => p.provider_id)).toHaveLength(1);
    await expect(run(f, "checkout", { expectedCostCents: 1500 })).rejects.toThrow("volumes");
    expect(api.calls().filter(call => call[1] === "/me/shipment/checkout")).toHaveLength(0);
  });
  it("never interprets a missing provider price as a free label", async () => {
    const f = await fixture(), api = provider({ omitPrice: true });
    await expect(cart(f)).rejects.toThrow("custo");
    expect((await getOrderShipment(f.tenantId, f.orderId))?.parcels[0].price_cents).toBeNull();
    await expect(run(f, "checkout", { expectedCostCents: 0 })).rejects.toThrow("custo");
    expect(api.calls().filter(call => call[1] === "/me/shipment/checkout")).toHaveLength(0);
  });
  it("requires review when a fresh provider lookup reverses a paid label to pending", async () => {
    const f = await fixture(), api = provider(); await cart(f); await run(f, "checkout", { expectedCostCents: 1500 });
    const id = [...api.orders.keys()][0];
    api.orders.set(id, { id, status: "pending", price: "15.00", updated_at: "2030-11-24T12:00:00Z" });
    await run(f, "refresh");
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("review");
    await expect(run(f, "checkout", { expectedCostCents: 1500 })).rejects.toThrow();
    expect(api.calls().filter(call => call[1] === "/me/shipment/checkout")).toHaveLength(1);
  });
  it("fences simultaneous actions with one durable operation claim", async () => {
    const f = await fixture(); provider();
    const results = await Promise.allSettled([run(f, "review", fiscal), run(f, "review", fiscal)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("authenticates webhooks, deduplicates retries and never regresses delivered shipments", async () => {
    const f = await fixture(), api = provider(); await cart(f); await run(f, "checkout", { expectedCostCents: 1500 }); await run(f, "generate");
    const id = [...api.orders.keys()][0];
    const posted = { id, posted_at: "2030-11-23T12:00:00Z", tracking: "AA123456789BR", tracking_url: "https://www.melhorrastreio.com.br/rastreio/AA123456789BR" };
    await expect(receiveShippingWebhook(webhook(posted, "order.posted", "wrong"))).rejects.toThrow("Assinatura");
    await receiveShippingWebhook(webhook(posted, "order.posted"));
    const event = await receiveShippingWebhook(webhook(posted, "order.posted")); expect(event).toMatchObject({ duplicate: true });
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("posted");
    await receiveShippingWebhook(webhook({ ...posted, delivered_at: "2030-11-24T12:00:00Z" }, "order.delivered"));
    await receiveShippingWebhook(webhook({ id, generated_at: "2026-11-22T12:00:00Z" }, "order.generated"));
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("delivered");
    expect((await getPool().query("select fulfillment_status from commerce_orders where id=$1", [f.orderId])).rows[0].fulfillment_status).toBe("completed");
    const notifications = (await getPool().query("select event_key from commerce_order_notifications where tenant_id=$1 and order_id=$2 and event_key in ('fulfillment.shipped','fulfillment.completed')", [f.tenantId, f.orderId])).rows;
    expect(notifications).toHaveLength(2);
  });
  it("keeps all volumes independent and excludes private label/recipient data from buyer tracking", async () => {
    const f = await fixture(2), api = provider(); await cart(f, 2); await run(f, "checkout", { expectedCostCents: 3000 }); await run(f, "generate");
    const ids = [...api.orders.keys()];
    await receiveShippingWebhook(webhook({ id: ids[0], delivered_at: "2030-11-24T12:00:00Z" }, "order.delivered"));
    expect((await getOrderShipment(f.tenantId, f.orderId))?.status).toBe("label_ready");
    await receiveShippingWebhook(webhook({ id: ids[1], delivered_at: "2030-11-24T13:00:00Z" }, "order.delivered"));
    const buyer = (await buyerShippingForOrders(f.tenantId, [f.orderId])).get(f.orderId)!;
    expect(buyer.status).toBe("delivered"); expect(buyer.parcels).toHaveLength(2);
    expect(JSON.stringify(buyer)).not.toMatch(/invoiceKey|document|label_url|labelUrl|provider_id|snapshot/);
    expect((await buyerShippingForOrders(randomUUID(), [f.orderId])).size).toBe(0);
    const payloads = api.calls().filter(call => call[1] === "/me/cart").map(call => call[3] as { products: Array<{ quantity: number; unitary_value: number }>; options: { insurance_value: number } });
    expect(payloads.flatMap(p => p.products).reduce((sum, p) => sum + p.quantity, 0)).toBe(10);
    expect(payloads.reduce((sum, p) => sum + p.options.insurance_value, 0)).toBe(100);
  });
  it("rejects unpaid, test and pickup orders before making provider requests", async () => {
    const f = await fixture(); provider();
    for (const update of ["payment_status='pending'", "payment_status='paid',payment_environment='test'", "payment_environment='production',snapshot=jsonb_set(snapshot,'{delivery}','\"pickup\"')"]) {
      await getPool().query(`update commerce_orders set ${update} where tenant_id=$1 and id=$2`, [f.tenantId, f.orderId]);
      await expect(run(f, "review", fiscal)).rejects.toThrow();
    }
    expect(vi.mocked(commerceShippingRequest)).not.toHaveBeenCalled();
  });
});
