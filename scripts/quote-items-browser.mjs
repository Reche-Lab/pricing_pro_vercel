import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.QUOTE_EDIT_TEST_DATABASE_URL;
const base = process.env.QUOTE_EDIT_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: url });
await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined });
let actorId;
let quoteId;
try {
  const tenantId = (await db.query("select id from tenants where slug='ground-shop'")).rows[0].id;
  actorId = (await db.query("insert into app_users(email,name,password_hash,status,is_super_admin) values($1,'Editor teste','not-a-password','active',true) returning id", [`quote-browser-${randomUUID()}@example.test`])).rows[0].id;
  await db.query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenantId, actorId]);
  const variantId = (await db.query("select id from product_variants where tenant_id=$1 and active=true limit 1", [tenantId])).rows[0].id;
  quoteId = (await db.query("insert into quotes(tenant_id,created_by,subtotal,shipping_total,grand_total) values($1,$2,20,5,25) returning id", [tenantId, actorId])).rows[0].id;
  const originalId = (await db.query("insert into quote_items(tenant_id,quote_id,product_variant_id,description,quantity,unit_price,total_price) values($1,$2,$3,'Produto original',2,10,20) returning id", [tenantId, quoteId, variantId])).rows[0].id;
  const token = await new SignJWT({ userId: actorId, tenantId, email: "quote-browser@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("quote-local-test-secret-at-least-32-characters"));
  const context = await browser.newContext();
  await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/quotes/${quoteId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Editar", exact: true }).first().click();
    const modal = page.getByRole("dialog", { name: "Editar orçamento" });
    await modal.getByRole("button", { name: "Adicionar produto" }).click();
    await modal.getByLabel("Qtd.", { exact: true }).fill("10");
    await modal.getByText(/Preço pela curva para 10 un/).waitFor();
    await page.screenshot({ path: `/tmp/quote-items-add-${width}.png` });
    const unitPrice = Number(await modal.getByLabel("Preço unitário", { exact: true }).inputValue());
    assert(unitPrice > 0);
    assert(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "Modal overflow");
    const saveButton = modal.getByRole("button", { name: "Salvar alterações", exact: true });
    await saveButton.scrollIntoViewIfNeeded();
    const rect = await saveButton.boundingBox();
    assert(rect.x >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= 901);
    const saved = page.waitForResponse(response => response.url().endsWith(`/quotes/${quoteId}/edit`) && response.request().method() === "PATCH");
    await saveButton.click();
    assert((await saved).ok(), "Save failed");
    await page.reload({ waitUntil: "networkidle" });
    let rows = (await db.query("select id,unit_price,quantity from quote_items where quote_id=$1", [quoteId])).rows;
    assert.equal(rows.length, 2);
    assert(rows.some(row => row.id === originalId));
    const addedId = rows.find(row => row.id !== originalId).id;
    assert.equal(Number(rows.find(row => row.id === addedId).unit_price), unitPrice);
    await page.getByRole("button", { name: "Editar", exact: true }).first().click();
    const removeButton = modal.getByRole("button", { name: /^Remover produto/ }).last();
    await removeButton.click();
    await modal.getByRole("button", { name: "Confirmar remoção" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/quote-items-remove-${width}.png` });
    const removed = page.waitForResponse(response => response.url().endsWith(`/quotes/${quoteId}/edit`) && response.request().method() === "PATCH");
    await modal.getByRole("button", { name: "Confirmar remoção" }).click();
    assert((await removed).ok(), "Remove failed");
    await page.reload({ waitUntil: "networkidle" });
    rows = (await db.query("select id from quote_items where quote_id=$1", [quoteId])).rows;
    assert.deepEqual(rows, [{ id: originalId }]);
  }
  // Malformed or stale edits must not mutate the quote via the HTTP API.
  const current = { id: originalId, productVariantId: variantId, quantity: 2, unitPrice: 10 };
  const payload = { items: [current, current], expectedItemIds: [originalId], shippingTotal: 5, discountType: "none", discountValue: 0, reason: "Test" };
  assert.equal((await context.request.patch(`${base}/api/quotes/${quoteId}/edit`, { data: payload })).status(), 409);
  assert.equal((await context.request.patch(`${base}/api/quotes/${quoteId}/edit`, { data: { ...payload, items: [] } })).status(), 400);
  assert.deepEqual(errors, []);
  console.log("Quote items passed: add/remove, price curve, reload persistence, desktop/mobile, modal overflow, API validation.");
} finally {
  await browser.close();
  if (quoteId) await db.query("delete from quotes where id=$1", [quoteId]);
  if (actorId) {
    await db.query("delete from audit_logs where actor_user_id=$1", [actorId]);
    await db.query("delete from app_users where id=$1", [actorId]);
  }
  await db.end();
}
