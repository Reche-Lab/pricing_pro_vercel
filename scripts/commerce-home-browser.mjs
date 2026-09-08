import { createRequire } from "node:module";
import { SignJWT } from "jose";
import pg from "pg";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL;
const base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: url });
await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined });
let store;
try {
  store = (await db.query("select s.* from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug='ground-shop'")).rows[0];
  const admin = (await db.query("select id from app_users where email='commerce-admin@example.test'")).rows[0];
  const token = await new SignJWT({ userId: admin.id, tenantId: store.tenant_id, email: "commerce-admin@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  await db.query("update commerce_stores set enabled=true,status='published',settings=$2 where tenant_id=$1", [store.tenant_id, { ...store.settings, banners: [
    { id: "banner1", imageUrl: `${base}/brands/ground-shop.jpeg`, title: "Personalizados com a sua identidade", description: "Uma arte ou várias: escolha os seus produtos.", buttonLabel: "Escolher produtos", category: "", showText: true },
    { id: "banner2", imageUrl: `${base}/brands/ground-shop.jpeg`, title: "Sua próxima ideia", buttonLabel: "Conhecer a coleção", category: "", showText: false },
  ] }]);
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const prefix of ["/loja/ground-shop", "/commerce/ground-shop/preview"]) {
    for (const [width, height] of [[1440, 900], [1920, 1080], [390, 844], [320, 640], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}${prefix}`, { waitUntil: "networkidle" });
      for (const theme of ["dark", "light"]) {
        await page.evaluate(theme => { localStorage.setItem("commerce-theme:ground-shop", theme); window.dispatchEvent(new Event("storage")); }, theme);
        await page.locator(`[data-theme="${theme}"]`).waitFor();
        await page.evaluate(() => scrollTo(0, 0));
        const hero = page.getByRole("region", { name: "Destaques da loja" });
        const bounds = await hero.boundingBox();
        const next = await page.getByRole("region", { name: "Coleções" }).boundingBox();
        if (!bounds || bounds.width > width - 24 || bounds.height > 361 || !next || next.y > height - 16) throw new Error(`Banner hides next section: ${prefix} ${width}x${height} ${JSON.stringify({ bounds, next })}`);
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Overflow at ${width}`);
        const copy = await hero.locator('[class*="heroText"]').boundingBox();
        const cta = await hero.getByRole("link").boundingBox();
        const controls = await hero.locator('[class*="bannerControls"]').boundingBox();
        if (!copy || !cta || !controls || cta.y < bounds.y || cta.y + cta.height > controls.y) throw new Error(`Banner text overlaps controls at ${width}x${height}: ${JSON.stringify({ cta, controls })}`);
        if (theme === "dark" && await page.locator("main").evaluate(el => getComputedStyle(el).backgroundColor) !== "rgb(13, 17, 23)") throw new Error("Dark palette mismatch");
        await page.screenshot({ path: `/tmp/commerce-home-${prefix.includes("preview") ? "preview" : "public"}-${width}-${theme}.png` });
        await page.getByRole("button", { name: "Próximo banner", exact: true }).click();
        const imageOnly = await hero.boundingBox();
        if (Math.abs(imageOnly.height - bounds.height) > 1) throw new Error("Carousel layout shifted");
        await page.getByRole("button", { name: "Banner anterior", exact: true }).click();
      }
    }
    await page.goto(`${base}${prefix}/catalogo`, { waitUntil: "networkidle" });
    await page.getByRole("combobox", { name: "Ordenar produtos" }).selectOption("price_asc");
    await page.getByRole("combobox", { name: "Ordenar produtos" }).selectOption("name");
    await page.screenshot({ path: `/tmp/commerce-home-catalog-${prefix.includes("preview") ? "preview" : "public"}.png`, fullPage: true });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Home passed: public/preview, light/dark, desktop/mobile/landscape, next section visible, stable carousel height, no text overlap, catalog sorting.");
} finally {
  await browser.close();
  if (store) await db.query("update commerce_stores set settings=$2,enabled=$3,status=$4 where tenant_id=$1", [store.tenant_id, store.settings, store.enabled, store.status]);
  await db.end();
}
