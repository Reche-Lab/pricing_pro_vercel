// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { getCommerceStore, saveCommerceStore } from "@/repositories/commerce";
import { storeAdminSchema } from "@/domain/commerce/schemas";
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("isolated studio settings persistence", () => {
  let tenant: string, actor: string, platform: string, other: string;
  const slug = `studio-${randomUUID()}`;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Only isolated local commerce databases are allowed.");
    process.env.DATABASE_URL = url; process.env.DATABASE_SSL = "false"; process.env.COMMERCE_ENABLED = "true";
    const pool = getPool();
    tenant = (await pool.query("insert into tenants(name,slug) values('Studio test',$1) returning id", [slug])).rows[0].id;
    other = (await pool.query("insert into tenants(name,slug) values('Other studio test',$1) returning id", [`other-${slug}`])).rows[0].id;
    actor = (await pool.query("insert into app_users(email,name,password_hash,status) values($1,'Studio owner','not-a-password','active') returning id", [`${slug}@example.test`])).rows[0].id;
    await pool.query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenant, actor]);
    platform = (await pool.query("insert into platform_rules(tenant_id,key,name) values($1,'studio','Studio') returning id", [tenant])).rows[0].id;
    await pool.query("insert into commerce_stores(tenant_id,settings) values($1,$2)", [other, { name: "Another store" }]);
  });
  afterAll(async () => {
    if (tenant) {
      await getPool().query("delete from commerce_stores where tenant_id=any($1::uuid[])", [[tenant, other]]);
      await getPool().query("delete from tenants where id=any($1::uuid[])", [[tenant, other]]);
    }
    if (actor) await getPool().query("delete from app_users where id=$1", [actor]);
    await getPool().end(); globalThis.__pricingPool = undefined;
  });
  it("round-trips the explicit preset through the existing save/read contract without activating another tenant", async () => {
    const settings = { name: "Studio test", description: "Actual store", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "studio@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "", experience: { style: "studio", motion: false, backgroundUrl: "https://example.test/studio.webp" } };
    const input = storeAdminSchema.parse({ enabled: true, status: "paused", platformId: platform, products: [], settings });
    await saveCommerceStore(actor, tenant, input);
    const store = await getCommerceStore(slug, true);
    expect(store?.settings.experience).toEqual(settings.experience);
    expect(await getCommerceStore(slug)).toBeNull();
    const otherStore = (await getPool().query("select settings from commerce_stores where tenant_id=$1", [other])).rows[0];
    expect(otherStore.settings.experience).toBeUndefined();
    const legacy = { ...input }; delete legacy.settings.experience;
    await saveCommerceStore(actor, tenant, legacy);
    expect((await getCommerceStore(slug, true))?.settings.experience).toBeUndefined();
  });
});
