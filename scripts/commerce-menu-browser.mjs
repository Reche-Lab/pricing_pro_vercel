import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import pg from "pg";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL, base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: url }); await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let store, originalProducts = [];
const variantIds = [], errors = [];
try {
  store = (await db.query("select s.* from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug='ground-shop'")).rows[0];
  assert.ok(store, "Run the isolated commerce database suite first.");
  originalProducts = (await db.query("select cp.*,v.product_id from commerce_products cp join product_variants v on v.id=cp.variant_id where cp.tenant_id=$1", [store.tenant_id])).rows;
  assert.ok(originalProducts[0]);
  const template = originalProducts[0];
  const admin = (await db.query("select id from app_users where email='commerce-admin@example.test'")).rows[0];
  const token = await new SignJWT({ userId: admin.id, tenantId: store.tenant_id, email: "commerce-admin@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  await db.query("update commerce_stores set enabled=true,status='published' where tenant_id=$1", [store.tenant_id]);
  await db.query("update commerce_products set active=false where tenant_id=$1", [store.tenant_id]);
  for (const [category, name, model, count] of [["Bottons", "Botton", "botton-25mm-v1", 6], ["Espelhos", "Espelho", "espelho-redondo-v1", 3], ["Ímãs", "Ímã", "ima-redondo-v1", 2], ["Abridores", "Abridor", "abridor-redondo-v1", 2]]) {
    for (let index = 0; index < count; index++) {
      const variant = (await db.query("insert into product_variants(tenant_id,product_id,name) values($1,$2,$3) returning id", [store.tenant_id, template.product_id, `Menu fixture ${randomUUID()}`])).rows[0].id;
      variantIds.push(variant);
      await db.query("insert into commerce_products(tenant_id,variant_id,active,snapshot) values($1,$2,true,$3)", [store.tenant_id, variant, JSON.stringify({ ...template.snapshot, variantId: variant, category, name: `${name} ${index + 2},5 cm`, imageUrl: `${base}/mockups/${model}/base-verso.png`, media: [] })]);
    }
  }
  const placeholder = await readFile(new URL("../public/mockups/botton-25mm-v1/base-verso.png", import.meta.url));
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ reducedMotion: "reduce", isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
    await context.route("https://liaflow-calcula.vercel.app/**", route => route.fulfill({ contentType: "image/png", body: placeholder }));
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    for (const prefix of ["/loja/ground-shop", "/commerce/ground-shop/preview"]) {
      for (const [width, height] of mobile ? [[390, 844], [320, 640], [844, 390]] : [[1440, 960], [1920, 1080]]) {
        await page.setViewportSize({ width, height });
        await page.goto(`${base}${prefix}`, { waitUntil: "networkidle" });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { localStorage.setItem("commerce-theme:ground-shop", value); window.dispatchEvent(new Event("storage")); }, theme);
          await page.locator(`[data-theme="${theme}"]`).waitFor();
          const trigger = page.getByRole("button", { name: "Bottons", exact: true });
          if (mobile) await trigger.tap(); else await trigger.hover();
          const panel = page.getByRole("region", { name: "Produtos de Bottons", exact: true });
          await panel.waitFor();
          assert.equal(await trigger.getAttribute("aria-expanded"), "true");
          const bounds = await panel.boundingBox();
          assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `Panel fits ${prefix} ${width}x${height}`);
          const links = panel.locator('a[href*="/produto/"]'); assert.equal(await links.count(), 6);
          for (const image of await panel.locator("img").all()) await image.evaluate(element => element.decode());
          if (!mobile) { await links.first().hover(); await page.waitForTimeout(220); assert.equal(await panel.count(), 1); }
          await page.screenshot({ path: `/tmp/commerce-menu-${prefix.includes("preview") ? "preview" : "public"}-${width}-${theme}.png` });
          await links.last().scrollIntoViewIfNeeded();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          await page.getByRole("button", { name: "Fechar categorias", exact: true }).click();
          await panel.waitFor({ state: "hidden" });
          if (!mobile) {
            await trigger.focus(); await page.keyboard.press("ArrowDown"); await panel.waitFor();
            assert.equal(await panel.evaluate(element => element.contains(document.activeElement)), true);
            await page.keyboard.press("Escape"); assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
          }
        }
        const trigger = page.getByRole("button", { name: "Espelhos", exact: true });
        if (mobile) await trigger.tap(); else await trigger.hover();
        const panel = page.getByRole("region", { name: "Produtos de Espelhos", exact: true });
        const link = panel.locator('a[href*="/produto/"]').first(), href = await link.getAttribute("href");
        await link.click(); await page.waitForURL(`${base}${href}`);
        assert.equal(await page.getByRole("region", { name: "Produtos de Espelhos", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Espelhos", exact: true }).getAttribute("aria-current"), "true");
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("Category dropdowns passed: public/preview, light/dark, desktop hover, mobile taps, keyboard/Escape, real image loading, bounded scrolling and product navigation at 1440/1920/390/320/844px.");
} finally {
  await browser.close();
  if (variantIds.length) {
    await db.query("delete from commerce_products where variant_id=any($1::uuid[])", [variantIds]);
    await db.query("delete from product_variants where id=any($1::uuid[])", [variantIds]);
  }
  for (const product of originalProducts) await db.query("update commerce_products set active=$2 where id=$1", [product.id, product.active]);
  if (store) await db.query("update commerce_stores set enabled=$2,status=$3 where tenant_id=$1", [store.tenant_id, store.enabled, store.status]);
  await db.end();
}
