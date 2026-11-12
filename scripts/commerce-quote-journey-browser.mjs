import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL, base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: url }); await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const email = `quote-${randomUUID()}@example.test`, errors = [];
let store, originalProducts = [], sessionId, page;
try {
  store = (await db.query("select s.* from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug='ground-shop'")).rows[0];
  assert.ok(store, "Prepare the isolated commerce database first.");
  originalProducts = (await db.query("select * from commerce_products where tenant_id=$1", [store.tenant_id])).rows;
  assert.ok(originalProducts[0]);
  const product = originalProducts[0];
  await db.query(`update commerce_stores set enabled=true,status='published',settings=settings || '{"carrierEnabled":false,"deliveryEnabled":true,"deliveryCents":1200,"deliveryDescription":"Entrega local de teste","deliveryTransitDays":2}'::jsonb where tenant_id=$1`, [store.tenant_id]);
  await db.query("update commerce_products set active=false where tenant_id=$1", [store.tenant_id]);
  await db.query(`update commerce_products set active=true,snapshot=snapshot || $2::jsonb where id=$1`, [product.id, JSON.stringify({ personalized: true, imageUrl: `${base}/mockups/botton-25mm-v1/base-verso.png`, media: [], minQuantity: 1, maxQuantity: 1000, artworkOptions: { allowTeamPreparation: true, discountFixedCents: 500, maxDiscountPercent: 15 } })]);
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const image = await readFile(new URL("../public/mockups/botton-25mm-v1/base-verso.png", import.meta.url));
  await context.route("https://liaflow-calcula.vercel.app/**", route => route.fulfill({ contentType: "image/png", body: image }));
  await context.route("https://viacep.com.br/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ cep: "01001-000", logradouro: "Praça de teste", bairro: "Centro", localidade: "São Paulo", uf: "SP" }) }));
  const api = `${base}/api/store/ground-shop`, root = `${base}/loja/ground-shop`;
  // Simulate delivery of the email only. Code verification, cookie rotation and buyer isolation use the real API.
  await context.route(`${api}/auth`, async route => {
    const input = route.request().postDataJSON();
    if (input.action !== "request") return route.continue();
    const cookie = (await context.cookies()).find(cookie => cookie.name === `commerce_${store.tenant_id.replaceAll("-", "")}`);
    assert.ok(cookie);
    sessionId = (await db.query("select id from commerce_sessions where tenant_id=$1 and token_hash=$2", [store.tenant_id, createHash("sha256").update(cookie.value).digest("hex")])).rows[0].id;
    const id = randomUUID();
    await db.query("insert into commerce_login_challenges(id,tenant_id,session_id,email,name,code_hash) values($1,$2,$3,$4,$5,$6)", [id, store.tenant_id, sessionId, input.email, input.name, createHash("sha256").update(`${id}:123456`).digest("hex")]);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ challengeId: id }) });
  });
  page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  let saves = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url() === `${api}/quotes`) saves++; });
  await page.goto(root, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Solicitar orçamento", exact: true }).click();
  await page.getByRole("heading", { name: "Monte seu orçamento", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Receber código", exact: true }).count(), 0);
  await page.getByRole("link", { name: "Escolher produtos", exact: true }).click();
  await page.locator(`a[href$="/produto/${product.id}"]`).first().click();
  await page.getByRole("button", { name: "Adicionar ao orçamento", exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Adicionar ao orçamento", exact: true }).waitFor();
  await page.getByLabel("Quantidade de produtos", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Adicionar ao orçamento", exact: true }).click();
  await page.getByText("Produto adicionado ao orçamento", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Ver meu orçamento", exact: true }).click();
  await page.getByRole("link", { name: "Continuar para dados e entrega", exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 960 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { localStorage.setItem("commerce-theme:ground-shop", value); window.dispatchEvent(new Event("storage")); }, theme);
      await page.locator(`[data-theme="${theme}"]`).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overview fits at ${width}px`);
      const cta = await page.getByRole("link", { name: "Solicitar orçamento", exact: true }).boundingBox();
      assert.ok(cta && cta.x >= 0 && cta.x + cta.width <= width + 1, `Quote entry remains visible at ${width}px`);
      await page.screenshot({ path: `/tmp/commerce-quote-overview-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.getByRole("region", { name: "Desconto possível por arte pronta" }).waitFor();
  await page.getByRole("link", { name: "Continuar para dados e entrega", exact: true }).click();
  await page.getByRole("heading", { name: "Valide seu e-mail para salvar o orçamento", exact: true }).waitFor();
  await page.getByLabel("Seu nome", { exact: true }).fill("Cliente orçamento");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Receber código", exact: true }).click();
  await page.getByLabel("Código de acesso", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Validar e continuar orçamento", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Código inválido" }).waitFor();
  await page.getByLabel("Código de acesso", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Validar e continuar orçamento", exact: true }).click();
  await page.getByLabel("Nome completo / Razão social").fill("Cliente orçamento");
  await page.getByLabel("CPF/CNPJ para faturamento").fill("52998224725");
  await page.getByLabel("E-mail para faturamento").fill(email);
  await page.getByLabel("Telefone com DDD", { exact: true }).fill("11999990000");
  await page.getByLabel("CEP de faturamento", { exact: true }).fill("01001000");
  await page.getByLabel("Número", { exact: true }).fill("123");
  await page.locator('select[name="billing.state"]').selectOption("SP");
  await page.getByLabel(/Entrega ·/).check();
  await page.getByRole("checkbox", { name: "Incluir frete ou retirada neste orçamento" }).check();
  await page.getByText("Dados salvos. Você pode voltar ao carrinho sem perder o preenchimento.").waitFor();
  await page.goto(`${root}/orcamento`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Continuar para dados e entrega", exact: true }).click();
  await page.getByText("Dados recuperados com segurança.", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Número", { exact: true }).inputValue(), "123");
  await page.getByRole("checkbox", { name: "Incluir frete ou retirada neste orçamento" }).check();
  await page.getByRole("button", { name: "Revisar orçamento", exact: true }).click();
  await page.getByRole("heading", { name: "Confira antes de salvar seu orçamento", exact: true }).waitFor();
  assert.equal(saves, 0, "Review does not create a quote or order");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 960 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Review fits at ${width}px`);
    await page.screenshot({ path: `/tmp/commerce-quote-review-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Voltar aos dados e entrega", exact: true }).click();
  assert.equal(await page.getByLabel("Número", { exact: true }).inputValue(), "123");
  await page.getByRole("button", { name: "Revisar orçamento", exact: true }).click();
  await page.getByRole("button", { name: "Salvar orçamento e acessar PDF", exact: true }).click();
  await page.waitForURL(/\/orcamentos\/[a-f0-9-]+$/);
  const quoteId = new URL(page.url()).pathname.split("/").pop();
  const quote = (await db.query("select * from commerce_buyer_quotes where tenant_id=$1 and id=$2", [store.tenant_id, quoteId])).rows[0];
  assert.equal(quote.shipping_cents, 1200);
  assert.equal(quote.total_cents, quote.subtotal_cents + 1200, "Possible artwork benefit must not be deducted yet");
  assert.equal(quote.snapshot.artworkBenefits[0].percent, 15);
  assert.equal(quote.snapshot.artworkBenefits[0].limitPerArtworkCents, 500);
  const pdf = await context.request.get(`${api}/quotes/${quoteId}/pdf`);
  assert.equal(pdf.status(), 200); assert.ok((await PDFDocument.load(await pdf.body())).getPageCount() > 0);
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.get(`${api}/quotes/${quoteId}/pdf`)).status(), 401);
  assert.equal((await anonymous.request.get(`${api}/quotes/${quoteId}`)).status(), 401);
  await anonymous.close();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("region", { name: "Desconto possível por arte pronta" }).waitFor();
  await page.screenshot({ path: "/tmp/commerce-quote-saved-320.png", fullPage: true });
  await page.getByRole("checkbox", { name: /Substituir os itens atuais/ }).check();
  await page.getByRole("button", { name: "Continuar compra com estes produtos", exact: true }).click();
  await page.waitForURL(`${root}/carrinho`);
  await page.getByRole("heading", { name: "Seu carrinho", exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Etapas do seu orçamento" }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("Quote journey passed: anonymous product selection, persistent quote intent, email-code verification with invalid-code recovery, preserved cart/contact, review/edit/save, conditional capped benefit, local freight totals, private PDF, saved quote and explicit purchase conversion at 1440/390/320px. Email delivery only is stubbed; no external services used.");
} catch (error) {
  if (page && !page.isClosed()) { console.error("Quote journey failed at", page.url()); await page.screenshot({ path: "/tmp/commerce-quote-journey-failure.png", fullPage: true }).catch(() => {}); }
  throw error;
} finally {
  await browser.close();
  if (store) {
    const buyers = (await db.query("select id from commerce_customers where tenant_id=$1 and email=$2", [store.tenant_id, email])).rows.map(row => row.id);
    await db.query("delete from commerce_buyer_quotes where tenant_id=$1 and customer_id=any($2::uuid[])", [store.tenant_id, buyers]);
    if (sessionId) {
      await db.query("delete from commerce_login_challenges where tenant_id=$1 and session_id=$2", [store.tenant_id, sessionId]);
      await db.query("delete from commerce_sessions where tenant_id=$1 and id=$2", [store.tenant_id, sessionId]);
    }
    await db.query("delete from commerce_customers where tenant_id=$1 and email=$2", [store.tenant_id, email]);
    for (const product of originalProducts) await db.query("update commerce_products set snapshot=$2,active=$3 where id=$1", [product.id, JSON.stringify(product.snapshot), product.active]);
    await db.query("update commerce_stores set settings=$2,enabled=$3,status=$4 where tenant_id=$1", [store.tenant_id, JSON.stringify(store.settings), store.enabled, store.status]);
  }
  await db.end();
}
