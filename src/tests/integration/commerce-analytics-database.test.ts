// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commerceAnalyticsReport, loadCommerceAnalyticsSettings, saveCommerceAnalyticsSettings } from "@/repositories/commerce-analytics";
import { defaultAnalyticsSettings } from "@/domain/commerce/analytics";
const state = vi.hoisted(() => ({ pool: null as pg.Pool | null }));
vi.mock("@/lib/db/client", () => ({ getPool: () => { if (!state.pool) throw new Error("Isolated test database unavailable"); return state.pool; }, query: () => { throw new Error("Unexpected database access"); }, withTenantContext: () => { throw new Error("Unexpected database access"); } }));
const url = process.env.COMMERCE_ANALYTICS_TEST_DATABASE_URL;
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
const migration = () => readFile(new URL("../../../supabase/migrations/0081_commerce_analytics.sql", import.meta.url), "utf8");

describe.skipIf(!url)("commerce analytics isolated PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/commerce_analytics_test_")) throw new Error("Use a fresh, dedicated localhost commerce_analytics_test_* database only.");
    state.pool = new pg.Pool({ connectionString: url, max: 2 });
    await state.pool.query(`
      create table commerce_stores(tenant_id uuid primary key,updated_at timestamptz default now());
      create table commerce_payment_connections(tenant_id uuid primary key,payment_environment text);
      create table commerce_sessions(id uuid primary key,tenant_id uuid,customer_id uuid,cart jsonb default '[]',revision int default 0,created_at timestamptz default now(),expires_at timestamptz default now()+interval '14 days');
      create table commerce_orders(id uuid primary key,tenant_id uuid,session_id uuid,cart_revision int,snapshot jsonb,total_cents int,payment_status text,payment_environment text,deleted_at timestamptz,created_at timestamptz default now());
      create table commerce_buyer_quotes(id uuid primary key,tenant_id uuid,session_id uuid,snapshot jsonb,total_cents int,created_at timestamptz default now());
      create table audit_logs(tenant_id uuid,actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
    `);
    await state.pool.query(await migration());
  });
  beforeEach(async () => {
    await state.pool!.query("truncate commerce_stores,commerce_payment_connections,commerce_sessions,commerce_orders,commerce_buyer_quotes,audit_logs");
    await state.pool!.query("insert into commerce_stores(tenant_id) values($1),($2)", [a,b]);
    await state.pool!.query("insert into commerce_payment_connections values($1,'production'),($2,'production')", [a,b]);
  });
  afterAll(async () => { await state.pool?.end(); state.pool = null; });
  const sql = (text: string, values: unknown[] = []) => state.pool!.query(text, values);
  async function cart(tenantId = a, intent = "purchase", customerId: string | null = null, environment = "production", hours = 48) {
    const id = randomUUID(), lines = [{ id: randomUUID(), productId: a, quantity: 10 }];
    await sql("insert into commerce_sessions(id,tenant_id,customer_id) values($1,$2,$3)", [id,tenantId,customerId]);
    await sql("update commerce_sessions set cart=$2::jsonb,cart_intent=$3 where id=$1", [id,JSON.stringify(lines),intent]);
    await sql("update commerce_sessions set cart_environment=$2,cart_updated_at=now()-($3::int*interval '1 hour') where id=$1", [id,environment,hours]);
    return { id, lines };
  }
  async function order(tenantId: string, status: string, environment: string, total: number) {
    await sql("insert into commerce_orders(id,tenant_id,payment_status,payment_environment,total_cents,snapshot) values($1,$2,$3,$4,$5,$6::jsonb)", [randomUUID(),tenantId,status,environment,total,JSON.stringify({ items: [{ productId: a, name: "Produto de teste", quantity: 10, totalCents: total }] })]);
  }
  it("saves independent audited settings without changing another tenant", async () => {
    expect((await loadCommerceAnalyticsSettings(a)).enabled).toBe(false);
    const config = { ...defaultAnalyticsSettings(), enabled: true, privacyReviewed: true, measurementId: "G-ABC1234567" };
    await saveCommerceAnalyticsSettings(a, b, config);
    expect(await loadCommerceAnalyticsSettings(a)).toEqual(config);
    expect((await loadCommerceAnalyticsSettings(b)).enabled).toBe(false);
    expect((await sql("select tenant_id from audit_logs")).rows).toEqual([{ tenant_id: a }]);
    await expect(saveCommerceAnalyticsSettings(randomUUID(), b, config)).rejects.toMatchObject({ status: 409 });
  });
  it("stamps real cart changes and quote environments, not no-op cart reads/updates", async () => {
    await sql("update commerce_payment_connections set payment_environment='test' where tenant_id=$1", [a]);
    const id = randomUUID(); await sql("insert into commerce_sessions(id,tenant_id) values($1,$2)", [id,a]);
    await sql("update commerce_sessions set cart='[{\"quantity\":5}]'::jsonb where id=$1", [id]);
    const first = (await sql("select cart_updated_at,cart_environment from commerce_sessions where id=$1", [id])).rows[0];
    expect(first.cart_environment).toBe("test"); expect(first.cart_updated_at).toBeInstanceOf(Date);
    await sql("update commerce_sessions set cart=cart where id=$1", [id]);
    expect((await sql("select cart_updated_at from commerce_sessions where id=$1", [id])).rows[0].cart_updated_at).toEqual(first.cart_updated_at);
    await sql("insert into commerce_buyer_quotes(id,tenant_id,snapshot,total_cents,environment) values($1,$2,'{}',100,'production')", [randomUUID(),a]);
    expect((await sql("select environment from commerce_buyer_quotes")).rows[0].environment).toBe("test");
  });
  it("reports authoritative production totals and distinct draft/cart populations without cross-tenant/test leakage", async () => {
    await order(a,"paid","production",11000); await order(a,"pending","production",12000); await order(a,"refunded","production",3000); await order(a,"paid","test",99000); await order(b,"paid","production",999999);
    const quote = randomUUID(); await sql("insert into commerce_buyer_quotes(id,tenant_id,snapshot,total_cents) values($1,$2,'{}',15000)", [quote,a]);
    const legacy = randomUUID(); await sql("insert into commerce_buyer_quotes(id,tenant_id,snapshot,total_cents) values($1,$2,'{}',10000)", [legacy,a]); await sql("update commerce_buyer_quotes set environment='unknown' where id=$1", [legacy]);
    await cart(); await cart(a,"quote",b); await cart(a,"quote"); await cart(a,"purchase",null,"production",1); await cart(a,"purchase",null,"test"); await cart(b);
    const report = await commerceAnalyticsReport(a, { days: "30", environment: "production" });
    expect(report.summary).toMatchObject({ orders: 3, paidOrders: 1, pendingOrders: 1, refundedOrders: 1, paidCents: 11000, pendingCents: 12000, quotes: 1, quoteCents: 15000, carts: 4, guestCarts: 3, identifiedCarts: 1, guestQuoteDrafts: 1, identifiedQuoteDrafts: 1, abandonedCarts: 1, legacyQuotes: 1 });
    expect(report.daily).toHaveLength(30); expect(report.daily.reduce((sum, day) => sum + day.paidCents,0)).toBe(11000);
    expect(report.products).toEqual([{ name: "Produto de teste", quantity: 10, totalCents: 11000 }]);
    expect((await commerceAnalyticsReport(a,{ days: "30", environment: "test" })).summary.paidCents).toBe(99000);
    expect((await commerceAnalyticsReport(a,{ days: "30", environment: "all" })).summary.quotes).toBe(2);
  });
  it("does not label an unchanged cart with a saved quote as an abandoned purchase", async () => {
    const current = await cart();
    await sql("insert into commerce_buyer_quotes(id,tenant_id,session_id,snapshot,total_cents) values($1,$2,$3,$4::jsonb,10000)", [randomUUID(),a,current.id,JSON.stringify({ lines: current.lines })]);
    expect((await commerceAnalyticsReport(a,{ days: "7", environment: "production" })).summary.abandonedCarts).toBe(0);
  });
  it("can reapply the migration without resetting existing settings or activity", async () => {
    const current = await cart(); await sql(await migration());
    expect((await sql("select cart_updated_at from commerce_sessions where id=$1",[current.id])).rows[0].cart_updated_at).toBeInstanceOf(Date);
  });
});
