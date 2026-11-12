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
const categoryId = randomUUID(), childId = randomUUID(), campaignId = randomUUID(), artworkId = randomUUID();
const campaignSlug = `menu-${campaignId}`;
try {
  store = (await db.query("select s.* from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug='ground-shop'")).rows[0];
  assert.ok(store, "Run the isolated commerce database suite first.");
  originalProducts = (await db.query("select cp.*,v.product_id from commerce_products cp join product_variants v on v.id=cp.variant_id where cp.tenant_id=$1", [store.tenant_id])).rows;
  assert.ok(originalProducts[0]);
  const template = originalProducts[0];
  const admin = (await db.query("select id from app_users where email='commerce-admin@example.test'")).rows[0];
  const token = await new SignJWT({ userId: admin.id, tenantId: store.tenant_id, email: "commerce-admin@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  await db.query("update commerce_stores set enabled=true,status='published',art_library_enabled=true where tenant_id=$1", [store.tenant_id]);
  await db.query("update commerce_products set active=false where tenant_id=$1", [store.tenant_id]);
  for (const [category, name, model, count] of [["Bottons", "Botton", "botton-25mm-v1", 6], ["Espelhos", "Espelho", "espelho-redondo-v1", 3], ["Ímãs", "Ímã", "ima-redondo-v1", 2], ["Abridores", "Abridor", "abridor-redondo-v1", 2]]) {
    for (let index = 0; index < count; index++) {
      const variant = (await db.query("insert into product_variants(tenant_id,product_id,name) values($1,$2,$3) returning id", [store.tenant_id, template.product_id, `Menu fixture ${randomUUID()}`])).rows[0].id;
      variantIds.push(variant);
      await db.query("insert into commerce_products(tenant_id,variant_id,active,snapshot) values($1,$2,true,$3)", [store.tenant_id, variant, JSON.stringify({ ...template.snapshot, variantId: variant, personalized: true, category, name: `${name} ${index + 2},5 cm`, imageUrl: `${base}/mockups/${model}/base-verso.png`, media: [] })]);
    }
  }
  await db.query("insert into commerce_art_categories(id,tenant_id,name,slug) values($1,$2,'Campanhas sociais',$3)", [categoryId, store.tenant_id, `menu-${categoryId}`]);
  await db.query("insert into commerce_art_categories(id,tenant_id,parent_id,name,slug) values($1,$2,$3,'Outubro rosa',$4)", [childId, store.tenant_id, categoryId, `menu-${childId}`]);
  await db.query("insert into commerce_art_campaigns(id,tenant_id,name,slug,status,cover_url) values($1,$2,'Campanha do menu',$3,'published',$4)", [campaignId, store.tenant_id, campaignSlug, `${base}/mockups/botton-25mm-v1/base-verso.png`]);
  await db.query("insert into commerce_library_artworks(id,tenant_id,category_id,title,search_text,status,storage_path,thumbnail_path,file_name,width,height,content_hash,license_note) values($1,$2,$3,'Arte do menu','arte do menu','published','menu/source.png','menu/thumb.png','menu.png',600,600,'menu-local-fixture','Local browser test only')", [artworkId, store.tenant_id, childId]);
  await db.query("insert into commerce_library_campaign_artworks(tenant_id,campaign_id,artwork_id) values($1,$2,$3)", [store.tenant_id, campaignId, artworkId]);
  const libraryProduct = (await db.query("select id from commerce_products where tenant_id=$1 and variant_id=$2", [store.tenant_id, variantIds[0]])).rows[0].id;
  await db.query("insert into commerce_library_products(tenant_id,artwork_id,product_id) values($1,$2,$3)", [store.tenant_id, artworkId, libraryProduct]);
  const placeholder = await readFile(new URL("../public/mockups/botton-25mm-v1/base-verso.png", import.meta.url));
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ reducedMotion: "reduce", isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
    await context.route("https://liaflow-calcula.vercel.app/**", route => route.fulfill({ contentType: "image/png", body: placeholder }));
    await context.route("**/library/thumbnail/**", route => route.fulfill({ contentType: "image/png", body: placeholder }));
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
          for (const [label, region] of [["Campanhas", "Campanhas da loja"], ["Artes prontas", "Artes prontas da loja"]]) {
            const libraryTrigger = page.getByRole("button", { name: label, exact: true });
            if (mobile) await libraryTrigger.tap(); else await libraryTrigger.hover();
            const libraryPanel = page.getByRole("region", { name: region, exact: true });
            const target = libraryPanel.getByRole("link", { name: label === "Campanhas" ? /Campanha do menu/ : /Arte do menu/ });
            await target.waitFor();
            const libraryBounds = await libraryPanel.boundingBox();
            assert.ok(libraryBounds && libraryBounds.x >= 0 && libraryBounds.x + libraryBounds.width <= width + 1 && libraryBounds.y + libraryBounds.height <= height + 1, `${label} fits ${width}x${height}`);
            for (const image of await libraryPanel.locator("img").all()) await image.evaluate(element => element.decode());
            if (label === "Artes prontas") assert.equal(await libraryPanel.getByRole("link", { name: "Outubro rosa", exact: true }).getAttribute("href"), `${prefix}/artes?categoria=${childId}`);
            await page.screenshot({ path: `/tmp/commerce-menu-library-${label === "Campanhas" ? "campaigns" : "artworks"}-${prefix.includes("preview") ? "preview" : "public"}-${width}-${theme}.png` });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
            await page.getByRole("button", { name: "Fechar categorias", exact: true }).click();
          }
        }
        const trigger = page.getByRole("button", { name: "Espelhos", exact: true });
        if (mobile) await trigger.tap(); else await trigger.hover();
        const panel = page.getByRole("region", { name: "Produtos de Espelhos", exact: true });
        const link = panel.locator('a[href*="/produto/"]').first(), href = await link.getAttribute("href");
        await link.click(); await page.waitForURL(`${base}${href}`);
        assert.equal(await page.getByRole("region", { name: "Produtos de Espelhos", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Espelhos", exact: true }).getAttribute("aria-current"), "true");
        const openLibrary = async label => {
          const button = page.getByRole("button", { name: label, exact: true });
          if (mobile) await button.tap(); else await button.hover();
        };
        await openLibrary("Campanhas");
        await page.getByRole("region", { name: "Campanhas da loja", exact: true }).getByRole("link", { name: /Campanha do menu/ }).click();
        await page.waitForURL(`${base}${prefix}/campanhas/${campaignSlug}`);
        await page.getByRole("heading", { name: "Campanha do menu", exact: true }).waitFor();
        await openLibrary("Artes prontas");
        await page.getByRole("region", { name: "Artes prontas da loja", exact: true }).getByRole("link", { name: "Outubro rosa", exact: true }).click();
        await page.waitForURL(`${base}${prefix}/artes?categoria=${childId}`);
        await page.getByTitle("Ver Arte do menu", { exact: true }).waitFor();
        assert.equal(await page.getByRole("combobox", { name: /^Categoria/ }).inputValue(), childId);
        await openLibrary("Artes prontas");
        await page.getByRole("region", { name: "Artes prontas da loja", exact: true }).getByRole("link", { name: /Arte do menu/ }).click();
        await page.waitForURL(`${base}${prefix}/artes?arte=${artworkId}`);
        await page.getByTitle("Ver Arte do menu", { exact: true }).waitFor();
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("Product, campaign and artwork dropdowns passed: public/preview, light/dark, desktop hover, mobile taps, keyboard/Escape, image loading, bounded scrolling and real gallery/category/artwork navigation at 1440/1920/390/320/844px.");
} finally {
  await browser.close();
  if (store) {
    await db.query("delete from commerce_library_artworks where tenant_id=$1 and id=$2", [store.tenant_id, artworkId]);
    await db.query("delete from commerce_art_campaigns where tenant_id=$1 and id=$2", [store.tenant_id, campaignId]);
    await db.query("delete from commerce_art_categories where tenant_id=$1 and id=any($2::uuid[])", [store.tenant_id, [childId, categoryId]]);
  }
  if (variantIds.length) {
    await db.query("delete from commerce_products where variant_id=any($1::uuid[])", [variantIds]);
    await db.query("delete from product_variants where id=any($1::uuid[])", [variantIds]);
  }
  for (const product of originalProducts) await db.query("update commerce_products set active=$2 where id=$1", [product.id, product.active]);
  if (store) await db.query("update commerce_stores set enabled=$2,status=$3,art_library_enabled=$4 where tenant_id=$1", [store.tenant_id, store.enabled, store.status, store.art_library_enabled]);
  await db.end();
}
