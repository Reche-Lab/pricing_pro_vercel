// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/client";
import { buyerQuotePdfVisuals } from "@/repositories/commerce-quote-pdf";
import { geometryHash, type CommerceProduct } from "@/repositories/commerce";

const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("buyer quote PDF private images in isolated PostgreSQL", () => {
  const tenants: string[] = [];
  beforeAll(() => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Isolated local database required");
    vi.stubEnv("DATABASE_URL", url); vi.stubEnv("DATABASE_SSL", "false");
  });
  afterAll(async () => {
    try {
      for (const table of ["commerce_buyer_quotes", "commerce_artworks", "commerce_sessions", "commerce_customers", "commerce_products", "commerce_stores", "product_variants", "products"])
        if (tenants.length) await getPool().query(`delete from ${table} where tenant_id=any($1::uuid[])`, [tenants]);
      if (tenants.length) await getPool().query("delete from tenants where id=any($1::uuid[])", [tenants]);
    } finally { await getPool().end(); globalThis.__pricingPool = undefined; vi.unstubAllEnvs(); }
  });
  async function fixture() {
    const db = getPool(), tenant = (await db.query("insert into tenants(name,slug) values('PDF test',$1) returning id", [`pdf-${randomUUID()}`])).rows[0].id;
    tenants.push(tenant);
    await db.query("insert into commerce_stores(tenant_id,enabled,settings) values($1,true,'{}')", [tenant]);
    const customer = (await db.query("insert into commerce_customers(tenant_id,name,email) values($1,'Cliente','client@example.test') returning id", [tenant])).rows[0].id;
    const session = (await db.query("insert into commerce_sessions(tenant_id,customer_id,token_hash) values($1,$2,$3) returning id", [tenant, customer, randomUUID()])).rows[0].id;
    const product = (await db.query("insert into products(tenant_id,name,slug,category) values($1,'Botton',$2,'Bottons') returning id", [tenant, randomUUID()])).rows[0].id;
    const variant = (await db.query("insert into product_variants(tenant_id,product_id,name) values($1,$2,'3,5 cm') returning id", [tenant, product])).rows[0].id;
    const publication = (await db.query("insert into commerce_products(tenant_id,variant_id,snapshot) values($1,$2,$3) returning id,snapshot", [tenant, variant, { imageUrl: "https://cdn.example.test/product.png", geometry: { shape: "circle", widthMm: 30, heightMm: 30, cornerRadiusMm: 0, cornerStyle: "sharp", rotationDegrees: 0, allowPrintRotation: true }, margins: { safeMarginMm: 2.5, bleedMm: 3 } }])).rows[0];
    const art = (await db.query("insert into commerce_artworks(tenant_id,session_id,product_id,storage_path,prepared_path,file_name,content_hash,crop,approved_at) values($1,$2,$3,$4,$5,'source.png','test',$6,now()) returning id", [tenant, session, publication.id, `${tenant}/source.png`, `${tenant}/prepared.png`, { geometryHash: geometryHash(publication.snapshot as CommerceProduct) }])).rows[0].id;
    const line = randomUUID();
    const quote = (await db.query("insert into commerce_buyer_quotes(tenant_id,customer_id,session_id,request_id,request_hash,snapshot,contact_encrypted,subtotal_cents,shipping_cents,total_cents) values($1,$2,$3,$4,'test',$5,'not-used-in-image-query',15000,0,13500) returning id", [tenant, customer, session, randomUUID(), { lines: [{ id: line, productId: publication.id, artworkId: art, preparation: "customer" }] }])).rows[0].id;
    return { tenant, customer, session, publication: publication.id, art, quote, line };
  }
  it("loads only the saved quote owner's artwork, model dimensions and approved preparation", async () => {
    const f = await fixture();
    const assets = await buyerQuotePdfVisuals(f.tenant, f.customer, f.quote);
    expect(assets.get(f.line)).toMatchObject({ product_image_url: "https://cdn.example.test/product.png", print_width_mm: "30", print_bleed_mm: "3", artworks: [{ id: f.art, storage_path: `${f.tenant}/source.png`, prepared_storage_path: `${f.tenant}/prepared.png`, approval_status: "approved" }] });
    expect((await buyerQuotePdfVisuals(randomUUID(), f.customer, f.quote)).size).toBe(0);
    expect((await buyerQuotePdfVisuals(f.tenant, randomUUID(), f.quote)).size).toBe(0);
  });
  it("does not inherit approval after model dimensions change", async () => {
    const f = await fixture();
    await getPool().query("update commerce_products set snapshot=jsonb_set(snapshot,'{geometry,widthMm}','32') where tenant_id=$1 and id=$2", [f.tenant, f.publication]);
    expect((await buyerQuotePdfVisuals(f.tenant, f.customer, f.quote)).get(f.line)?.artworks?.[0].approval_status).toBe("pending");
  });
  it("rejects references to another tenant or session's private artwork", async () => {
    const f = await fixture(), other = await fixture();
    await getPool().query("update commerce_buyer_quotes set snapshot=jsonb_set(snapshot,'{lines,0,artworkId}',to_jsonb($2::text)) where id=$1", [f.quote, other.art]);
    expect((await buyerQuotePdfVisuals(f.tenant, f.customer, f.quote)).get(f.line)?.artworks).toEqual([]);
    await getPool().query("update commerce_artworks set session_id=$3 where tenant_id=$1 and id=$2", [f.tenant, f.art, (await getPool().query("insert into commerce_sessions(tenant_id,token_hash) values($1,$2) returning id", [f.tenant, randomUUID()])).rows[0].id]);
    await getPool().query("update commerce_buyer_quotes set snapshot=jsonb_set(snapshot,'{lines,0,artworkId}',to_jsonb($2::text)) where id=$1", [f.quote, f.art]);
    expect((await buyerQuotePdfVisuals(f.tenant, f.customer, f.quote)).get(f.line)?.artworks).toEqual([]);
  });
});
