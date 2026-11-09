// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
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
  calculateCommerceCart,
  geometryHash,
  getCommerceAdmin,
} from "@/repositories/commerce";
import { checkoutPayment, savePaymentConnection } from "@/services/commerce/payments";
import { buyerPaymentState, refreshDirectPayment, startDirectPayment } from "@/services/commerce/transparent-payments";
import { authorizedCommerceOrder, mutateCommerceProof, readCommerceProofs, assertCommerceProofsReady } from "@/services/commerce/order-artworks";
import { verifyBuyerCode } from "@/services/commerce/buyer-auth";
import type { StoreAdminInput } from "@/domain/commerce/schemas";
import {
  createVideoUpload,
  lockVideoUpload,
  markVideoReady,
  assertCommerceVideosReady,
} from "@/repositories/commerce-media";
import { commerceVideoPath } from "@/domain/commerce/product-media";
import { testCommerceBilling } from "../fixtures/commerce-checkout";
import { getOrderWorkspace, getOrderWorkspaceItem, markOrderSeen } from "@/repositories/commerce-orders";
import { userHasPermission } from "@/repositories/users";
import { getCurrentSession } from "@/lib/auth/session";
import { GET as orderFiles } from "@/app/api/commerce/admin/orders/[orderId]/files/route";
import { POST as orderAction } from "@/app/api/commerce/admin/orders/[orderId]/route";
import { POST as paymentWebhook } from "@/app/api/store/[slug]/payment-webhook/route";
import { createHmac } from "node:crypto";
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
const objects = vi.hoisted(() => new Map<string, { bytes: Uint8Array; contentType: string }>());
vi.mock("@/services/storage/artwork-storage", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/storage/artwork-storage")>(),
  uploadArtworkObject: vi.fn(async (input: { path: string; bytes: Uint8Array; contentType: string }) => { objects.set(input.path, input); return input.path; }),
  downloadArtworkObject: vi.fn(async (path: string) => objects.get(path) ?? null),
  deleteArtworkObject: vi.fn(async (path: string) => { objects.delete(path); }),
}));
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("commerce isolated Postgres integration", () => {
  let tenantId: string;
  let actorId: string;
  let platformId: string;
  let variantId: string;
  let otherTenant: string;
  let published: StoreAdminInput;
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
    await saveCommerceStore(actorId, tenantId, { ...input, status: "draft" });
    await getPool().query("insert into commerce_payment_connections(tenant_id,manual_enabled,manual_instructions) values($1,true,'Pagar na loja')", [tenantId]);
    await saveCommerceStore(actorId, tenantId, input);
    published = input;
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
      "insert into commerce_payment_connections(tenant_id,manual_enabled,manual_instructions) values($1,true,'Pagar na retirada') on conflict(tenant_id) do update set manual_enabled=true,manual_instructions=excluded.manual_instructions",
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
      billing: testCommerceBilling,
      deliveryAddressSameAsBilling: true,
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
    await expect(
      verifyBuyerCode(store, other.session, locked, "123456"),
    ).rejects.toThrow("Código inválido");
    for (let i = 0; i < 5; i++) {
      await expect(
        verifyBuyerCode(store, session, locked, "000000"),
      ).rejects.toThrow("Código inválido");
    }
    await expect(
      verifyBuyerCode(store, session, locked, "123456"),
    ).rejects.toThrow("Código inválido");
    const valid = await insertChallenge();
    const rotated = await verifyBuyerCode(store, session, valid, "123456");
    expect(await findBuyerSession(tenantId, token)).toBeNull();
    expect(
      (await findBuyerSession(tenantId, rotated))?.customer_id,
    ).toBeTruthy();
    await expect(
      verifyBuyerCode(store, session, valid, "123456"),
    ).rejects.toThrow("Código inválido");
  });
  it("keeps signed payment reconciliation addressable when the store is disabled", async () => {
    await getPool().query(
      "update commerce_stores set enabled=false where tenant_id=$1",
      [tenantId],
    );
    expect(await getCommerceStore("ground-shop", true)).toBeNull();
    expect(await commercePaymentTenant("ground-shop")).toBe(tenantId);
    await getPool().query(
      "update commerce_stores set enabled=true where tenant_id=$1",
      [tenantId],
    );
  });
  it("persists galleries and only accepts completed video uploads from the same tenant", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "https://storage.example.test";
    const client = await getPool().connect();
    try {
      const upload = await createVideoUpload(tenantId, actorId, {
        fileName: "demo.mp4",
        fileSize: 100,
        mimeType: "video/mp4",
      });
      const video = {
        id: upload.id,
        kind: "video" as const,
        url: `https://storage.example.test/storage/v1/object/public/commerce-videos/${commerceVideoPath(tenantId, upload.id, "video/mp4")}`,
      };
      await expect(
        assertCommerceVideosReady(tenantId, [{ media: [video] }]),
      ).rejects.toThrow("não foi validado");
      await expect(
        lockVideoUpload(client, otherTenant, actorId, upload.id),
      ).rejects.toMatchObject({ status: 404 });
      await client.query("begin");
      const locked = await lockVideoUpload(
        client,
        tenantId,
        actorId,
        upload.id,
      );
      await markVideoReady(client, locked);
      await client.query("commit");
      await expect(
        assertCommerceVideosReady(otherTenant, [{ media: [video] }]),
      ).rejects.toThrow("outra loja");
      await expect(
        assertCommerceVideosReady(tenantId, [
          { media: [{ ...video, url: "https://attacker.test/video.mp4" }] },
        ]),
      ).rejects.toThrow();
      const media = [
        {
          id: crypto.randomUUID(),
          kind: "image" as const,
          url: published.products[0].imageUrl,
        },
        video,
      ];
      await saveCommerceStore(actorId, tenantId, {
        ...published,
        products: [{ ...published.products[0], media }],
      });
      expect((await commerceProducts(tenantId))[0].media).toEqual(media);
      await client.query("set role anon");
      await expect(
        client.query("select * from commerce_video_uploads"),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("reset role");
    } finally {
      await client.query("rollback");
      await client.query("reset role");
      client.release();
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
    }
  });
  it("freezes billing separately from login identity and derives copied or custom delivery", async () => {
    await saveCommerceStore(actorId, tenantId, { ...published, settings: { ...published.settings, deliveryEnabled: true, deliveryDescription: "Entrega de teste", deliveryCents: 1200 } });
    const store = (await getCommerceStore("ground-shop"))!, products = await commerceProducts(tenantId);
    const customerId = (await getPool().query("insert into commerce_customers(tenant_id,email,name) values($1,'billing-buyer@example.test','Comprador verificado') returning id", [tenantId])).rows[0].id;
    const billing = { ...testCommerceBilling, name: "Empresa faturada", document: "11.222.333/0001-81" };
    const destination = { name: "Pessoa que recebe", phone: "11999990000", document: "", postalCode: "20040020", street: "Rua da entrega", number: "20", complement: "", district: "Centro", city: "Rio de Janeiro", state: "RJ" as const, attention: "Portaria" };
    const createdIds: string[] = [];
    for (const same of [true, false]) {
      const { session } = await createBuyerSession(tenantId);
      session.customer_id = customerId;
      await getPool().query("update commerce_sessions set customer_id=$2 where id=$1", [session.id, customerId]);
      const lines = [{ id: crypto.randomUUID(), productId: products[0].id, quantity: 10, artworkName: "", artworkId: null }];
      await replaceCart(store, session, 0, lines);
      const created = await createCommerceOrder(store, session, { revision: 1, expectedTotalCents: calculateCart(lines, products).totalCents + 1200, delivery: "delivery", address: destination, billing, deliveryAddressSameAsBilling: same, provider: "manual", acceptedTerms: true });
      createdIds.push(created.id);
      const order = await authorizedCommerceOrder(tenantId, created.id, customerId);
      expect(order.snapshot.billing).toMatchObject({ name: "Empresa faturada", document: "11222333000181", personType: "J" });
      expect(order.snapshot.customer).toMatchObject({ name: "Comprador verificado", email: "billing-buyer@example.test" });
      expect(order.snapshot.address?.name).toBe(same ? "Empresa faturada" : "Pessoa que recebe");
      expect(order.snapshot.address?.street).toBe(same ? testCommerceBilling.street : destination.street);
      expect(order.snapshot.address?.attention).toBe(same ? "" : "Portaria");
    }
    expect(await buyerOrders(otherTenant, customerId)).toEqual([]);
    const saved = await buyerOrders(tenantId, customerId);
    expect(saved).toHaveLength(2);
    expect(saved.every(order => order.billing?.name === "Empresa faturada")).toBe(true);
    await getPool().query("update commerce_orders set snapshot=snapshot-'billing'-'deliveryAddressSameAsBilling' where tenant_id=$1 and id=$2", [tenantId, createdIds[0]]);
    expect((await buyerOrders(tenantId, customerId)).find(order => order.id === createdIds[0])?.billing).toBeNull();
  });
  it("preserves staff-prepared orders, protects drafts and requires versioned buyer approval before production", async () => {
    await getPool().query("update product_variants set print_width_mm=35,print_height_mm=35 where id=$1", [variantId]);
    await saveCommerceStore(actorId, tenantId, { ...published, products: [{ ...published.products[0], personalized: true, artworkOptions: { allowTeamPreparation: true, discountFixedCents: 150, maxDiscountPercent: 10 } }] });
    const store = (await getCommerceStore("ground-shop"))!;
    const products = await commerceProducts(tenantId), product = products[0];
    const { session } = await createBuyerSession(tenantId);
    const customer = (await getPool().query("insert into commerce_customers(tenant_id,email,name) values($1,'proof-buyer@example.test','Cliente da prova') returning id", [tenantId])).rows[0].id;
    session.customer_id = customer;
    await getPool().query("update commerce_sessions set customer_id=$2 where id=$1", [session.id, customer]);
    const bytes = await sharp({ create: { width: 700, height: 700, channels: 4, background: "#159955" } }).png().toBuffer();
    objects.set("test/original.png", { bytes, contentType: "image/png" });
    const artId = (await getPool().query("insert into commerce_artworks(tenant_id,session_id,product_id,storage_path,file_name,content_hash) values($1,$2,$3,'test/original.png','arte.png','test') returning id", [tenantId, session.id, product.id])).rows[0].id;
    const line = { id: crypto.randomUUID(), productId: product.id, quantity: 20, artworkName: "Arte da equipe", artworkId: artId, preparation: "team" as const };
    expect((await calculateCommerceCart(tenantId, session.id, [line], products)).artworkDiscountCents).toBe(0);
    await replaceCart(store, session, 0, [line]);
    const created = await createCommerceOrder(store, session, { revision: 1, expectedTotalCents: calculateCart([line], products).totalCents, delivery: "pickup", address: null, billing: testCommerceBilling, deliveryAddressSameAsBilling: true, provider: "manual", acceptedTerms: true });
    const order = await authorizedCommerceOrder(tenantId, created.id, customer);
    await expect(authorizedCommerceOrder(otherTenant, order.id, customer)).rejects.toMatchObject({ status: 404 });
    await expect(authorizedCommerceOrder(tenantId, order.id, crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(assertCommerceProofsReady(getPool(), order)).rejects.toMatchObject({ status: 409 });
    const mutate = (action: string, revision: number, actor: string | null = actorId) => mutateCommerceProof(new Request("https://store.test/proof", { method: "POST", body: JSON.stringify({ action, lineId: line.id, revision, ...(actor ? { note: "Preparação de teste da equipe." } : {}) }) }), order, actor);
    await expect(mutate("prepare", 1, null)).rejects.toMatchObject({ status: 403 });
    await expect(mutate("approve", 1)).rejects.toMatchObject({ status: 403 });
    expect(await (await mutate("prepare", 1)).json()).toMatchObject({ revision: 2 });
    await expect(mutate("approve", 2, null)).rejects.toMatchObject({ status: 409 });
    const view = await (await readCommerceProofs(new Request("https://store.test/proofs"), order)).json();
    expect(view.proofs[0].prepared).toBe(false);
    await expect(readCommerceProofs(new Request(`https://store.test/proofs?lineId=${line.id}&asset=source`), order)).rejects.toMatchObject({ status: 409 });
    await mutate("publish", 2);
    expect((await readCommerceProofs(new Request(`https://store.test/proofs?lineId=${line.id}&asset=prepared`), order)).status).toBe(200);
    await expect(mutate("approve", 1, null)).rejects.toMatchObject({ status: 409 });
    await mutate("approve", 2, null);
    await mutate("approve", 2, null);
    await expect(assertCommerceProofsReady(getPool(), order)).resolves.toBeUndefined();
    expect((await getPool().query("select count(*)::integer as count from commerce_order_events where order_id=$1 and type='artwork.approve'", [order.id])).rows[0].count).toBe(1);
    expect((await authorizedCommerceOrder(tenantId, order.id, customer)).total_cents).toBe(order.total_cents);
    await mutate("prepare", 2);
    await expect(assertCommerceProofsReady(getPool(), order)).rejects.toMatchObject({ status: 409 });
    await expect(mutate("approve", 2, null)).rejects.toMatchObject({ status: 409 });
    await getPool().query("update commerce_orders set fulfillment_status='production' where id=$1", [order.id]);
    const count = objects.size;
    await expect(mutate("prepare", 3)).rejects.toMatchObject({ status: 409 });
    expect(objects.size).toBe(count);
    await getPool().query("update commerce_artworks set prepared_path='test/prepared.png',crop=$2,approved_at=now() where id=$1", [artId, JSON.stringify({ geometryHash: geometryHash(product) })]);
    const self = { ...line, id: crypto.randomUUID(), preparation: "customer" as const };
    const benefit = await calculateCommerceCart(tenantId, session.id, [self], products);
    expect(benefit.artworkDiscountCents).toBeGreaterThan(0);
    expect((await calculateCommerceCart(otherTenant, session.id, [self], products)).artworkDiscountCents).toBe(0);
    expect((await calculateCommerceCart(tenantId, crypto.randomUUID(), [self], products)).artworkDiscountCents).toBe(0);
    expect((await calculateCommerceCart(tenantId, session.id, [self], [{ ...product, margins: { ...product.margins, bleedMm: product.margins.bleedMm + 1 } }])).artworkDiscountCents).toBe(0);
    const client = await getPool().connect();
    try { await client.query("set role anon"); await expect(client.query("select * from commerce_artwork_proofs")).rejects.toMatchObject({ code: "42501" }); }
    finally { await client.query("reset role"); client.release(); }
  });
  it("isolates staff worklists and persists per-user unread markers without hiding later changes", async () => {
    const viewer = (await getPool().query("insert into app_users(email,name,password_hash,status) values('worklist-viewer@example.test','Produção','unused','active') returning id")).rows[0].id;
    await getPool().query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='viewer'", [tenantId, viewer]);
    expect(await userHasPermission(viewer, tenantId, 'commerce:orders:read')).toBe(true);
    expect(await userHasPermission(viewer, tenantId, 'commerce:orders:manage')).toBe(false);
    expect(await userHasPermission(viewer, tenantId, 'commerce:artworks:write')).toBe(false);
    const initial = await getOrderWorkspace(tenantId, viewer);
    expect(initial.summary.unread).toBe(initial.summary.total);
    expect(initial.summary.total).toBeGreaterThan(0);
    expect((await getOrderWorkspace(otherTenant, viewer)).orders).toEqual([]);
    const row = initial.orders[0];
    expect(await getOrderWorkspaceItem(otherTenant, viewer, row.id)).toBeNull();
    expect(await markOrderSeen(otherTenant, viewer, row.id, row.activity_at)).toBe(false);
    await markOrderSeen(tenantId, viewer, row.id, row.activity_at);
    expect((await getOrderWorkspace(tenantId, viewer)).summary.unread).toBe(initial.summary.total - 1);
    expect((await getOrderWorkspace(tenantId, actorId)).summary.unread).toBe(initial.summary.total);
    await getPool().query("select pg_sleep(0.01)");
    await getPool().query("update commerce_orders set updated_at=clock_timestamp() where tenant_id=$1 and id=$2", [tenantId, row.id]);
    await markOrderSeen(tenantId, viewer, row.id, row.activity_at);
    expect((await getOrderWorkspaceItem(tenantId, viewer, row.id))?.unread).toBe(true);
    const latest = (await getOrderWorkspaceItem(tenantId, viewer, row.id))!;
    await markOrderSeen(tenantId, viewer, row.id, latest.activity_at);
    expect((await getOrderWorkspaceItem(tenantId, viewer, row.id))?.unread).toBe(false);
    expect((await getOrderWorkspace(tenantId, viewer, { filter: 'unread', pageSize: 1 })).orders).toHaveLength(1);
    const client = await getPool().connect();
    try { await client.query("set role anon"); await expect(client.query("select * from commerce_order_reads")).rejects.toMatchObject({ code: "42501" }); }
    finally { await client.query("reset role"); client.release(); }
  });
  it("validates persisted carrier quotes by tenant, session, revision, cart, CEP and expiry before creating an order", async () => {
    await getPool().query("update commerce_stores set settings=jsonb_set(settings,'{carrierEnabled}','true') where tenant_id=$1", [tenantId]);
    await getPool().query("update commerce_products set snapshot=jsonb_set(snapshot,'{personalized}','false') where tenant_id=$1", [tenantId]);
    const store = (await getCommerceStore("ground-shop"))!;
    const products = await commerceProducts(tenantId);
    const { session } = await createBuyerSession(tenantId);
    const customer = (await getPool().query("select id from commerce_customers where tenant_id=$1 limit 1", [tenantId])).rows[0].id;
    await getPool().query("update commerce_sessions set customer_id=$2 where id=$1", [session.id, customer]);
    session.customer_id = customer;
    const lines = [{ id: crypto.randomUUID(), productId: products[0].id, quantity: 10, artworkName: "", artworkId: null }];
    await replaceCart(store, session, 0, lines); session.cart = lines; session.revision = 1;
    const calculated = await calculateCommerceCart(tenantId, session.id, lines, products);
    const option = { id: "melhor_envio:2", name: "Correios - SEDEX", priceCents: 1975, description: "3 dias úteis" };
    const insert = async (t: string, s: string) => (await getPool().query("insert into commerce_shipping_quotes(tenant_id,session_id,cart_revision,store_revision,cart_hash,postal_code,option) values($1,$2,1,$3,$4,$5,$6) returning id", [t, s, store.revision, hashCommerceToken(JSON.stringify(calculated)), testCommerceBilling.postalCode, JSON.stringify(option)])).rows[0].id;
    const input = { revision: 1, expectedTotalCents: calculated.totalCents + option.priceCents, billing: testCommerceBilling, delivery: "delivery" as const, deliveryAddressSameAsBilling: true, address: null, provider: "manual" as const, acceptedTerms: true as const };
    const other = (await createBuyerSession(tenantId)).session;
    await expect(createCommerceOrder(store, session, { ...input, shippingQuoteId: await insert(tenantId, other.id) })).rejects.toThrow("frete expirou");
    const id = await insert(tenantId, session.id);
    for (const mutation of ["expires_at=now()-interval '1 second'", "cart_revision=99", "store_revision=99", "cart_hash='wrong'", "postal_code='99999999'"]) {
      await getPool().query(`update commerce_shipping_quotes set ${mutation} where id=$1`, [id]);
      await expect(createCommerceOrder(store, session, { ...input, shippingQuoteId: id })).rejects.toThrow("frete expirou");
      await getPool().query("update commerce_shipping_quotes set expires_at=now()+interval '15 minutes',cart_revision=1,store_revision=$2,cart_hash=$3,postal_code=$4 where id=$1", [id, store.revision, hashCommerceToken(JSON.stringify(calculated)), testCommerceBilling.postalCode]);
    }
    await expect(createCommerceOrder(store, session, { ...input, shippingQuoteId: id, expectedTotalCents: 1 })).rejects.toThrow("preço mudou");
    const created = await createCommerceOrder(store, session, { ...input, shippingQuoteId: id });
    expect((await getPool().query("select shipping_cents,total_cents,snapshot->'shippingOption' as option from commerce_orders where id=$1", [created.id])).rows[0]).toMatchObject({ shipping_cents: 1975, total_cents: calculated.totalCents + 1975, option });
    expect(await createCommerceOrder(store, session, { ...input, shippingQuoteId: id })).toEqual(created);
    const client = await getPool().connect();
    try { await client.query("set role anon"); await expect(client.query("select * from commerce_shipping_quotes")).rejects.toMatchObject({ code: "42501" }); }
    finally { await client.query("reset role"); client.release(); }
    await getPool().query("update commerce_products set snapshot=jsonb_set(snapshot,'{personalized}','true') where tenant_id=$1", [tenantId]);
  });
  it("persists tenant payment settings and keeps them when a later request only changes manual instructions", async () => {
    const checkoutSettings = { pix: true, credit: true, debit: false, boleto: false, maxInstallments: 4 };
    await savePaymentConnection(tenantId, actorId, { manualEnabled: true, manualInstructions: "Pagamento combinado", mpEnabled: false, checkoutSettings });
    await savePaymentConnection(tenantId, actorId, { manualEnabled: true, manualInstructions: "Novas instruções", mpEnabled: false });
    const data = await getCommerceAdmin(actorId, tenantId);
    expect(data.payments.checkout_settings).toEqual(checkoutSettings);
    expect(data.readiness.paymentReady).toBe(true);
    expect(data.urls.platform).toContain("/loja/ground-shop");
    expect(data.payments).not.toHaveProperty("encrypted_credentials");
    expect(data.payments).not.toHaveProperty("accessToken");
  });
  it("lets read-only production staff print only paid orders with all current artworks approved", async () => {
    const viewer = (await getPool().query("select id from app_users where email='worklist-viewer@example.test'")).rows[0].id;
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: viewer, tenantId, role: 'viewer', email: 'worklist-viewer@example.test' });
    const order = (await getPool().query("select * from commerce_orders where tenant_id=$1 and snapshot->'customer'->>'email'='proof-buyer@example.test'", [tenantId])).rows[0];
    await getPool().query("update commerce_orders set payment_status='paid',fulfillment_status='received',updated_at=clock_timestamp() where tenant_id=$1 and id=$2", [tenantId, order.id]);
    const request = () => orderFiles(new Request(`http://localhost/api/commerce/admin/orders/${order.id}/files?pdf=1&cutLines=0`), { params: Promise.resolve({ orderId: order.id }) });
    expect((await getOrderWorkspace(tenantId, viewer, { filter: 'approval' })).orders.some(o => o.id === order.id)).toBe(true);
    expect((await request()).status).toBe(409);
    const catalogProduct = (await commerceProducts(tenantId))[0];
    await getPool().query("update commerce_artwork_proofs set approved_at=now(),published_at=now(),updated_at=clock_timestamp(),crop=jsonb_set(crop,'{geometryHash}',to_jsonb($3::text)) where tenant_id=$1 and order_id=$2", [tenantId, order.id, geometryHash(catalogProduct)]);
    expect((await getOrderWorkspace(tenantId, viewer, { filter: 'ready' })).orders.some(o => o.id === order.id)).toBe(true);
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString()).toBe('%PDF');
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: viewer, tenantId: otherTenant, role: 'viewer', email: 'worklist-viewer@example.test' });
    expect((await request()).status).toBe(403);
  });
  it("persists isolated transparent payments, serializes charges and confirms only the seller's full amount", async () => {
    vi.stubEnv("APP_URL", "https://panel.example.test");
    const customerId = (await getPool().query("select id from commerce_customers where tenant_id=$1 limit 1", [tenantId])).rows[0].id;
    const { session } = await createBuyerSession(tenantId);
    const store = (await getCommerceStore("ground-shop"))!;
    const createOrder = async () => (await getPool().query("insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider) values($1,$2,$3,$4,$5,12990,0,12990,'mercado_pago') returning id", [tenantId, customerId, session.id, Math.floor(Math.random() * 1000000), JSON.stringify({ customer: { email: "buyer@example.test", name: "Buyer" }, billing: { ...testCommerceBilling, personType: "F" } })])).rows[0].id;
    const orderId = await createOrder();
    const providerOrderId = "ORD01J49MMW3SSBK5PSV3DFR32959";
    let reference = "", paid = false, seller = "123", amount = "129.90";
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const provider = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/users/me")) return Response.json({ id: 123 });
      if (init?.method === "POST") { reference = JSON.parse(String(init.body)).external_reference; await gate; return Response.json({ id: providerOrderId }, { status: 201 }); }
      return Response.json({ id: providerOrderId, user_id: seller, country_code: "BRA", external_reference: reference, total_amount: amount, total_paid_amount: paid ? amount : "0.00", status: paid ? "processed" : "action_required", status_detail: paid ? "accredited" : "waiting_payment", transactions: { payments: [{ amount, status: paid ? "processed" : "action_required", status_detail: paid ? "accredited" : "waiting_payment", payment_method: { id: "pix", type: "bank_transfer", qr_code: "pix-test", token: "must-not-be-persisted" }, date_of_expiration: new Date(Date.now() + 1800000).toISOString() }] } });
    });
    vi.stubGlobal("fetch", provider);
    try {
      await savePaymentConnection(tenantId, actorId, { manualEnabled: true, manualInstructions: "Manual", mpEnabled: true, accessToken: "fake-private-token", webhookSecret: "fake-secret", publicKey: "APP_USR-public-test", transparentEnabled: true });
      const request = { orderId, requestId: crypto.randomUUID(), payment: { method: "pix" as const } };
      const first = startDirectPayment(tenantId, customerId, request);
      await vi.waitFor(() => expect(reference).toBeTruthy());
      await startDirectPayment(tenantId, customerId, request);
      await expect(startDirectPayment(tenantId, customerId, { ...request, requestId: crypto.randomUUID() })).rejects.toThrow("andamento");
      await expect(checkoutPayment(store, customerId, orderId)).rejects.toThrow("andamento");
      release!(); await first;
      expect(provider.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
      const pending = await buyerPaymentState(tenantId, customerId, orderId);
      expect(pending.attempt?.status).toBe("pending");
      expect(pending.attempt?.result.qrCode).toBe("pix-test");
      expect(JSON.stringify(pending)).not.toMatch(/fake-private|fake-secret|must-not-be-persisted|fingerprint/);
      await expect(buyerPaymentState(otherTenant, customerId, orderId)).rejects.toThrow("não encontrado");
      await expect(buyerPaymentState(tenantId, crypto.randomUUID(), orderId)).rejects.toThrow("não encontrado");
      paid = true; seller = "another-seller";
      await expect(refreshDirectPayment(tenantId, customerId, orderId)).rejects.toThrow("não correspondem");
      seller = "123"; amount = "1.00";
      await expect(refreshDirectPayment(tenantId, customerId, orderId)).rejects.toThrow("não correspondem");
      amount = "129.90";
      expect((await refreshDirectPayment(tenantId, customerId, orderId)).paymentStatus).toBe("paid");
      expect((await refreshDirectPayment(tenantId, customerId, orderId)).paymentStatus).toBe("paid");
      expect((await getPool().query("select count(*)::int as count from commerce_order_events where tenant_id=$1 and order_id=$2 and type='payment.paid'", [tenantId, orderId])).rows[0].count).toBe(1);
      const snapshot = (await getPool().query("select * from commerce_payment_attempts where tenant_id=$1 and order_id=$2", [tenantId, orderId])).rows[0];
      expect(JSON.stringify(snapshot)).not.toContain("must-not-be-persisted");
      const unknownOrderId = await createOrder();
      provider.mockRejectedValue(new Error("network failure"));
      const unknown = { orderId: unknownOrderId, requestId: crypto.randomUUID(), payment: { method: "pix" as const } };
      await startDirectPayment(tenantId, customerId, unknown);
      expect((await buyerPaymentState(tenantId, customerId, unknownOrderId)).attempt?.status).toBe("unknown");
      await expect(startDirectPayment(tenantId, customerId, { ...unknown, requestId: crypto.randomUUID() })).rejects.toThrow("andamento");
      const client = await getPool().connect();
      try { await client.query("set role anon"); await expect(client.query("select * from commerce_payment_attempts")).rejects.toMatchObject({ code: "42501" }); }
      finally { await client.query("reset role"); client.release(); }
    } finally { release?.(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it("isolates sandbox keys and orders and reconciles test webhooks after switching back to production", async () => {
    vi.stubEnv("APP_URL", "https://panel.example.test");
    await savePaymentConnection(tenantId, actorId, { manualEnabled: false, manualInstructions: "", mpEnabled: true, transparentEnabled: true, paymentEnvironment: "test", testPublicKey: "APP_USR-sandbox-public", testAccessToken: "fake-sandbox-token", testWebhookSecret: "sandbox-signature", testSellerId: "456", testCredentialsConfirmed: true });
    await getPool().query("update commerce_products set snapshot=jsonb_set(snapshot,'{personalized}','false') where tenant_id=$1", [tenantId]);
    const store = (await getCommerceStore("ground-shop"))!, products = await commerceProducts(tenantId);
    const { session } = await createBuyerSession(tenantId);
    const customerId = (await getPool().query("select id from commerce_customers where tenant_id=$1 limit 1", [tenantId])).rows[0].id;
    await getPool().query("update commerce_sessions set customer_id=$2 where id=$1", [session.id, customerId]); session.customer_id = customerId;
    const lines = [{ id: crypto.randomUUID(), productId: products[0].id, quantity: 10, artworkName: "", artworkId: null }];
    await replaceCart(store, session, 0, lines); session.cart = lines; session.revision = 1;
    const calculated = await calculateCommerceCart(tenantId, session.id, lines, products);
    const checkout = { revision: 1, expectedTotalCents: calculated.totalCents, billing: testCommerceBilling, delivery: "pickup" as const, deliveryAddressSameAsBilling: true, address: null, provider: "mercado_pago" as const, acceptedTerms: true as const };
    await expect(createCommerceOrder(store, session, checkout)).rejects.toThrow("ambiente de pagamento");
    const order = await createCommerceOrder(store, session, { ...checkout, paymentEnvironment: "test" });
    expect((await buyerOrders(tenantId, customerId)).find(o => o.id === order.id)?.payment_environment).toBe("test");
    expect((await getCommerceAdmin(actorId, tenantId)).readiness.paymentReady).toBe(true);
    let reference = "", approved = false;
    const mpId = "ORD01J49MMW3SSBK5PSV3DFR32961";
    const provider = vi.fn(async (url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fake-sandbox-token");
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body)); reference = payload.external_reference;
        expect(payload.payer).toEqual({ email: "test_payer@example.com", first_name: "APRO" });
        return Response.json({ id: mpId }, { status: 201 });
      }
      expect(url).toContain(`/v1/orders/${mpId}`);
      return Response.json({ id: mpId, user_id: "456", live_mode: false, country_code: "BRA", external_reference: reference, total_amount: (calculated.totalCents / 100).toFixed(2), total_paid_amount: approved ? (calculated.totalCents / 100).toFixed(2) : "0.00", status: approved ? "processed" : "action_required", status_detail: approved ? "accredited" : "waiting_transfer", transactions: { payments: [{ amount: (calculated.totalCents / 100).toFixed(2), status: approved ? "processed" : "action_required", status_detail: approved ? "accredited" : "waiting_transfer", payment_method: { id: "pix", type: "bank_transfer", qr_code: "simulated-pix" } }] } });
    });
    vi.stubGlobal("fetch", provider);
    try {
      await startDirectPayment(tenantId, customerId, { orderId: order.id, requestId: crypto.randomUUID(), payment: { method: "pix" } });
      expect((await buyerPaymentState(tenantId, customerId, order.id)).environment).toBe("test");
      expect((await getOrderWorkspace(tenantId, actorId)).orders.some(o => o.id === order.id)).toBe(false);
      expect((await getOrderWorkspace(tenantId, actorId, { filter: "test" })).orders.some(o => o.id === order.id)).toBe(true);
      await savePaymentConnection(tenantId, actorId, { manualEnabled: false, manualInstructions: "", mpEnabled: true, transparentEnabled: true, paymentEnvironment: "production" });
      approved = true;
      const state = await refreshDirectPayment(tenantId, customerId, order.id);
      expect(state).toMatchObject({ environment: "test", canStart: false, paymentStatus: "paid" });
      expect((await getPool().query("select count(*)::int as count from commerce_order_events where tenant_id=$1 and order_id=$2 and type='payment.paid'", [tenantId, order.id])).rows[0].count).toBe(0);
      expect(JSON.stringify(state)).not.toMatch(/fake-sandbox-token|sandbox-signature/);
      const signature = createHmac("sha256", "sandbox-signature").update(`id:${mpId.toLowerCase()};request-id:req-sandbox;ts:1234567890;`).digest("hex");
      const webhookRequest = (test = true) => new Request(`https://panel.example.test/api/store/ground-shop/payment-webhook?data.id=${mpId}${test ? "&environment=test" : ""}`, { method: "POST", headers: { "x-signature": `ts=1234567890,v1=${signature}`, "x-request-id": "req-sandbox" } });
      expect((await paymentWebhook(webhookRequest(), { params: Promise.resolve({ slug: "ground-shop" }) })).status).toBe(200);
      expect((await paymentWebhook(webhookRequest(false), { params: Promise.resolve({ slug: "ground-shop" }) })).status).toBe(401);
      vi.mocked(getCurrentSession).mockResolvedValue({ userId: actorId, tenantId, role: "owner", email: "commerce-admin@example.test" });
      const action = await orderAction(new Request(`https://panel.example.test/api/commerce/admin/orders/${order.id}`, { method: "POST", headers: { origin: "https://panel.example.test", "content-type": "application/json" }, body: JSON.stringify({ action: "production", note: "Test must never release real production" }) }), { params: Promise.resolve({ orderId: order.id }) });
      expect(action.status).toBe(409);
      expect((await orderFiles(new Request(`https://panel.example.test/api/commerce/admin/orders/${order.id}/files?pdf=1`), { params: Promise.resolve({ orderId: order.id }) })).status).toBe(409);
      expect((await getPool().query("select payment_environment,fulfillment_status from commerce_orders where id=$1", [order.id])).rows[0]).toMatchObject({ payment_environment: "test", fulfillment_status: "received" });
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
});
