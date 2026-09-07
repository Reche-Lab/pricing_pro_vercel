import assert from "node:assert/strict";
import { createRequire } from "node:module";
import pg from "pg";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL;
const base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" ||
    !new URL(url).pathname.startsWith("/commerce_test_") ||
    new URL(base).hostname !== "127.0.0.1") {
  throw new Error("Use isolated local commerce test fixtures only.");
}
const db = new pg.Client({ connectionString: url });
await db.connect();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined,
});
try {
  const { rows: [product] } = await db.query(
    "select p.* from commerce_products p join tenants t on t.id=p.tenant_id where t.slug='ground-shop' limit 1",
  );
  // Transparent padding exercises the backdrop without changing stored product media.
  const fixture = await sharp("public/brands/ground-shop.jpeg")
    .resize(260, 260, { fit: "contain" }).ensureAlpha()
    .extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#00000000" })
    .png().toBuffer();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://liaflow-calcula.vercel.app/brands/ground-shop.jpeg",
    route => route.fulfill({ contentType: "image/png", body: fixture }));
  for (const theme of ["light", "dark"]) {
    for (const width of [1365, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/loja/ground-shop`, { waitUntil: "networkidle" });
      await page.evaluate(value => {
        localStorage.setItem("commerce-theme:ground-shop", value);
        window.dispatchEvent(new Event("storage"));
      }, theme);
      await page.locator(`[data-theme="${theme}"]`).waitFor();
      const card = page.locator('a[class*="_product_"]').first();
      await card.scrollIntoViewIfNeeded();
      const photo = card.locator('[class*="productPhoto"]');
      await photo.locator("img").evaluate(img => img.decode());
      const css = await photo.evaluate(el => ({
        background: getComputedStyle(el).backgroundImage,
        filter: getComputedStyle(el.querySelector("img")).filter,
      }));
      const expected = await page.evaluate(value => {
        const reference = document.createElement("div");
        reference.style.background = value === "light"
          ? "radial-gradient(circle at 50% 38%, #ffffff 0%, #f4f6f5 58%, #e9eeec 100%)"
          : "radial-gradient(circle at 50% 38%, rgba(111,208,201,0.13) 0%, rgba(111,208,201,0.03) 38%, transparent 62%), linear-gradient(145deg, #19232d 0%, #10161e 100%)";
        reference.style.filter = value === "light"
          ? "drop-shadow(0 14px 18px rgba(29,38,48,0.12))"
          : "drop-shadow(0 16px 20px rgba(0,0,0,0.34))";
        document.body.append(reference);
        const result = { background: getComputedStyle(reference).backgroundImage, filter: getComputedStyle(reference).filter };
        reference.remove();
        return result;
      }, theme);
      assert.deepEqual(css, expected, "Product backdrop and shadow must match GroundShop_NuvemShop tokens");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await card.screenshot({ path: `/tmp/commerce-product-${theme}-${width}.png` });
      await page.screenshot({ path: `/tmp/commerce-catalog-${theme}-${width}.png`, fullPage: true });
      if (width === 1365) {
        await card.hover();
        await page.waitForTimeout(450);
        assert.notEqual(await card.evaluate(el => getComputedStyle(el).transform), "none");
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await card.evaluate(el => getComputedStyle(el).transform), "none");
        await page.emulateMedia({ reducedMotion: "no-preference" });
      }
      await page.goto(`${base}/loja/ground-shop/produto/${product.id}`, { waitUntil: "networkidle" });
      const stage = page.locator('[class*="galleryStage"]');
      await stage.locator("img").evaluate(img => img.decode());
      assert.equal(await stage.evaluate(el => getComputedStyle(el).backgroundImage), expected.background);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: `/tmp/commerce-gallery-${theme}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log("Product surfaces passed: light/dark, 1365/390/320px, transparent media, gallery, hover and reduced motion. No product edits or purchases.");
} finally {
  await browser.close();
  await db.end();
}
