// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { createBuyerSession, type BuyerSession, type CommerceStore, type CommerceProduct } from "@/repositories/commerce";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { executeAssistantTool, confirmAssistantCart } from "@/services/commerce/assistant-tools";
import { ASSISTANT_FALLBACK_MODEL, ASSISTANT_PRIMARY_MODEL } from "@/domain/commerce/assistant-models";
import { assistantSettingsSchema } from "@/domain/commerce/assistant";
import { assistantConfig, saveAssistantConfig, setAssistantState, reserveAssistantCall, settleAssistantCall, assistantUsage, startAssistantConversation, requireAssistantConversation, beginAssistantTurn, completeAssistantTurn, assistantMessages, purgeExpiredAssistant } from "@/repositories/commerce-assistant";
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("assistant isolated database security", () => {
  let tenant: string, other: string, actor: string, session: BuyerSession, customer: string, otherCustomer: string;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Isolated test database required.");
    process.env.DATABASE_URL = url; process.env.DATABASE_SSL = "false";
    for (let i = 0; i < 2; i++) {
      const id = (await getPool().query("insert into tenants(name,slug) values('Assistant test',$1) returning id", [`assistant-${randomUUID()}`])).rows[0].id;
      await getPool().query("insert into commerce_stores(tenant_id) values($1)", [id]); if (!i) tenant = id; else other = id;
    }
    actor = (await getPool().query("insert into app_users(email,name,password_hash,status) values($1,'Admin','not-a-password','active') returning id", [`assistant-${randomUUID()}@example.test`])).rows[0].id;
    session = (await createBuyerSession(tenant)).session;
    customer = (await getPool().query("insert into commerce_customers(tenant_id,name,email) values($1,'Buyer','buyer@example.test') returning id", [tenant])).rows[0].id;
    otherCustomer = (await getPool().query("insert into commerce_customers(tenant_id,name,email) values($1,'Other buyer','other@example.test') returning id", [tenant])).rows[0].id;
  });
  afterAll(async () => {
    await getPool().query("delete from audit_logs where tenant_id=any($1::uuid[])", [[tenant, other]]);
    await getPool().query("delete from commerce_sessions where tenant_id=any($1::uuid[])", [[tenant, other]]);
    await getPool().query("delete from commerce_customers where tenant_id=any($1::uuid[])", [[tenant, other]]);
    await getPool().query("delete from commerce_products where tenant_id=any($1::uuid[])", [[tenant, other]]);
    await getPool().query("delete from commerce_stores where tenant_id=any($1::uuid[])", [[tenant, other]]);
    await getPool().query("delete from tenants where id=any($1::uuid[])", [[tenant, other]]);
    await getPool().query("delete from app_users where id=$1", [actor]); await getPool().end(); globalThis.__pricingPool = undefined;
  });
  it("requires test and optimistic revision before activation", async () => {
    let config = (await saveAssistantConfig(tenant, actor, 0, assistantSettingsSchema.parse({})))!;
    expect(config.enabled).toBe(false); expect(await assistantConfig(other)).toBeNull();
    await expect(setAssistantState(tenant, actor, config.revision, "enable")).rejects.toMatchObject({ status: 409 });
    await setAssistantState(tenant, actor, config.revision, "tested"); await setAssistantState(tenant, actor, config.revision, "enable");
    const old = config.revision; config = (await saveAssistantConfig(tenant, actor, old, { ...config.settings, about: "Dados revisados" }))!;
    expect(config.enabled).toBe(false); expect(config.tested_revision).toBeNull();
    await expect(saveAssistantConfig(tenant, actor, old, config.settings)).rejects.toMatchObject({ status: 409 });
    await expect(saveAssistantConfig(tenant, actor, 0, config.settings)).rejects.toMatchObject({ status: 409 });
  });
  it("keeps quota atomic under concurrency and settles the original month", async () => {
    await getPool().query("insert into commerce_assistant_limits(tenant_id,monthly_calls,monthly_tokens,monthly_usd) values($1,3,5000,1)", [tenant]);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveAssistantCall(tenant, 1000)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
    expect((await assistantUsage(tenant)).calls).toBe(3);
    const reserved = results.find(r => r.status === "fulfilled")! as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveAssistantCall>>>;
    await settleAssistantCall(tenant, reserved.value.usageMonth, 1000, { tokens: 100, cost: .002 });
    expect(Number((await assistantUsage(tenant)).tokens)).toBe(2100); expect((await assistantUsage(tenant)).cost_usd).toBeCloseTo(.202);
    expect((await assistantUsage(other)).calls).toBe(0);
    await getPool().query("update commerce_assistant_limits set allowed=false where tenant_id=$1", [tenant]);
    await expect(reserveAssistantCall(tenant, 10)).rejects.toMatchObject({ status: 503 });
  });
  it("encrypts history and binds it to the exact session and verified account", async () => {
    const conv = await startAssistantConversation(tenant, session, 30), second = (await createBuyerSession(tenant)).session;
    await expect(requireAssistantConversation(tenant, second, conv.id)).rejects.toMatchObject({ status: 404 });
    await expect(requireAssistantConversation(other, session, conv.id)).rejects.toMatchObject({ status: 404 });
    const id = randomUUID(); expect(await beginAssistantTurn(tenant, session, conv.id, id, "Arte para meu evento")).toBe(true);
    await completeAssistantTurn(tenant, conv.id, id, "Vamos escolher juntos.", []);
    expect(await beginAssistantTurn(tenant, session, conv.id, id, "Arte para meu evento")).toBe(false);
    await expect(beginAssistantTurn(tenant, session, conv.id, id, "Outro texto")).rejects.toMatchObject({ status: 409 });
    expect((await assistantMessages(tenant, conv.id))).toHaveLength(2);
    const raw = (await getPool().query("select payload_encrypted from commerce_assistant_messages where tenant_id=$1", [tenant])).rows;
    expect(JSON.stringify(raw)).not.toContain("Arte para meu evento");
    await getPool().query("update commerce_sessions set customer_id=$2 where id=$1", [session.id, customer]);
    await expect(requireAssistantConversation(tenant, session, conv.id)).rejects.toMatchObject({ status: 404 });
    const logged = { ...session, customer_id: customer }; await requireAssistantConversation(tenant, logged, conv.id);
    await getPool().query("update commerce_sessions set customer_id=$2 where id=$1", [session.id, otherCustomer]);
    await expect(requireAssistantConversation(tenant, { ...session, customer_id: otherCustomer }, conv.id)).rejects.toMatchObject({ status: 404 });
    await getPool().query("update commerce_sessions set customer_id=null where id=$1", [session.id]);
    await expect(requireAssistantConversation(tenant, session, conv.id)).rejects.toMatchObject({ status: 404 });
  });
  it("does not reset the daily visitor limit when history is cleared", async () => {
    await getPool().query("update commerce_assistant_limits set visitor_daily_turns=1 where tenant_id=$1", [tenant]);
    const visitor = (await createBuyerSession(tenant)).session, conv = await startAssistantConversation(tenant, visitor, 1);
    const id = randomUUID(); await beginAssistantTurn(tenant, visitor, conv.id, id, "Olá"); await completeAssistantTurn(tenant, conv.id, id, "Olá!", []);
    await getPool().query("delete from commerce_assistant_conversations where id=$1", [conv.id]);
    const another = await startAssistantConversation(tenant, visitor, 1);
    await expect(beginAssistantTurn(tenant, visitor, another.id, randomUUID(), "Outra mensagem")).rejects.toMatchObject({ status: 429 });
    await getPool().query("update commerce_assistant_conversations set expires_at=now()-interval '1 second' where id=$1", [another.id]);
    await expect(requireAssistantConversation(tenant, visitor, another.id)).rejects.toMatchObject({ status: 404 });
    await purgeExpiredAssistant(tenant); expect((await getPool().query("select id from commerce_assistant_conversations where id=$1", [another.id])).rowCount).toBe(0);
  });
  it("denies raw tables to public Supabase roles", async () => {
    for (const role of ["anon", "authenticated"]) for (const name of ["settings", "limits", "usage", "conversations", "turns", "visitor_usage", "messages", "actions", "documents"]) {
      const client = await getPool().connect();
      try { await client.query("begin"); await client.query(`set local role ${role}`); await expect(client.query(`select * from commerce_assistant_${name}`)).rejects.toMatchObject({ code: "42501" }); }
      finally { await client.query("rollback"); client.release(); }
    }
  });
  it("stages exact published prices without writes, then atomically confirms only once", async () => {
    let config = (await assistantConfig(tenant))!;
    await setAssistantState(tenant, actor, config.revision, "tested"); config = (await setAssistantState(tenant, actor, config.revision, "enable"))!;
    await getPool().query("update commerce_assistant_limits set allowed=true where tenant_id=$1", [tenant]);
    const productId = (await getPool().query("insert into products(tenant_id,name,slug,category) values($1,'Botton','botton','Personalizados') returning id", [tenant])).rows[0].id;
    const variantId = (await getPool().query("insert into product_variants(tenant_id,product_id,name) values($1,$2,'35 mm') returning id", [tenant, productId])).rows[0].id;
    const snapshot = { variantId, name: "Botton - 3,5 cm", description: "Personalizado", category: "Bottons", imageUrl: "", minQuantity: 1, maxQuantity: 1000, maxArtworks: 10, pricingRule: "per_art", personalized: true, geometry: null, margins: { bleedMm: 2, safeMarginMm: 2 }, curve: { mode: "step", points: [{ quantity: 1, unitPrice: 5 }, { quantity: 10, unitPrice: 3 }] }, platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 } } as Omit<CommerceProduct, "id">;
    const id = (await getPool().query("insert into commerce_products(tenant_id,variant_id,snapshot,active) values($1,$2,$3,true) returning id", [tenant, variantId, JSON.stringify(snapshot)])).rows[0].id;
    const settings = storeSettingsSchema.parse({ name: "Loja", description: "", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "store@example.test", contactPhone: "", pickupEnabled: true, pickupAddress: "Rua teste", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições" });
    await getPool().query("update commerce_stores set enabled=true,status='published',settings=$2 where tenant_id=$1", [tenant, JSON.stringify(settings)]);
    const visitor = (await createBuyerSession(tenant)).session, conv = await startAssistantConversation(tenant, visitor, 30);
    const store = { tenant_id: tenant, slug: "assistant-test", status: "published", settings } as CommerceStore;
    const context = { store, session: visitor, config, conversationId: conv.id };
    const proposed = await executeAssistantTool(context, "prepare_quote", { items: [{ productId: id, quantity: 20, artworks: 2, artworkName: "Campanha" }] });
    expect(proposed.card.kind).toBe("proposal"); if (proposed.card.kind !== "proposal") throw new Error();
    expect(proposed.card.totalCents).toBe(6000); expect(proposed.card.items.map(item => item.quantity)).toEqual([10, 10]);
    expect((await getPool().query("select cart from commerce_sessions where id=$1", [visitor.id])).rows[0].cart).toEqual([]);
    const first = await confirmAssistantCart(context, proposed.card.actionId); expect(first.alreadyApplied).toBe(false);
    expect((await confirmAssistantCart(context, proposed.card.actionId)).alreadyApplied).toBe(true);
    expect((await getPool().query("select cart from commerce_sessions where id=$1", [visitor.id])).rows[0].cart).toHaveLength(2);
    const latest = (await getPool().query<BuyerSession>("select * from commerce_sessions where id=$1", [visitor.id])).rows[0];
    const viewed = await executeAssistantTool({ ...context, session: latest }, "view_cart", {});
    expect(viewed.card).toMatchObject({ kind: "cart", totalCents: 6000 });
    expect((await getPool().query("select revision from commerce_sessions where id=$1", [visitor.id])).rows[0].revision).toBe(latest.revision);
    const another = (await createBuyerSession(tenant)).session, own = await startAssistantConversation(tenant, another, 30);
    await expect(confirmAssistantCart({ ...context, session: another, conversationId: own.id }, proposed.card.actionId)).rejects.toMatchObject({ status: 404 });
    await expect(executeAssistantTool(context, "prepare_quote", { items: [{ productId: randomUUID(), quantity: 1, artworks: 1 }] })).rejects.toThrow(/disponível/);
    await expect(executeAssistantTool(context, "prepare_quote", { items: [{ productId: id, quantity: 1, artworks: 2 }] })).rejects.toThrow(/quantidade de artes/);
    await expect(executeAssistantTool(context, "prepare_quote", { items: [{ productId: id, quantity: 1, artworks: 1 }] }, { adminPreview: true })).rejects.toMatchObject({ status: 403 });
    await getPool().query("insert into product_search_aliases(tenant_id,product_variant_id,alias,normalized_alias,source) values($1,$2,'Broche 35mm','broche 35mm','manual')", [tenant, variantId]);
    const found = await executeAssistantTool(context, "search_products", { query: "Broche 35mm" });
    expect(found.card).toMatchObject({ kind: "products", products: [expect.objectContaining({ id })] });
    expect(JSON.stringify(found.result)).not.toContain('"unitCents"'); expect(JSON.stringify(found.result)).not.toContain('"curve"');
    const changed = await executeAssistantTool({ ...context, session: another, conversationId: own.id }, "prepare_quote", { items: [{ productId: id, quantity: 20 }] });
    if (changed.card.kind !== "proposal") throw new Error();
    await getPool().query("update commerce_products set snapshot=jsonb_set(snapshot,'{curve,points,1,unitPrice}','4') where id=$1", [id]);
    await expect(confirmAssistantCart({ ...context, session: another, conversationId: own.id }, changed.card.actionId)).rejects.toMatchObject({ status: 409 });
    expect((await getPool().query("select cart from commerce_sessions where id=$1", [another.id])).rows[0].cart).toEqual([]);
    await getPool().query("delete from commerce_products where tenant_id=$1", [tenant]); await getPool().query("delete from products where tenant_id=$1", [tenant]);
  });
  it("authorizes and bills fallback attempts without changing the tenant primary or bypassing a cap", async () => {
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", `${ASSISTANT_PRIMARY_MODEL},${ASSISTANT_FALLBACK_MODEL}`);
    try {
      const result = await reserveAssistantCall(other, 100, ASSISTANT_FALLBACK_MODEL);
      expect(result.model).toBe(ASSISTANT_FALLBACK_MODEL);
      expect((await getPool().query("select model from commerce_assistant_limits where tenant_id=$1", [other])).rows[0].model).toBe(ASSISTANT_PRIMARY_MODEL);
      await expect(reserveAssistantCall(other, 100, "unauthorized/model")).rejects.toMatchObject({ status: 503 });
      vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", ASSISTANT_PRIMARY_MODEL);
      await expect(reserveAssistantCall(other, 100, ASSISTANT_FALLBACK_MODEL)).rejects.toMatchObject({ status: 503 });
      expect((await assistantUsage(other)).calls).toBe(1);
      vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", `${ASSISTANT_PRIMARY_MODEL},${ASSISTANT_FALLBACK_MODEL}`);
      await getPool().query("update commerce_assistant_limits set monthly_calls=1 where tenant_id=$1", [other]);
      await expect(reserveAssistantCall(other, 100, ASSISTANT_FALLBACK_MODEL)).rejects.toMatchObject({ status: 429 });
      expect((await assistantUsage(other)).calls).toBe(1);
    } finally { vi.unstubAllEnvs(); }
  });
});
