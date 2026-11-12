import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { SignJWT } from "jose";
import pg from "pg";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const introOnly = process.env.COMMERCE_STUDIO_INTRO_ONLY === "true";
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL, base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");

// Exercise the normal private Storage adapter without sending fixtures to a real Supabase project.
const objects = new Map();
const storage = createServer(async (req, res) => {
  if (req.headers.apikey !== "commerce-studio-test-key" || req.headers.authorization !== "Bearer commerce-studio-test-key" || !req.url?.startsWith("/storage/v1/object/artwork-production/")) { res.writeHead(403).end(); return; }
  try {
    if (req.method === "POST") {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new Error("Fixture too large"); chunks.push(chunk); }
      if (objects.size > 50) throw new Error("Too many test objects");
      objects.set(req.url, { bytes: Buffer.concat(chunks), type: req.headers["content-type"] });
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    } else if (req.method === "GET") {
      const item = objects.get(req.url);
      if (!item) res.writeHead(404).end();
      else res.writeHead(200, { "content-type": item.type }).end(item.bytes);
    } else if (req.method === "DELETE") { objects.delete(req.url); res.writeHead(200).end(); }
    else res.writeHead(405).end();
  } catch { res.writeHead(413).end(); }
});
await new Promise((resolve, reject) => { storage.once("error", reject); storage.listen(55440, "127.0.0.1", resolve); });
const db = new pg.Client({ connectionString: url }); await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let store, originals = [], variant, payment, customer;
const saved = [], sessions = [], orders = [], errors = [];
try {
  store = (await db.query("select s.* from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug='ground-shop'")).rows[0];
  assert.ok(store, "Run the isolated commerce database suite first.");
  originals = (await db.query("select cp.*,v.product_id from commerce_products cp join product_variants v on v.id=cp.variant_id where cp.tenant_id=$1", [store.tenant_id])).rows;
  const model = JSON.parse(await readFile(new URL("../public/mockups/botton-25mm-v1/modelo.json", import.meta.url), "utf8"));
  await db.query("update commerce_stores set enabled=true,status='published',settings=$2 where tenant_id=$1", [store.tenant_id, { ...store.settings, bannerUrl: "", banners: [], pickupEnabled: true, pickupAddress: "Local de teste", experience: { style: "studio", motion: false, backgroundUrl: "" } }]);
  payment = (await db.query("select manual_enabled,payment_environment from commerce_payment_connections where tenant_id=$1", [store.tenant_id])).rows[0];
  await db.query("insert into commerce_payment_connections(tenant_id,manual_enabled,payment_environment) values($1,true,'production') on conflict(tenant_id) do update set manual_enabled=true,payment_environment='production'", [store.tenant_id]);
  await db.query("update commerce_products set active=false where tenant_id=$1", [store.tenant_id]);
  variant = (await db.query("insert into product_variants(tenant_id,product_id,name) values($1,$2,$3) returning id", [store.tenant_id, originals[0].product_id, `Studio purchase fixture ${randomUUID()}`])).rows[0].id;
  const product = (await db.query("insert into commerce_products(tenant_id,variant_id,active,snapshot) values($1,$2,true,$3) returning id", [store.tenant_id, variant, {
    ...originals[0].snapshot, variantId: variant, name: "Botton Estúdio", category: "Bottons", minQuantity: 1,
    imageUrl: `${base}/mockups/botton-25mm-v1/base-verso.png`, media: [], personalized: true,
    geometry: { shape: "circle", widthMm: 53, heightMm: 53, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true },
    margins: { safeMarginMm: 1.5, bleedMm: 2 },
    artworkOptions: { allowTeamPreparation: false, discountFixedCents: 0, maxDiscountPercent: 10, mockup: model },
  }])).rows[0].id;
  const admin = (await db.query("select id from app_users where email='commerce-admin@example.test'")).rows[0];
  const token = await new SignJWT({ userId: admin.id, tenantId: store.tenant_id, email: "commerce-admin@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  const fixture = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#e96982" } }).composite([{ input: await sharp({ create: { width: 400, height: 400, channels: 3, background: "#427db5" } }).png().toBuffer(), left: 400, top: 0 }]).png().toBuffer();
  const changeInput = (locator, value) => locator.evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  for (const preview of [false, true]) for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: introOnly ? "no-preference" : "reduce" });
    await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const writes = []; page.on("request", request => { if (request.method() !== "GET" && /artworks|orders|payments/.test(request.url())) writes.push(request.url()); });
    const prefix = preview ? "/commerce/ground-shop/preview" : "/loja/ground-shop";
    const before = objects.size;
    await page.goto(`${base}${prefix}`, { waitUntil: "networkidle" });
    if (width === 390) {
      await page.evaluate(() => { localStorage.setItem("commerce-theme:ground-shop", "dark"); window.dispatchEvent(new Event("storage")); });
      await page.locator('[data-theme="dark"]').waitFor();
    }
    await page.getByRole("button", { name: "Ver como fica" }).click();
    const demo = page.getByRole("region", { name: "Experimente sua ideia" });
    if (introOnly) {
      let previous = null;
      for (let step = 0; step < 5; step++) {
        await demo.locator(`[data-studio-demo-stage="${step}"]`).waitFor();
        await page.waitForFunction(() => document.querySelector("[data-studio-demo-stage]")?.closest("[aria-busy]")?.getAttribute("aria-busy") === "false");
        await page.waitForFunction(prior => {
          const canvas = document.querySelector('canvas[aria-label*="frente"]');
          if (!canvas) return false;
          const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let signature = 0, filled = 0;
          for (let i = 0; i < bytes.length; i += 4) { if (bytes[i + 3]) filled++; signature = (signature + bytes[i] * (i % 97 + 1) + bytes[i + 1]) % 1000000007; }
          return filled > 1000 && signature !== prior;
        }, previous);
        previous = await demo.locator('canvas[aria-label*="frente"]').evaluate(canvas => {
          const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let signature = 0; for (let i = 0; i < bytes.length; i += 4) signature = (signature + bytes[i] * (i % 97 + 1) + bytes[i + 1]) % 1000000007;
          return signature;
        });
        assert.equal(await demo.getByRole("button", { name: "Usar esta arte no produto" }).isDisabled(), true);
        if (step === 1) assert.equal(await demo.getByRole("button", { name: "Texto circular" }).getAttribute("aria-pressed"), "true");
        if (step === 2) assert.equal(await demo.getByRole("button", { name: "Texto em espiral" }).getAttribute("aria-pressed"), "true");
        if (step === 3) assert.equal(await demo.locator('input[aria-label^="Cor do fundo"]').count(), 3);
        if (step === 4) assert.equal(await demo.getByLabel("Formato do fundo").inputValue(), "spiral");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.screenshot({ path: `/tmp/studio-intro-${preview ? "preview" : "public"}-${width}-${step}.png` });
      }
      await demo.getByText("Agora crie você mesmo a sua arte.").waitFor();
      await page.screenshot({ path: `/tmp/studio-intro-${preview ? "preview" : "public"}-${width}-complete.png` });
      assert.equal(await demo.getByRole("status").filter({ hasText: "Encurte" }).count(), 0);
      await demo.getByRole("button", { name: "Criar minha arte", exact: true }).click();
      assert.equal(await demo.getByLabel("Sua mensagem").evaluate(element => element === document.activeElement && element.selectionEnd === element.value.length), true);
      await demo.getByLabel("Sua mensagem").fill("Minha criação, meu estilo");
      await page.waitForTimeout(2200);
      assert.equal(await demo.getByLabel("Sua mensagem").inputValue(), "Minha criação, meu estilo");
      assert.deepEqual(writes, []); assert.equal(objects.size, before);
      if (width !== 390) {
        await page.goto(`${base}${prefix}`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Ver como fica" }).click();
        if (width === 320) {
          await demo.getByLabel("Sua mensagem").fill("Quero começar agora");
          await page.waitForTimeout(2200);
          assert.equal(await demo.getByLabel("Sua mensagem").inputValue(), "Quero começar agora");
          assert.equal(await demo.locator("[data-studio-demo-stage]").count(), 0);
        } else {
          await demo.getByRole("button", { name: "Pular demonstração" }).click();
          assert.equal(await demo.getByLabel("Sua mensagem").inputValue(), "Sua ideia\nganha forma");
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.goto(`${base}${prefix}`, { waitUntil: "networkidle" });
          await page.getByRole("button", { name: "Ver como fica" }).click();
          await demo.getByText("Agora crie você mesmo a sua arte.").waitFor();
          assert.equal(await demo.getByLabel("Sua mensagem").inputValue(), "Sua ideia\nganha forma");
        }
      }
      await context.close(); continue;
    }
    await demo.getByRole("checkbox", { name: "Incluir texto sobre o fundo" }).uncheck();
    await demo.getByRole("tab", { name: "Fundo", exact: true }).click();
    await demo.getByRole("button", { name: "Imagem", exact: true }).click();
    await demo.getByLabel("Enviar imagem de fundo").setInputFiles({ name: "fundo.png", mimeType: "image/png", buffer: fixture });
    await demo.getByAltText("Imagem de fundo escolhida").waitFor();
    await changeInput(demo.getByLabel("Tamanho da imagem", { exact: true }), ".45");
    await changeInput(demo.getByLabel("Deslocamento horizontal", { exact: true }), ".15");
    await changeInput(demo.getByLabel("Deslocamento vertical", { exact: true }), "-.1");
    await changeInput(demo.getByLabel("Cor nas áreas descobertas", { exact: true }), "#123456");
    const use = demo.getByRole("button", { name: "Usar esta arte no produto", exact: true });
    await use.waitFor(); await page.waitForTimeout(600);
    assert.equal(objects.size, before, "Editing stays local until continuing");
    await page.screenshot({ path: `/tmp/studio-buy-page-${preview ? "preview" : "public"}-${width}.png` });
    const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 8).map(el => ({ tag: el.tagName, className: el.className, label: el.getAttribute("aria-label"), right: el.getBoundingClientRect().right })));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Studio overflow ${width}: ${JSON.stringify(overflow)}`);
    assert.equal(await demo.locator("canvas").count(), 2);
    for (const canvas of await demo.locator("canvas").all()) {
      assert.ok(await canvas.evaluate(element => { const pixels = element.getContext("2d").getImageData(0, 0, element.width, element.height).data; return pixels.some((value, index) => index % 4 === 3 && value > 0); }), "Both product faces render");
    }
    await demo.screenshot({ path: `/tmp/studio-buy-${preview ? "preview" : "public"}-${width}.png` });
    await use.click();
    await page.waitForURL(/arteEstudio=/);
    await page.getByText("Sua arte do Estúdio já está anexada. Revise e aprove antes de concluir a compra.").waitFor();
    const id = new URL(page.url()).searchParams.get("arteEstudio");
    if (!preview) {
      saved.push(id);
      const art = (await db.query("select * from commerce_artworks where id=$1", [id])).rows[0];
      sessions.push(art.session_id);
      assert.equal(art.tenant_id, store.tenant_id); assert.equal(art.product_id, product); assert.equal(art.approved_at, null);
      assert.ok(art.prepared_path && art.crop.geometryHash, "Saved, prepared, but not auto-approved");
      const key = `/storage/v1/object/artwork-production/${art.storage_path}`;
      const original = objects.get(key); assert.ok(original);
      const metadata = await sharp(original.bytes).metadata(); assert.equal(metadata.width, 709); assert.equal(metadata.height, 709);
      const { data } = await sharp(original.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.ok(data.some((value, i) => i % 3 === 0 && Math.abs(value - 18) < 5 && Math.abs(data[i + 1] - 52) < 5 && Math.abs(data[i + 2] - 86) < 5), "Uncovered background color survives saving");
      assert.ok(data.some((value, i) => i % 3 === 0 && Math.abs(value - 233) < 5 && Math.abs(data[i + 1] - 105) < 5 && Math.abs(data[i + 2] - 130) < 5), "Left side of image survives saving");
      assert.ok(data.some((value, i) => i % 3 === 0 && Math.abs(value - 66) < 5 && Math.abs(data[i + 1] - 125) < 5 && Math.abs(data[i + 2] - 181) < 5), "Right side of image survives saving");
      await page.reload({ waitUntil: "networkidle" });
      await page.getByText("Sua arte do Estúdio já está anexada. Revise e aprove antes de concluir a compra.").waitFor();
      const outsider = await browser.newContext();
      await outsider.request.get(`${base}/api/store/ground-shop/cart`);
      const inaccessible = await outsider.request.get(`${base}/api/store/ground-shop/artworks/${id}`);
      assert.equal(inaccessible.status(), 404, "Another buyer cannot access this artwork");
      await outsider.close();
    } else {
      assert.equal(objects.size, before, "Preview never touches real Storage");
      assert.equal((await db.query("select id from commerce_artworks where id::text=$1", [id])).rowCount, 0, "Preview creates no artwork rows");
    }
    await page.getByRole("textbox", { name: "Quantidade de produtos", exact: true }).fill("5");
    await page.getByRole("button", { name: "Aprovar arte", exact: true }).click();
    await page.getByAltText("Arte final para aprovação").waitFor();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Aprovar arte", exact: true }).click();
    await page.getByRole("button", { name: "Concluir", exact: true }).click();
    await page.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
    await page.getByRole("link", { name: "Ver carrinho", exact: true }).last().click();
    await page.getByRole("heading", { name: "Seu carrinho", exact: true }).waitFor();
    await page.getByText("Arte do Estúdio", { exact: true }).first().waitFor();
    if (!preview) {
      const cart = await (await context.request.get(`${base}/api/store/ground-shop/cart`)).json();
      assert.equal(cart.lines[0].artworkId, id); assert.equal(cart.lines[0].quantity, 5);
      assert.equal(cart.lines[0].preparation, "customer");
      assert.ok((await db.query("select approved_at from commerce_artworks where id=$1", [id])).rows[0].approved_at);
      if (width === 1440) {
        customer = (await db.query("insert into commerce_customers(tenant_id,email,name) values($1,$2,'Studio test buyer') returning id", [store.tenant_id, `studio-${randomUUID()}@example.test`])).rows[0].id;
        await db.query("update commerce_sessions set customer_id=$2 where id=$1", [sessions.at(-1), customer]);
        const checkout = await context.request.post(`${base}/api/store/ground-shop/orders`, { headers: { origin: base }, data: {
          revision: cart.revision, expectedTotalCents: cart.calculation.totalCents, delivery: "pickup", address: null,
          billing: { name: "Cliente de teste", email: "fiscal@example.test", phone: "11999990000", document: "52998224725", postalCode: "01001000", street: "Praça de teste", number: "100", complement: "", district: "Centro", city: "São Paulo", state: "SP" },
          deliveryAddressSameAsBilling: true, provider: "manual", acceptedTerms: true,
        } });
        const result = await checkout.json(); assert.equal(checkout.status(), 201, JSON.stringify(result));
        orders.push(result.id);
        const proof = (await db.query("select * from commerce_artwork_proofs where order_id=$1", [result.id])).rows[0];
        assert.equal(proof.artwork_id, id); assert.ok(proof.approved_at && proof.prepared_path, "The actual order keeps its approved production proof");
        assert.equal((await db.query("select payment_status from commerce_orders where id=$1", [result.id])).rows[0].payment_status, "pending");
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Cart overflow ${width}`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(introOnly ? "Studio intro verified: five automatic stages with distinct real canvas pixels; circle, spiral, three colors and spiral background; final invitation, focus, skip, interruption and reduced motion; public/preview at 320/390/1440px, light/dark; no artwork/order/payment writes or overflow." : "Studio purchase verified: upload, resize, offsets, fill, front/back pixels, exact 300-dpi cut dimensions, private storage and session isolation, reload, explicit approval, cart and real local checkout with approved proof (no charge); public/preview at 320/390/1440px, light/dark; preview stays ephemeral; no overflow.");
} finally {
  await browser.close();
  if (orders.length) { await db.query("delete from commerce_order_events where order_id=any($1::uuid[])", [orders]); await db.query("delete from commerce_orders where id=any($1::uuid[])", [orders]); }
  if (variant) {
    const artifacts = (await db.query("select a.id,a.session_id from commerce_artworks a join commerce_products p on p.id=a.product_id where p.variant_id=$1", [variant])).rows;
    for (const art of artifacts) { if (!saved.includes(art.id)) saved.push(art.id); if (!sessions.includes(art.session_id)) sessions.push(art.session_id); }
  }
  if (saved.length) await db.query("delete from commerce_artworks where id=any($1::uuid[])", [saved]);
  if (sessions.length) await db.query("delete from commerce_sessions where id=any($1::uuid[])", [sessions]);
  if (customer) await db.query("delete from commerce_customers where id=$1", [customer]);
  if (variant) { await db.query("delete from commerce_products where variant_id=$1", [variant]); await db.query("delete from product_variants where id=$1", [variant]); }
  for (const product of originals) await db.query("update commerce_products set active=$2 where id=$1", [product.id, product.active]);
  if (store) await db.query("update commerce_stores set settings=$2,enabled=$3,status=$4 where tenant_id=$1", [store.tenant_id, store.settings, store.enabled, store.status]);
  if (store && payment) await db.query("update commerce_payment_connections set manual_enabled=$2,payment_environment=$3 where tenant_id=$1", [store.tenant_id, payment.manual_enabled, payment.payment_environment]);
  else if (store) await db.query("delete from commerce_payment_connections where tenant_id=$1", [store.tenant_id]);
  await db.end();
  await new Promise(resolve => storage.close(resolve));
}
