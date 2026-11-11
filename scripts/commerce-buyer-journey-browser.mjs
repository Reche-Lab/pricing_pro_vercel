import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { SignJWT } from "jose";
import pg from "pg";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL, base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("An isolated local environment is required.");
const db = new pg.Client({ connectionString: url }); await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const { rows: [fixture] } = await db.query(`select t.id as tenant_id,cp.id as product_id,u.id as user_id,u.email from tenants t
    join commerce_products cp on cp.tenant_id=t.id join tenant_members tm on tm.tenant_id=t.id join app_users u on u.id=tm.user_id
    where t.slug='ground-shop' and u.email='commerce-admin@example.test' limit 1`);
  assert.ok(fixture, "Run the commerce database suite first.");
  await db.query(`update commerce_stores set enabled=true,status='published',settings=settings || '{"carrierEnabled":false,"deliveryEnabled":true,"deliveryCents":1200,"deliveryDescription":"Entrega local de teste","deliveryTransitDays":2}'::jsonb where tenant_id=$1`, [fixture.tenant_id]);
  await db.query(`update commerce_products set active=true,snapshot=snapshot || '{"personalized":true,"maxArtworks":10}'::jsonb where tenant_id=$1`, [fixture.tenant_id]);
  const model = JSON.parse(await readFile(new URL("../public/mockups/botton-25mm-v1/modelo.json", import.meta.url), "utf8"));
  await db.query("update commerce_products set snapshot=jsonb_set(snapshot,'{artworkOptions}',$2::jsonb) where tenant_id=$1", [fixture.tenant_id, JSON.stringify({ allowTeamPreparation: false, discountFixedCents: 0, maxDiscountPercent: 10, mockup: model })]);
  const token = randomBytes(32).toString("base64url");
  const buyer = (await db.query("insert into commerce_customers(tenant_id,email,name) values($1,'browser-journey@example.test','Cliente navegador') on conflict(tenant_id,email) do update set name=excluded.name returning id", [fixture.tenant_id])).rows[0];
  await db.query(`insert into commerce_sessions(tenant_id,token_hash,customer_id,cart,revision) values($1,$2,$3,$4,1)`, [fixture.tenant_id, createHash("sha256").update(token).digest("hex"), buyer.id, JSON.stringify([{ id: crypto.randomUUID(), productId: fixture.product_id, quantity: 301, artworkName: "Arte a definir", artworkId: null }])]);
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 960 } });
  await context.addCookies([{ name: `commerce_${fixture.tenant_id.replaceAll("-", "")}`, value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const image = await sharp({ create: { width: 240, height: 200, channels: 4, background: "#0f766e" } }).png().toBuffer();
  await context.route("https://liaflow-calcula.vercel.app/**", route => route.fulfill({ contentType: "image/png", body: image }));
  await context.route("https://viacep.com.br/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ cep: "01001-000", logradouro: "Praça de teste", bairro: "Centro", localidade: "São Paulo", uf: "SP" }) }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const store = `${base}/loja/ground-shop`;
  await page.goto(`${store}/checkout`, { waitUntil: "networkidle" });
  await page.getByLabel("Nome completo / Razão social").fill("Cliente navegador");
  await page.getByLabel("CPF/CNPJ para faturamento").fill("52998224725");
  await page.getByLabel("E-mail para faturamento").fill("browser-journey@example.test");
  await page.getByLabel("Telefone com DDD", { exact: true }).fill("11999990000");
  await page.getByLabel("CEP de faturamento", { exact: true }).fill("01001000");
  await page.getByLabel("Número", { exact: true }).fill("123");
  await page.locator('select[name="billing.state"]').selectOption("SP");
  await page.getByLabel(/Entrega ·/).check();
  await page.getByText("Dados salvos. Você pode voltar ao carrinho sem perder o preenchimento.").waitFor();
  await page.goto(`${store}/carrinho`, { waitUntil: "networkidle" });
  await page.goto(`${store}/checkout`, { waitUntil: "networkidle" });
  await assert.equal(await page.getByLabel("Número", { exact: true }).inputValue(), "123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  await page.getByText("Vamos concluir suas artes?").waitFor();
  await page.getByRole("link", { name: /Botton personalizado.*Enviar arte/ }).click();
  await page.locator('[id^="item-"][class*="ring-2"]').waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(`${store}/orcamento`, { waitUntil: "networkidle" });
    await assert.equal(await page.getByLabel("Número", { exact: true }).inputValue(), "123");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Quote checkout overflow at ${width}`);
    await page.screenshot({ path: `/tmp/journey-quote-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Salvar orçamento e acessar PDF" }).click();
  await page.waitForURL(/\/orcamentos\/[a-f0-9-]+$/);
  const download = page.getByRole("link", { name: "Baixar orçamento PDF" }); await download.waitFor();
  const pdfResponse = await context.request.get(new URL(await download.getAttribute("href"), base).toString());
  assert.equal(pdfResponse.status(), 200); assert.match(pdfResponse.headers()["content-type"], /application\/pdf/);
  assert.ok((await PDFDocument.load(await pdfResponse.body())).getPageCount() > 0);
  await page.screenshot({ path: "/tmp/journey-saved-quote-320.png", fullPage: true });
  // Private preview exercises upload/crop/approval without Storage or real orders.
  const adminToken = await new SignJWT({ userId: fixture.user_id, tenantId: fixture.tenant_id, email: fixture.email, role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  await context.addCookies([{ name: "pricing_session", value: adminToken, url: base, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`${base}/commerce/ground-shop/preview/produto/${fixture.product_id}`, { waitUntil: "networkidle" });
  await page.getByLabel("Quantidade de produtos", { exact: true }).fill("5");
  await page.getByLabel("Quantidade de artes", { exact: true }).fill("10");
  await page.getByText(/Ajuste para até 5 artes/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).isDisabled(), true);
  await page.getByLabel("Quantidade de artes", { exact: true }).fill("1");
  await page.getByRole("button", { name: /Adicionar sua arte/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "arte-teste.png", mimeType: "image/png", buffer: image });
  await page.getByText("Centralizar e enquadrar arte").waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 }); await page.waitForTimeout(500);
    const cropBounds = await page.locator('svg[viewBox^="0 0 1000"]').boundingBox();
    assert.ok(cropBounds && cropBounds.x >= 0 && cropBounds.x + cropBounds.width <= width + 1, `Crop viewport must fit at ${width}px`);
    const canvases = page.locator('canvas[aria-label*="com a arte enquadrada"]');
    assert.equal(await canvases.count(), 2);
    for (const canvas of await canvases.all()) assert.equal(await canvas.evaluate(element => {
      const pixels = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    }), true, "Product simulation cannot be blank");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `/tmp/journey-framing-${width}.png` });
  }
  await page.getByRole("slider", { name: /^Zoom/ }).focus(); await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Revisar e aprovar" }).click();
  await page.getByAltText("Arte final para aprovação").waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Aprovar arte", exact: true }).click();
  await page.getByRole("alertdialog").waitFor();
  await page.screenshot({ path: "/tmp/journey-uncovered-320.png", fullPage: true });
  await page.getByRole("button", { name: "Retocar e completar o fundo" }).click();
  assert.deepEqual(errors, []);
  console.log("Buyer journey verified: saved checkout, pending artwork focus, private quote/PDF, artwork limit, live nonblank front/back and uncovered-art confirmation at 1440/390/320px.");
} finally { await browser.close(); await db.end(); }
