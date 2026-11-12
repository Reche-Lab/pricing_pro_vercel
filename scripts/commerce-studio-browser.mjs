import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL, base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: url }); await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let store, originals = [];
const variants = [], errors = [];
try {
  store = (await db.query("select s.* from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug='ground-shop'")).rows[0];
  assert.ok(store, "Run the isolated commerce database suite first.");
  originals = (await db.query("select cp.*,v.product_id from commerce_products cp join product_variants v on v.id=cp.variant_id where cp.tenant_id=$1", [store.tenant_id])).rows;
  assert.ok(originals.length);
  const model = JSON.parse(await readFile(new URL("../public/mockups/botton-25mm-v1/modelo.json", import.meta.url), "utf8"));
  await db.query("update commerce_stores set enabled=true,status='published',settings=$2 where tenant_id=$1", [store.tenant_id, { ...store.settings, description: "Sua ideia, seu estilo. Produtos personalizados com as suas artes para encontros, marcas e momentos especiais.", bannerUrl: "", banners: [], experience: { style: "studio", motion: true, backgroundUrl: "" } }]);
  await db.query("update commerce_products set active=false where tenant_id=$1", [store.tenant_id]);
  for (const [category, name, folder] of [["Bottons", "Botton 2,5 cm", "botton-25mm-v1"], ["Espelhos", "Espelho 5,5 cm", "espelho-redondo-v1"], ["Ímãs", "Ímã 4,5 cm", "ima-redondo-v1"], ["Abridores", "Abridor 5,5 cm", "abridor-redondo-v1"]]) {
    const variant = (await db.query("insert into product_variants(tenant_id,product_id,name) values($1,$2,$3) returning id", [store.tenant_id, originals[0].product_id, `Studio fixture ${randomUUID()}`])).rows[0].id;
    variants.push(variant);
    const back = folder === "botton-25mm-v1" ? model.back : { ...model.back, baseUrl: `/mockups/${folder}/base-verso.png`, overlayUrl: "" };
    await db.query("insert into commerce_products(tenant_id,variant_id,active,snapshot) values($1,$2,true,$3)", [store.tenant_id, variant, { ...originals[0].snapshot, variantId: variant, name, category, imageUrl: `${base}/mockups/${folder}/base-verso.png`, media: [], personalized: true, geometry: { shape: "circle", widthMm: 25, heightMm: 25, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true }, margins: { safeMarginMm: 3, bleedMm: 3 }, artworkOptions: { allowTeamPreparation: false, discountFixedCents: 0, maxDiscountPercent: 10, mockup: { ...model, back } } }]);
  }
  const admin = (await db.query("select id from app_users where email='commerce-admin@example.test'")).rows[0];
  const token = await new SignJWT({ userId: admin.id, tenantId: store.tenant_id, email: "commerce-admin@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  const placeholder = await readFile(new URL("../public/mockups/botton-25mm-v1/base-verso.png", import.meta.url));
  const manifest = JSON.parse(await readFile(new URL("../.next/react-loadable-manifest.json", import.meta.url), "utf8"));
  const demoChunk = manifest["components/commerce/StoreHome.tsx -> ./StudioPersonalizer"].files.find(file => file.endsWith(".js"));
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ reducedMotion: "no-preference", hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
    await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
    await context.route("https://liaflow-calcula.vercel.app/**", route => route.fulfill({ body: placeholder, contentType: "image/png" }));
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const requested = []; page.on("request", request => requested.push(request.url()));
    for (const prefix of ["/loja/ground-shop", "/commerce/ground-shop/preview"]) {
      for (const [width, height] of mobile ? [[390, 844], [320, 640], [844, 390]] : [[1440, 960], [1920, 1080], [1280, 720]]) {
        await page.setViewportSize({ width, height });
        await page.goto(`${base}${prefix}`, { waitUntil: "networkidle" });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => { localStorage.setItem("commerce-theme:ground-shop", value); window.dispatchEvent(new Event("storage")); }, theme);
          await page.locator(`[data-theme="${theme}"]`).waitFor();
          await page.evaluate(() => scrollTo(0, 0));
          const hero = page.getByRole("region", { name: "Estúdio Ground Shop" });
          await hero.waitFor();
          assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
          for (const image of await hero.locator("img").all()) await image.evaluate(element => element.decode());
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow ${prefix} ${width} ${theme}`);
          const bounds = await hero.boundingBox(); assert.ok(bounds && bounds.width <= width + 1);
          for (const link of await hero.locator("a").all()) {
            if (!await link.isVisible()) continue;
            const box = await link.boundingBox();
            assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height + 1, `Hero link fits ${width}: ${await link.textContent()}`);
          }
          if (height > 700 || !prefix.includes("preview") && width === 320) {
            const next = await page.getByRole("region", { name: "Coleções" }).boundingBox();
            assert.ok(next.y < height, `Next section is visible ${width} ${height} ${prefix}: ${next.y}`);
          }
          assert.equal(await page.locator("canvas").count(), 0, "Mockup must not mount before interaction");
          if (prefix === "/loja/ground-shop" && width === (mobile ? 390 : 1440)) assert.equal(requested.some(url => url.includes("/studio/fonts/")), false, "Fonts must not download before opening the example");
          if (prefix === "/loja/ground-shop" && width === (mobile ? 390 : 1440)) assert.equal(requested.some(url => url.includes(demoChunk)), false, "Demo chunk must not download before the first click");
          assert.equal(await page.locator("main").evaluate(element => getComputedStyle(element).backgroundColor), theme === "dark" ? "rgb(19, 23, 21)" : "rgb(244, 245, 243)");
          await page.screenshot({ path: `/tmp/commerce-studio-${prefix.includes("preview") ? "preview" : "public"}-${width}-${theme}.png` });
          if (!mobile && width === 1440) {
            await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .7);
            await page.waitForTimeout(200);
            assert.ok(parseFloat(await hero.evaluate(element => element.style.getPropertyValue("--studio-x"))) > 0);
            const float = hero.locator("[data-studio-float]");
            const beforePause = await float.evaluate(element => element.getAnimations()[0].currentTime);
            await page.getByRole("button", { name: "Pausar movimento da vitrine" }).click();
            await page.waitForFunction(() => document.querySelector('[aria-label="Estúdio Ground Shop"]').dataset.moving === "false");
            assert.equal(await hero.getAttribute("data-moving"), "false");
            assert.equal(await float.evaluate(element => element.getAnimations()[0].playState), "paused");
            const pausedTime = await float.evaluate(element => element.getAnimations()[0].currentTime);
            assert.ok(pausedTime >= beforePause, "Pause preserves the animation phase");
            await page.waitForTimeout(100);
            assert.equal(await float.evaluate(element => element.getAnimations()[0].currentTime), pausedTime);
            await page.getByRole("button", { name: "Retomar movimento da vitrine" }).click();
            await page.waitForTimeout(120);
            assert.ok(await float.evaluate(element => element.getAnimations()[0].currentTime) >= pausedTime, "Resume does not restart the animation");
            const samples = await float.evaluate(element => new Promise(resolve => {
              const frames = [];
              function sample() {
                const rect = element.getBoundingClientRect(), image = element.querySelector("img");
                frames.push({ x: rect.x, y: rect.y, opacity: getComputedStyle(image).opacity, loaded: image.complete && image.naturalWidth > 0 });
                if (frames.length < 24) requestAnimationFrame(sample); else resolve(frames);
              }
              requestAnimationFrame(sample);
            }));
            for (let index = 1; index < samples.length; index++) {
              assert.ok(Math.hypot(samples[index].x - samples[index - 1].x, samples[index].y - samples[index - 1].y) < 3, "No frame-position cuts");
              assert.equal(samples[index].opacity, "1"); assert.equal(samples[index].loaded, true);
            }
          }
          if (mobile) assert.equal(await hero.getAttribute("data-moving"), "false");
          const selector = hero.getByRole("button", { name: "Mostrar Espelho 5,5 cm" }); await selector.click();
          await hero.getByRole("link", { name: "Personalizar Espelho 5,5 cm" }).waitFor();
        }
        if (width === 1440 || width === 390 || width === 320) {
          await page.getByRole("button", { name: "Ver como fica" }).click();
          const demo = page.getByRole("region", { name: "Experimente sua ideia" });
          const canvas = demo.locator('canvas[aria-label*="frente"]'), backCanvas = demo.locator('canvas[aria-label*="verso"]');
          await canvas.waitFor(); await backCanvas.waitFor(); assert.equal(await demo.locator("canvas").count(), 2);
          assert.ok(requested.some(url => url.includes(demoChunk)), "Demo imports its own chunk on interaction");
          await page.waitForFunction(() => document.querySelector('[aria-label="Estúdio Ground Shop"]').dataset.moving === "false");
          const pixels = async (target = canvas) => target.evaluate(element => {
            const bytes = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
            let filled = 0, signature = 0; for (let i = 0; i < bytes.length; i += 4) { if (bytes[i + 3]) filled++; signature = (signature + bytes[i] * (i % 97 + 1) + bytes[i + 1]) % 1000000007; }
            return { filled, signature, width: element.width };
          });
          await page.waitForFunction(() => { const canvases = [...document.querySelectorAll("canvas")]; return canvases.length === 2 && canvases.every(canvas => canvas.width === 256 && canvas.getContext("2d").getImageData(0, 0, 256, 256).data.some((value, index) => index % 4 === 3 && value > 0)); });
          const front = await pixels(); assert.ok(front.filled > 10000 && front.width === 256);
          const back = await pixels(backCanvas); assert.ok(back.filled > 10000); assert.notEqual(back.signature, front.signature);
          const change = async action => {
            const before = (await pixels()).signature; await action();
            for (let attempt = 0; attempt < 60 && (await pixels()).signature === before; attempt++) await page.waitForTimeout(100);
            assert.notEqual((await pixels()).signature, before, "The selected effect changes real canvas pixels");
          };
          await change(() => demo.getByLabel("Sua mensagem").fill("Minha marca faz parte dos melhores momentos da sua vida"));
          await demo.screenshot({ path: `/tmp/commerce-studio-lines-${prefix.includes("preview") ? "preview" : "public"}-${width}.png` });
          assert.equal(await demo.getByRole("status").filter({ hasText: "Encurte" }).count(), 0);
          await change(() => demo.getByRole("button", { name: "Texto circular", exact: true }).click());
          await demo.screenshot({ path: `/tmp/commerce-studio-circle-${prefix.includes("preview") ? "preview" : "public"}-${width}.png` });
          await change(() => demo.getByRole("button", { name: "Texto em espiral", exact: true }).click());
          await change(() => demo.getByLabel("Fonte", { exact: true }).selectOption("handwritten"));
          assert.ok(await page.evaluate(() => document.fonts.check('700 32px "Studio Handwritten"')));
          await change(() => demo.getByLabel("Fonte", { exact: true }).selectOption("editorial"));
          assert.ok(await page.evaluate(() => document.fonts.check('400 32px "Studio Editorial"')));
          await demo.getByRole("tab", { name: "Fundo", exact: true }).click();
          await demo.getByRole("button", { name: "Cor coral" }).click();
          for (const gradient of ["horizontal", "diagonal", "radial", "spiral"]) await change(() => demo.getByLabel("Formato do fundo").selectOption(gradient));
          const add = demo.getByRole("button", { name: "Adicionar cor ao fundo" });
          await add.click(); await add.click(); assert.equal(await add.isDisabled(), true);
          assert.equal(await demo.locator('input[aria-label^="Cor do fundo"]').count(), 4);
          await change(() => demo.getByLabel("Cor do fundo 4", { exact: true }).evaluate(element => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, "#8138b5");
            element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
          }));
          await demo.getByRole("tab", { name: "Texto", exact: true }).click();
          await demo.getByRole("combobox", { name: /^Produto/ }).selectOption({ label: "Espelho 5,5 cm" });
          await page.waitForTimeout(500); assert.ok((await pixels()).filled > 10000);
          for (const face of ["frente", "verso"]) {
            const zoom = demo.getByRole("button", { name: `Ampliar ${face} do produto`, exact: true });
            await zoom.click(); const dialog = page.getByRole("dialog"); await dialog.waitFor();
            await page.waitForFunction(() => document.querySelector('[role="dialog"] canvas')?.width === 640);
            assert.ok((await pixels(dialog.locator("canvas"))).filled > 10000, "Expanded canvas is nonblank at higher resolution");
            if (face === "frente") await dialog.getByRole("button", { name: "Fechar ampliação", exact: true }).click(); else await page.keyboard.press("Escape");
            await dialog.waitFor({ state: "hidden" });
            assert.equal(await zoom.evaluate(element => element === document.activeElement), true, "Zoom returns focus to its trigger");
          }
          await page.waitForTimeout(250);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          await demo.screenshot({ path: `/tmp/commerce-studio-demo-${prefix.includes("preview") ? "preview" : "public"}-${width}.png` });
          await page.goto(`${base}${prefix}/carrinho`, { waitUntil: "networkidle" });
          assert.equal(await page.locator('section[aria-label^="Estúdio"]').count(), 0);
          assert.equal(await page.locator("canvas").count(), 0);
          await page.getByRole("heading", { name: "Seu carrinho" }).waitFor();
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/loja/ground-shop`, { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("region", { name: "Estúdio Ground Shop" }).getAttribute("data-moving"), "false");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("Studio verified: public/private preview; light/dark; 320/390/844/1280/1440/1920px; 24 continuous motion frames; pause/resume phase; reduced-motion/touch; lazy model/fonts; simultaneous front/back pixels; multiline/circle/spiral lettering; both bundled fonts; all gradient modes and four colors; quiet cart; one H1; no overflow.");
} finally {
  await browser.close();
  if (variants.length) { await db.query("delete from commerce_products where variant_id=any($1::uuid[])", [variants]); await db.query("delete from product_variants where id=any($1::uuid[])", [variants]); }
  for (const product of originals) await db.query("update commerce_products set active=$2 where id=$1", [product.id, product.active]);
  if (store) await db.query("update commerce_stores set settings=$2,enabled=$3,status=$4 where tenant_id=$1", [store.tenant_id, store.settings, store.enabled, store.status]);
  await db.end();
}
