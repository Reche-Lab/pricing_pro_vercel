// @vitest-environment node
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { getCurrentSession } from "@/lib/auth/session";
import { getCommerceOlistJob, queueCommerceOlistOrder, saveCommerceOlistSettings } from "@/repositories/commerce-olist";
import { processCommerceOlistOrder } from "@/services/commerce/olist-worker";
import { commerceOlistSettingsSchema } from "@/domain/commerce/olist";
import { POST as action, GET as read } from "@/app/api/commerce/admin/orders/[orderId]/olist/route";
import { POST as changeOrder } from "@/app/api/commerce/admin/orders/[orderId]/route";
import { GET as cron } from "@/app/api/cron/commerce-olist/route";
import { testCommerceBilling } from "../fixtures/commerce-checkout";

vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/services/commerce/olist-schedule", () => ({ scheduleCommerceOlist: vi.fn() }));
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("commerce Olist durable workflow in isolated Postgres", () => {
  let actor: string;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("An isolated local database is required.");
    process.env.DATABASE_URL = url; process.env.DATABASE_SSL = "false"; process.env.COMMERCE_ENABLED = "true";
    actor = (await getPool().query("insert into app_users(email,name,password_hash,status) values($1,'Olist tester','fake','active') returning id", [`olist-${randomUUID()}@example.test`])).rows[0].id;
  });
  afterAll(async () => { await getPool().end(); globalThis.__pricingPool = undefined; });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  async function fixture(input: { configured?: boolean; enabled?: boolean; environment?: string; paid?: boolean } = {}) {
    const pool = getPool();
    const tenantId = (await pool.query("insert into tenants(name,slug) values('Olist store test',$1) returning id", [`olist-${randomUUID()}`])).rows[0].id;
    await pool.query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenantId, actor]);
    await pool.query("insert into commerce_stores(tenant_id,enabled) values($1,true)", [tenantId]);
    const productId = (await pool.query("insert into products(tenant_id,name,slug,category) values($1,'Botton','botton','Teste') returning id", [tenantId])).rows[0].id;
    const variantId = (await pool.query("insert into product_variants(tenant_id,product_id,name,sku,external_olist_product_id,height_cm,width_cm,length_cm,unit_weight_kg) values($1,$2,'35 mm','1bot35per','777',0.5,3.5,3.5,0.01) returning id", [tenantId, productId])).rows[0].id;
    await pool.query("insert into packaging_boxes(tenant_id,name,height_cm,width_cm,length_cm,weight_kg) values($1,'Caixa',10,15,20,0.1)", [tenantId]);
    const customerId = (await pool.query("insert into commerce_customers(tenant_id,email,name) values($1,'buyer@example.test','Comprador') returning id", [tenantId])).rows[0].id;
    const sessionId = (await pool.query("insert into commerce_sessions(tenant_id,customer_id,token_hash) values($1,$2,$3) returning id", [tenantId, customerId, randomUUID()])).rows[0].id;
    const commerceProductId = randomUUID(), lineId = randomUUID();
    const snapshot = { billing: { ...testCommerceBilling, personType: "F" }, customer: { name: "Comprador", email: "buyer@example.test" }, delivery: "delivery", address: { ...testCommerceBilling, attention: "Maria", email: undefined },
      shippingOption: { id: "melhor_envio:1", name: "Correios - PAC", priceCents: 500 },
      items: [{ id: lineId, productId: commerceProductId, quantity: 3, unitCents: 800, totalCents: 2390, artworkDiscountCents: 10, artworkName: "Arte escolar", name: "Botton" }],
      products: [{ id: commerceProductId, variantId, name: "Botton", personalized: false }], lines: [{ id: lineId, productId: commerceProductId, quantity: 3, artworkId: null, artworkName: "Arte escolar" }], terms: "Test", storeRevision: 1 };
    const orderId = (await pool.query("insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment) values($1,$2,$3,0,$4,2390,500,2890,'manual',$5) returning id", [tenantId, customerId, sessionId, JSON.stringify(snapshot), input.environment || "production"])).rows[0].id;
    if (input.configured !== false) await pool.query("insert into integration_connections(tenant_id,provider,status,settings,credentials_encrypted) values($1,'olist','active',$2,$3)", [tenantId, JSON.stringify({ api_base_url: "https://api.tiny.com.br/public-api/v3", app_base_url: "https://accounts.tiny.com.br", melhor_envio_forma_envio_id: "400", pac_forma_frete_id: "401" }), encryptTenantSecret({ accessToken: "fake-access", refreshToken: "fake-refresh", clientId: "fake-client", clientSecret: "fake-secret" })]);
    await pool.query("insert into olist_payment_options(tenant_id,kind,external_id,name) values($1,'receiving_method','101','Recebido na loja')", [tenantId]);
    await saveCommerceOlistSettings(tenantId, actor, commerceOlistSettingsSchema.parse({ enabled: input.enabled ?? input.configured !== false, manualReceivingId: "101" }));
    if (input.paid !== false) await pool.query("update commerce_orders set payment_status='paid' where tenant_id=$1 and id=$2", [tenantId, orderId]);
    return { tenantId, orderId, snapshot, variantId };
  }
  function provider() {
    let contact = false, externalOrder: Record<string, unknown> | null = null, invoice = false, authorized = false, expedition = false;
    let loseOrder = false, loseWithoutCreating = false, authInvalid = false, emailMismatch = false, rejectInvoice = false, pendingAuthorization = false;
    const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!["api.tiny.com.br", "accounts.tiny.com.br"].includes(url.hostname)) throw new Error("Unexpected outbound host");
      const path = url.pathname.replace("/public-api/v3", ""), method = init?.method || "GET";
      const body = init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : {};
      calls.push({ path, method, body });
      if (authInvalid) return Response.json(url.hostname === "accounts.tiny.com.br" ? { error: "invalid_grant" } : {}, { status: url.hostname === "accounts.tiny.com.br" ? 400 : 401 });
      if (path === "/contatos" && method === "GET") return Response.json({ itens: contact ? [{ id: 11, cpfCnpj: testCommerceBilling.document }] : [] });
      if (path === "/contatos" && method === "POST") { contact = true; return Response.json({ id: 11 }, { status: 201 }); }
      if (path === "/pedidos" && method === "GET") return Response.json({ itens: externalOrder ? [{ id: 22 }] : [] });
      if (path === "/pedidos/22" && method === "GET") return Response.json({ id: 22, ecommerce: externalOrder?.ecommerce, cliente: { id: 11 }, valor: 28.9 });
      if (path === "/pedidos" && method === "POST") { if (!loseWithoutCreating) externalOrder = body; if (loseOrder || loseWithoutCreating) throw new Error("Simulated connection lost after submission"); return Response.json({ id: 22 }, { status: 201 }); }
      if (path.endsWith("/despacho")) return Response.json({});
      if (path === "/notas" && method === "GET") return Response.json({ itens: invoice ? [{ id: 33, numero: 7, serie: "1" }] : [] });
      if (path === "/pedidos/22/gerar-nota-fiscal") { invoice = true; return Response.json({ id: 33, numero: 7, serie: "1" }); }
      if (path === "/notas/33" && method === "GET") return Response.json({ id: 33, numero: 7, serie: "1", valor: 28.9, cliente: { cpfCnpj: testCommerceBilling.document, email: emailMismatch ? "different@example.test" : testCommerceBilling.email }, situacao: rejectInvoice ? 5 : authorized ? 6 : 1, linkAcesso: authorized ? "https://erp.tiny.com.br/doc/nota-test" : undefined });
      if (path === "/notas/33/emitir") { authorized = !pendingAuthorization; return Response.json({ id: 33, situacao: authorized ? 6 : 4 }); }
      if (path === "/notas/33/link") return Response.json({ link: "https://erp.tiny.com.br/doc/nota-test" });
      if (path === "/expedicao" && method === "GET") return Response.json({ itens: expedition ? [{ id: 44 }] : [] });
      if (path === "/expedicao" && method === "POST") { expedition = true; return Response.json({ id: 44 }); }
      throw new Error(`Unexpected mocked ERP request ${method} ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
    return { calls, setLose: (value: boolean, absent = false) => { loseOrder = value; loseWithoutCreating = absent; }, setAuthInvalid: (value: boolean) => { authInvalid = value; }, setEmailMismatch: () => { emailMismatch = true; }, setReject: () => { rejectInvoice = true; }, setPending: () => { pendingAuthorization = true; }, authorize: () => { authorized = true; }, writes: (path: string) => calls.filter(call => call.method === "POST" && call.path === path) };
  }
  function login(tenantId: string) {
    vi.stubEnv("APP_URL", "https://panel.example.test");
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: actor, tenantId, email: "olist@example.test", role: "owner" });
  }
  async function productionReady(tenantId: string, orderId: string) {
    login(tenantId);
    await getPool().query("update commerce_orders set fulfillment_status='production' where tenant_id=$1 and id=$2", [tenantId, orderId]);
    return action(new Request(`https://panel.example.test/api/commerce/admin/orders/${orderId}/olist`, { method: "POST", headers: { origin: "https://panel.example.test" }, body: JSON.stringify({ action: "production_ready", note: "Produção e embalagem conferidas" }) }), { params: Promise.resolve({ orderId }) });
  }
  it("does not queue tenants without Olist, disabled settings, pending payments or sandbox orders", async () => {
    for (const options of [{ configured: false }, { enabled: false }, { paid: false }, { environment: "test" }]) {
      const { tenantId, orderId } = await fixture(options);
      expect(await getCommerceOlistJob(tenantId, orderId)).toBeNull();
    }
  });
  it("commits the outbox with payment, creates exact-valued customer/order once and waits for production", async () => {
    const { tenantId, orderId } = await fixture(), api = provider();
    expect((await getCommerceOlistJob(tenantId, orderId))?.status).toBe("pending");
    await Promise.all([processCommerceOlistOrder(tenantId, orderId), processCommerceOlistOrder(tenantId, orderId)]);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: "11", sales_order_id: "22", status: "waiting", invoice_id: null });
    expect(api.writes("/contatos")).toHaveLength(1); expect(api.writes("/pedidos")).toHaveLength(1);
    expect(api.writes("/pedidos")[0].body).toMatchObject({ idContato: 11, valorFrete: 5, valorDesconto: 0.1, enderecoEntrega: { nomeDestinatario: testCommerceBilling.name, complemento: "A/C: Maria" }, pagamento: { formaRecebimento: { id: 101 } } });
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(0);
    await processCommerceOlistOrder(tenantId, orderId); expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("only invoices after production completion and authorizes with email before real ERP dispatch", async () => {
    const { tenantId, orderId } = await fixture(), api = provider();
    await processCommerceOlistOrder(tenantId, orderId);
    const response = await productionReady(tenantId, orderId);
    expect(response.status).toBe(200);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    const job = await getCommerceOlistJob(tenantId, orderId);
    expect(job).toMatchObject({ invoice_id: "33", invoice_status: 6, expedition_id: "44", status: "done" });
    expect(job?.email_requested_at).toBeTruthy();
    expect(job?.package_snapshot?.grossWeightKg).toBeGreaterThan(0);
    expect(api.writes("/notas/33/emitir")[0].body).toEqual({ enviarEmail: true });
    expect(api.writes("/expedicao")[0].body).toEqual({ idsNotasFiscais: [33] });
    const shipping = api.calls.findIndex(call => call.path === "/pedidos/22/despacho" && call.method === "PUT");
    const fiscal = api.calls.findIndex(call => call.path === "/pedidos/22/gerar-nota-fiscal");
    expect(shipping).toBeGreaterThan(0); expect(shipping).toBeLessThan(fiscal);
    expect(api.calls[shipping].body).toMatchObject({ pesoBruto: expect.any(Number), volumes: 1, formaEnvio: { id: 400 } });
    await processCommerceOlistOrder(tenantId, orderId); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
  });
  it("polls authorization rather than equating HTTP 200 with fiscal approval or resending email", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setPending();
    await processCommerceOlistOrder(tenantId, orderId); await productionReady(tenantId, orderId); await processCommerceOlistOrder(tenantId, orderId, 6);
    expect((await getCommerceOlistJob(tenantId, orderId))?.invoice_status).toBe(4); expect(api.writes("/expedicao")).toHaveLength(0);
    api.authorize(); await getPool().query("update commerce_olist_orders set next_attempt_at=now() where tenant_id=$1 and order_id=$2", [tenantId, orderId]);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect((await getCommerceOlistJob(tenantId, orderId))?.expedition_id).toBe("44"); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
  });
  it("reconciles an uncertain external order without creating another one", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setLose(true);
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "review", attempt_stage: "sales_order" });
    api.setLose(false); await queueCommerceOlistOrder(tenantId, orderId, actor); await processCommerceOlistOrder(tenantId, orderId);
    expect((await getCommerceOlistJob(tenantId, orderId))?.sales_order_id).toBe("22"); expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("never blindly recreates a mutation with an unknown result", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setLose(true, true);
    await processCommerceOlistOrder(tenantId, orderId); api.setLose(false);
    await queueCommerceOlistOrder(tenantId, orderId, actor); await processCommerceOlistOrder(tenantId, orderId);
    expect((await getCommerceOlistJob(tenantId, orderId))?.status).toBe("review"); expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("keeps progress and a reconnectable state on invalid_grant", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setAuthInvalid(true);
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "blocked", error_code: "olist_oauth_invalid", sales_order_id: null });
    api.setAuthInvalid(false); await queueCommerceOlistOrder(tenantId, orderId, actor); await processCommerceOlistOrder(tenantId, orderId);
    expect((await getCommerceOlistJob(tenantId, orderId))?.sales_order_id).toBe("22");
  });
  it("serializes the same billing document across concurrent purchases without duplicating the contact", async () => {
    const { tenantId, orderId } = await fixture(), api = provider();
    const otherId = (await getPool().query(`insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment)
      select tenant_id,customer_id,session_id,1,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment from commerce_orders where tenant_id=$1 and id=$2 returning id`, [tenantId, orderId])).rows[0].id;
    await getPool().query("update commerce_orders set payment_status='paid' where tenant_id=$1 and id=$2", [tenantId, otherId]);
    await Promise.all([processCommerceOlistOrder(tenantId, orderId, 1), processCommerceOlistOrder(tenantId, otherId, 1)]);
    await queueCommerceOlistOrder(tenantId, otherId, actor); await processCommerceOlistOrder(tenantId, otherId, 1);
    expect(api.writes("/contatos")).toHaveLength(1);
    expect((await getPool().query("select count(*)::int as count from commerce_olist_customers where tenant_id=$1 and external_id='11'", [tenantId])).rows[0].count).toBe(1);
    expect((await getPool().query("select count(*)::int as count from commerce_olist_leases where lock_key like $1", [`%${tenantId}%`])).rows[0].count).toBe(0);
  });
  it("does not authorize with a divergent email and never sends rejected notes to dispatch", async () => {
    for (const scenario of ["email", "rejected"]) {
      const { tenantId, orderId } = await fixture(), api = provider();
      await processCommerceOlistOrder(tenantId, orderId); await productionReady(tenantId, orderId);
      if (scenario === "email") api.setEmailMismatch(); else api.setReject();
      await processCommerceOlistOrder(tenantId, orderId, 6);
      expect(["blocked", "review"]).toContain((await getCommerceOlistJob(tenantId, orderId))?.status);
      expect(api.writes("/notas/33/emitir")).toHaveLength(0); expect(api.writes("/expedicao")).toHaveLength(0);
    }
  });
  it("isolates API reads, configuration IDs and stops processing after refunds", async () => {
    const first = await fixture(), other = await fixture(), api = provider();
    login(other.tenantId);
    expect((await read(new Request("https://panel.example.test"), { params: Promise.resolve({ orderId: first.orderId }) })).status).toBe(404);
    await expect(saveCommerceOlistSettings(other.tenantId, actor, commerceOlistSettingsSchema.parse({ enabled: true, manualReceivingId: "999999" }))).rejects.toThrow("deste tenant");
    await getPool().query("update commerce_orders set payment_status='refunded' where tenant_id=$1 and id=$2", [first.tenantId, first.orderId]);
    expect((await getCommerceOlistJob(first.tenantId, first.orderId))?.status).toBe("stopped");
    await processCommerceOlistOrder(first.tenantId, first.orderId); expect(api.calls).toHaveLength(0);
    const client = await getPool().connect();
    try { await client.query("set role anon"); await expect(client.query("select * from commerce_olist_orders")).rejects.toMatchObject({ code: "42501" }); } finally { await client.query("reset role"); client.release(); }
  });
  it("protects cron with a strong server-only secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-very-long-local-cron-secret-for-tests");
    expect((await cron(new Request("https://panel.example.test/api/cron/commerce-olist"))).status).toBe(401);
  });
  it("blocks shipment before fiscal release but leaves manual workflow available when Olist is explicitly disabled", async () => {
    const { tenantId, orderId } = await fixture(); login(tenantId);
    await getPool().query("update commerce_orders set fulfillment_status='production' where tenant_id=$1 and id=$2", [tenantId, orderId]);
    const request = () => new Request(`https://panel.example.test/api/commerce/admin/orders/${orderId}`, { method: "POST", headers: { origin: "https://panel.example.test" }, body: JSON.stringify({ action: "shipped", note: "Pedido conferido para entrega" }) });
    const params = { params: Promise.resolve({ orderId }) };
    expect((await changeOrder(request(), params)).status).toBe(409);
    await getPool().query("update integration_connections set status='disabled' where tenant_id=$1 and provider='olist'", [tenantId]);
    expect((await changeOrder(request(), params)).status).toBe(200);
    await expect(saveCommerceOlistSettings(tenantId, actor, commerceOlistSettingsSchema.parse({ enabled: false, manualReceivingId: "999999" }))).resolves.toBeUndefined();
  });
});
