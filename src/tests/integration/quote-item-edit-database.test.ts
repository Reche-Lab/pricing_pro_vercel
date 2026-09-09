// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/client";
import { updateQuoteEditable, type UpdateQuoteInput } from "@/repositories/quotes";

const url = process.env.QUOTE_EDIT_TEST_DATABASE_URL;
describe.skipIf(!url)("quote item edits in isolated Postgres", () => {
  let tenantId: string;
  let actorId: string;
  let quoteId: string;
  let variantId: string;
  let originalId: string;
  let newItemId: string;
  const edit = (items: UpdateQuoteInput["items"], expectedItemIds: string[]) => updateQuoteEditable(actorId, tenantId, quoteId, {
    items, expectedItemIds, shippingTotal: 5, discountType: "percent", discountValue: 10, discountReason: "Teste", reason: "Teste de edição"
  });
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Isolated local database required");
    process.env.DATABASE_URL = url;
    process.env.DATABASE_SSL = "false";
    const db = getPool();
    tenantId = (await db.query("select id from tenants where slug='ground-shop'")).rows[0].id;
    actorId = (await db.query("insert into app_users(email,name,password_hash,status) values($1,'Quote edit test','not-a-password','active') returning id", [`quote-edit-${randomUUID()}@example.test`])).rows[0].id;
    await db.query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenantId, actorId]);
    variantId = (await db.query("select id from product_variants where tenant_id=$1 and active=true limit 1", [tenantId])).rows[0].id;
    quoteId = (await db.query("insert into quotes(tenant_id,created_by) values($1,$2) returning id", [tenantId, actorId])).rows[0].id;
    originalId = (await db.query("insert into quote_items(tenant_id,quote_id,product_variant_id,description,quantity,unit_price,total_price) values($1,$2,$3,'Original',2,10,20) returning id", [tenantId, quoteId, variantId])).rows[0].id;
    await db.query("insert into quote_item_artworks(tenant_id,quote_id,quote_item_id,file_name,mime_type,file_size,data_url) values($1,$2,$3,'test.png','image/png',1,'data:image/png;base64,AA==')", [tenantId, quoteId, originalId]);
    const termId = (await db.query("insert into quote_payment_terms(tenant_id,quote_id) values($1,$2) returning id", [tenantId, quoteId])).rows[0].id;
    await db.query("insert into quote_payment_installments(tenant_id,quote_payment_term_id,installment_number,amount) values($1,$2,1,25)", [tenantId, termId]);
  });
  afterAll(async () => {
    const db = getPool();
    if (quoteId) await db.query("delete from quotes where id=$1", [quoteId]);
    if (actorId) {
      await db.query("delete from audit_logs where actor_user_id=$1", [actorId]);
      await db.query("delete from app_users where id=$1", [actorId]);
    }
    await db.end();
    globalThis.__pricingPool = undefined;
  });

  it("inserts an item, keeps original IDs, recalculates discounts, totals and installments", async () => {
    const result = await edit([
      { id: originalId, productVariantId: variantId, quantity: 2, unitPrice: 10 },
      { productVariantId: variantId, quantity: 3, unitPrice: 12.35, artworkName: "Nova arte" }
    ], [originalId]);
    expect(result).toMatchObject({ subtotal: 57.05, discountTotal: 5.71, grandTotal: 56.34 });
    const rows = (await getPool().query("select * from quote_items where quote_id=$1 order by created_at", [quoteId])).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(originalId);
    expect(rows[0].description).toBe("Original");
    newItemId = rows[1].id;
    expect(rows[1].manual_unit_price).toBe(false);
    expect(rows[1].artwork_name).toBe("Nova arte");
    const installment = await getPool().query("select amount from quote_payment_installments where quote_payment_term_id in (select id from quote_payment_terms where quote_id=$1)", [quoteId]);
    expect(Number(installment.rows[0].amount)).toBe(56.34);
  });

  it("rejects stale lists, foreign IDs and invalid products without partial writes", async () => {
    await expect(edit([{ id: originalId, productVariantId: variantId, quantity: 2, unitPrice: 10 }], [originalId])).rejects.toThrow(/Recarregue/);
    await expect(edit([{ id: randomUUID(), productVariantId: variantId, quantity: 2, unitPrice: 10 }], [originalId, newItemId])).rejects.toThrow(/pertence/);
    await expect(edit([
      { id: originalId, productVariantId: variantId, quantity: 99, unitPrice: 10 },
      { productVariantId: randomUUID(), quantity: 1, unitPrice: 10 }
    ], [originalId, newItemId])).rejects.toThrow(/Produto/);
    const rows = (await getPool().query("select id,quantity from quote_items where quote_id=$1", [quoteId])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find(item => item.id === originalId)?.quantity).toBe(2);
  });

  it("removes only the selected item and its artworks and records before/after snapshots", async () => {
    await edit([{ id: newItemId, productVariantId: variantId, quantity: 3, unitPrice: 12.35 }], [originalId, newItemId]);
    expect((await getPool().query("select id from quote_items where quote_id=$1", [quoteId])).rows).toEqual([{ id: newItemId }]);
    expect((await getPool().query("select id from quote_item_artworks where quote_id=$1", [quoteId])).rowCount).toBe(0);
    const log = (await getPool().query("select * from quote_edit_logs where quote_id=$1 order by created_at desc limit 1", [quoteId])).rows[0];
    expect(log.reason).toContain("removidos: 1");
    expect(log.before_snapshot.items).toHaveLength(2);
    expect(log.after_snapshot.items).toHaveLength(1);
    expect(log.edited_by).toBe(actorId);
  });

  it("blocks empty budgets, accepted budgets, invoices and access using another tenant", async () => {
    await expect(edit([], [newItemId])).rejects.toThrow(/ao menos um/);
    const item = { id: newItemId, productVariantId: variantId, quantity: 3, unitPrice: 12.35 };
    await getPool().query("update quotes set status='accepted' where id=$1", [quoteId]);
    await expect(edit([item], [newItemId])).rejects.toThrow(/fechado/);
    await getPool().query("update quotes set status='draft', external_olist_invoice_id='123' where id=$1", [quoteId]);
    await expect(edit([item], [newItemId])).rejects.toThrow(/nota fiscal/);
    await expect(updateQuoteEditable(actorId, randomUUID(), quoteId, { items: [item], shippingTotal: 0, discountType: "none", discountValue: 0 })).rejects.toThrow(/not found/);
  });
});
