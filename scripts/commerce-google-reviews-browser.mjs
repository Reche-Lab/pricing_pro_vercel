import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import pg from "pg";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL, base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: url }); await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const endpoint = `${base}/api/commerce/admin/google-reviews`, errors = [], secret = "local-fake-google-key-never-used-123";
const placeId = "ChIJtest123456789";
const data = { name: "Loja de teste local", rating: 4.7, total: 125, sourceUrl: `https://www.google.com/maps/search/?api=1&query=Test&query_place_id=${placeId}`, reviews: Array.from({ length: 5 }, (_, i) => ({ id: `local-review-${i}`, rating: i === 4 ? 3 : 5, text: i === 0 ? "Atendimento cuidadoso. Consegui preparar minha arte e acompanhar os detalhes do pedido. Tudo chegou conforme combinado. ".repeat(4) : "Uma experiência compartilhada para conferir a apresentação desta seção. Conteúdo fictício de teste, não uma avaliação real.", author: ["Marina Souza", "Ricardo Silva", "Ana Paula", "José Oliveira", "Cliente com nome bastante longo para testar o ajuste no cartão"][i], authorUrl: "https://www.google.com/maps/contrib/123", avatarUrl: "", sourceUrl: `https://www.google.com/maps/reviews/${i}`, publishTime: "2026-11-13T12:00:00Z", relativeTime: "hoje" })) };
let tenant, previous, usage;
try {
  tenant = (await db.query("select id from tenants where slug='ground-shop'")).rows[0].id;
  const actor = (await db.query("select id from app_users where email='commerce-admin@example.test'")).rows[0];
  previous = (await db.query("select * from commerce_google_review_connections where tenant_id=$1", [tenant])).rows[0];
  usage = (await db.query("select * from commerce_google_review_usage where tenant_id=$1", [tenant])).rows;
  await db.query("delete from commerce_google_review_connections where tenant_id=$1", [tenant]);
  await db.query("delete from commerce_google_review_usage where tenant_id=$1", [tenant]);
  const token = await new SignJWT({ userId: actor.id, tenantId: tenant, email: "commerce-admin@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  // Never call Google in browser tests. Only the provider-dependent test/read responses are mocked.
  // Save, authentication, encrypted storage, confirmation, activation and removal use the real local API.
  await context.route(endpoint, async route => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action !== "test") return route.continue();
    await db.query("update commerce_google_review_connections set tested_revision=revision,tested_at=now() where tenant_id=$1 and revision=$2", [tenant, body.revision]);
    const response = await context.request.get(endpoint);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ settings: (await response.json()).settings, preview: data, message: "Teste local simulado, sem chamadas ao Google." }) });
  });
  await context.route("**/google-reviews", route => {
    if (route.request().url() === endpoint || route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data }) });
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.get(endpoint)).status(), 401);
  assert.equal((await anonymous.request.get(`${base}/api/commerce/ground-shop/preview/google-reviews`)).status(), 401);
  await anonymous.close();
  await page.goto(`${base}/commerce`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Avaliações Google", exact: true }).click();
  await page.getByLabel("Place ID da empresa", { exact: true }).fill(placeId);
  await page.getByLabel("Chave da Places API (New)", { exact: true }).fill(secret);
  await page.getByLabel("Título da seção", { exact: true }).fill("Quem cria com a gente");
  await page.getByLabel(/Limite de consultas por dia/).fill("200");
  await page.getByRole("button", { name: "Salvar configuração", exact: true }).click();
  await page.getByText("Configuração salva. Teste a conexão e confirme o perfil antes de ativar.", { exact: true }).waitFor();
  const saved = await context.request.get(endpoint), responseText = await saved.text();
  assert.ok(!responseText.includes(secret));
  assert.equal(await page.getByLabel("Chave da Places API (New)", { exact: true }).inputValue(), "");
  const cipher = (await db.query("select api_key_encrypted from commerce_google_review_connections where tenant_id=$1", [tenant])).rows[0].api_key_encrypted;
  assert.ok(!cipher.includes(secret)); assert.ok(!responseText.includes(cipher));
  await page.getByRole("button", { name: "Testar conexão e visualizar" }).click();
  await page.getByText("Loja de teste local", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ativar avaliações na loja" }).isDisabled(), true);
  await page.getByRole("checkbox", { name: /Confirmo que o perfil/ }).check();
  await page.getByRole("button", { name: "Ativar avaliações na loja" }).click();
  await page.getByText("Seção ativa na loja e na prévia.", { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Settings overflow ${width}`);
    await page.screenshot({ path: `/tmp/google-reviews-admin-${width}.png`, fullPage: true });
  }
  for (const preview of [false, true]) for (const theme of ["light", "dark"]) for (const width of [1440, 390, 320]) {
    console.log(`Checking reviews: ${preview ? "preview" : "public"} ${theme} ${width}px`);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const prefix = preview ? "/commerce/ground-shop/preview" : "/loja/ground-shop";
    await page.goto(`${base}${prefix}`, { waitUntil: "networkidle" });
    await page.evaluate(theme => { localStorage.setItem("commerce-theme:ground-shop", theme); window.dispatchEvent(new Event("storage")); }, theme);
    await page.locator(`[data-theme="${theme}"]`).waitFor();
    const section = page.locator("[data-google-reviews]"); await section.scrollIntoViewIfNeeded();
    await section.getByText("Loja de teste local", { exact: true }).waitFor();
    assert.equal(await section.locator("article").count(), 5);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Store overflow ${width}/${theme}/${preview}`);
    const logo = section.locator("img[alt='Google Maps']:visible"); await logo.waitFor(); assert.equal(await logo.count(), 1);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-google-reviews] img[alt="Google Maps"]')).some(image => image instanceof HTMLImageElement && image.getBoundingClientRect().width > 0 && image.complete && image.naturalWidth > 0));
    assert.equal(await logo.evaluate(image => image.complete && image.naturalWidth > 0), true);
    assert.equal(await logo.evaluate(image => image.getBoundingClientRect().height), 18);
    await section.getByRole("button", { name: "Ler avaliação completa" }).first().click();
    await section.getByRole("button", { name: "Ler menos" }).waitFor();
    await section.screenshot({ path: `/tmp/google-reviews-${preview ? "preview" : "public"}-${theme}-${width}.png`, style: "header[class*='store_header'] { visibility: hidden !important; }" });
    const source = await section.getByRole("link", { name: "Sobre as avaliações e sua privacidade" }).getAttribute("href");
    assert.equal(source, `${prefix}/avaliacoes-google`);
  }
  await page.goto(`${base}/loja/ground-shop/avaliacoes-google`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Sobre as avaliações e sua privacidade", exact: true }).waitFor();
  assert.ok((await page.getByRole("link", { name: "Política de Privacidade do Google", exact: true }).getAttribute("href")).startsWith("https://policies.google.com/"));
  await page.goto(`${base}/commerce`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Avaliações Google", exact: true }).click();
  await page.getByRole("button", { name: "Remover credencial", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remover credencial Google" });
  assert.equal(await dialog.getByRole("button", { name: "Remover e desativar" }).isDisabled(), true);
  await dialog.getByLabel("Digite REMOVER para confirmar").fill("REMOVER");
  await dialog.getByRole("button", { name: "Remover e desativar" }).click(); await dialog.waitFor({ state: "hidden" });
  assert.equal((await db.query("select enabled from commerce_google_review_connections where tenant_id=$1", [tenant])).rows[0].enabled, false);
  assert.deepEqual(errors, []);
  console.log("Google reviews verified: encrypted configuration, test/confirmation/activation/removal, public/preview, light/dark, 1440/390/320px, source credits and policy page. Google content simulated; no live provider calls.");
} finally {
  if (tenant) {
    await db.query("delete from commerce_google_review_connections where tenant_id=$1", [tenant]);
    await db.query("delete from commerce_google_review_usage where tenant_id=$1", [tenant]);
    if (previous) { const keys = Object.keys(previous); await db.query(`insert into commerce_google_review_connections(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map(key => previous[key])); }
    for (const row of usage ?? []) await db.query("insert into commerce_google_review_usage(tenant_id,usage_day,request_count) values($1,$2,$3)", [row.tenant_id, row.usage_day, row.request_count]);
  }
  await browser.close(); await db.end();
}
