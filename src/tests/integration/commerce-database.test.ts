// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/client";
import { calculateCart } from "@/domain/commerce/commerce";
import {
  buyerOrders,
  commerceProducts,
  commercePaymentTenant,
  createBuyerSession,
  createCommerceOrder,
  findBuyerSession,
  getCommerceStore,
  replaceCart,
  saveCommerceStore,
  hashCommerceToken,
} from "@/repositories/commerce";
import { verifyBuyerCode } from "@/services/commerce/buyer-auth";
import type { StoreAdminInput } from "@/domain/commerce/schemas";
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("commerce isolated Postgres integration", () => {
  let tenantId: string;
  let actorId: string;
  let platformId: string;
  let variantId: string;
  let otherTenant: string;
  beforeAll(async () => {
    if (
      !url ||
      !url.includes("127.0.0.1") ||
      !new URL(url).pathname.startsWith("/commerce_test_")
    )
      throw new Error("Only the isolated test database is allowed.");
    process.env.DATABASE_URL = url;
    process.env.DATABASE_SSL = "false";
    process.env.COMMERCE_ENABLED = "true";
    const pool = getPool();
    tenantId = (
      await pool.query("select id from tenants where slug='ground-shop'")
    ).rows[0].id;
    actorId = (
      await pool.query(
        "insert into app_users(email,name,password_hash,status) values('commerce-admin@example.test','Admin teste','not-a-password','active') returning id",
      )
    ).rows[0].id;
    await pool.query(
      "insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'",
      [tenantId, actorId],
    );
    platformId = (
      await pool.query(
        "select id from platform_rules where tenant_id=$1 limit 1",
        [tenantId],
      )
    ).rows[0].id;
    variantId = (
      await pool.query(
        "select id from product_variants where tenant_id=$1 limit 1",
        [tenantId],
      )
    ).rows[0].id;
    otherTenant = (
      await pool.query(
        "insert into tenants(name,slug) values('Outra loja','other-store') returning id",
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await getPool().end();
    globalThis.__pricingPool = undefined;
  });
  it("publishes explicitly without exposing another tenant", async () => {
    expect(await getCommerceStore("ground-shop")).toBeNull();
    const input: StoreAdminInput = {
      enabled: true,
      status: "published",
      platformId,
      settings: {
        name: "Ground Shop",
        description: "Produtos personalizados",
        logoUrl: "https://liaflow-calcula.vercel.app/brands/ground-shop.jpeg",
        bannerUrl: "",
        accent: "#047857",
        contactEmail: "test@example.test",
        contactPhone: "",
        pickupEnabled: true,
        pickupAddress: "Rua de teste, 100",
        deliveryEnabled: false,
        deliveryCents: 0,
        deliveryDescription: "",
        terms: "Condições do piloto de teste.",
      },
      products: [
        {
          variantId,
          name: "Botton personalizado",
          description: "Produto de teste",
          category: "Bottons",
          imageUrl:
            "https://liaflow-calcula.vercel.app/brands/ground-shop.jpeg",
          active: true,
          minQuantity: 1,
          maxQuantity: 1000,
          maxArtworks: 3,
          personalized: false,
          pricingRule: "total",
        },
      ],
    };
    await saveCommerceStore(actorId, tenantId, input);
    expect((await getCommerceStore("ground-shop"))?.tenant_id).toBe(tenantId);
    expect(await getCommerceStore("other-store")).toBeNull();
    await expect(
      saveCommerceStore(actorId, otherTenant, input),
    ).rejects.toThrow();
    await expect(
      getPool().query(
        "insert into commerce_stores(tenant_id,platform_id) values($1,$2)",
        [otherTenant, platformId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("denies raw browser role access and scopes opaque sessions", async () => {
    const created = await createBuyerSession(tenantId);
    expect(await findBuyerSession(otherTenant, created.token)).toBeNull();
    const client = await getPool().connect();
    try {
      await client.query("set role anon");
      await expect(
        client.query("select * from commerce_orders"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("reset role");
      client.release();
    }
  });
  it("persists the cart and creates only one order under concurrent checkout", async () => {
    const { session } = await createBuyerSession(tenantId);
    const store = (await getCommerceStore("ground-shop"))!;
    const products = await commerceProducts(tenantId);
    const customer = (
      await getPool().query(
        "insert into commerce_customers(tenant_id,email,name) values($1,'buyer@example.test','Cliente teste') returning id",
        [tenantId],
      )
    ).rows[0].id;
    await getPool().query(
      "update commerce_sessions set customer_id=$2 where id=$1",
      [session.id, customer],
    );
    session.customer_id = customer;
    await getPool().query(
      "insert into commerce_payment_connections(tenant_id,manual_enabled,manual_instructions) values($1,true,'Pagar na retirada')",
      [tenantId],
    );
    const lines = [
      {
        id: crypto.randomUUID(),
        productId: products[0].id,
        quantity: 20,
        artworkName: "",
        artworkId: null,
      },
    ];
    await replaceCart(store, session, 0, lines);
    await expect(replaceCart(store, session, 0, lines)).rejects.toThrow(
      "outra aba",
    );
    const total = calculateCart(lines, products).totalCents;
    const input = {
      revision: 1,
      expectedTotalCents: total,
      delivery: "pickup" as const,
      address: null,
      provider: "manual" as const,
      acceptedTerms: true as const,
    };
    await expect(
      createCommerceOrder(store, session, { ...input, expectedTotalCents: 1 }),
    ).rejects.toThrow("preço mudou");
    const [a, b] = await Promise.all([
      createCommerceOrder(store, session, input),
      createCommerceOrder(store, session, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(await buyerOrders(tenantId, customer)).toHaveLength(1);
    expect(await buyerOrders(otherTenant, customer)).toEqual([]);
    const order = (
      await getPool().query("select * from commerce_orders where id=$1", [a.id])
    ).rows[0];
    expect(order.total_cents).toBe(total);
    expect(order.payment_status).toBe("pending");
    expect(
      (
        await getPool().query(
          "select cart from commerce_sessions where id=$1",
          [session.id],
        )
      ).rows[0].cart,
    ).toEqual([]);
  });
  it("limits login attempts, isolates challenges and rotates the session token", async () => {
    const { session, token } = await createBuyerSession(tenantId);
    const other = await createBuyerSession(tenantId);
    const store = (await getCommerceStore("ground-shop"))!;
    const insertChallenge = async () => {
      const id = crypto.randomUUID();
      await getPool().query(
        "insert into commerce_login_challenges(id,tenant_id,session_id,email,name,code_hash) values($1,$2,$3,'otp@example.test','OTP teste',$4)",
        [id, tenantId, session.id, hashCommerceToken(`${id}:123456`)],
      );
      return id;
    };
    const locked = await insertChallenge();
    await expect(verifyBuyerCode(store, other.session, locked, "123456")).rejects.toThrow("Código inválido");
    for (let i = 0; i < 5; i++) {
      await expect(verifyBuyerCode(store, session, locked, "000000")).rejects.toThrow("Código inválido");
    }
    await expect(verifyBuyerCode(store, session, locked, "123456")).rejects.toThrow("Código inválido");
    const valid = await insertChallenge();
    const rotated = await verifyBuyerCode(store, session, valid, "123456");
    expect(await findBuyerSession(tenantId, token)).toBeNull();
    expect((await findBuyerSession(tenantId, rotated))?.customer_id).toBeTruthy();
    await expect(verifyBuyerCode(store, session, valid, "123456")).rejects.toThrow("Código inválido");
  });
  it("keeps signed payment reconciliation addressable when the store is disabled", async () => {
    await getPool().query("update commerce_stores set enabled=false where tenant_id=$1", [tenantId]);
    expect(await getCommerceStore("ground-shop", true)).toBeNull();
    expect(await commercePaymentTenant("ground-shop")).toBe(tenantId);
    await getPool().query("update commerce_stores set enabled=true where tenant_id=$1", [tenantId]);
  });
});
