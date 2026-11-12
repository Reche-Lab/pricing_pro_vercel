import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import pg from "pg";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.COMMERCE_TEST_DATABASE_URL, base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local test environment required.");
const db = new pg.Client({ connectionString: url }); await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const hostname = `browser-${randomUUID()}.example.com`, errors = [];
let tenant, actor, previousEmail, page;
try {
  tenant = (await db.query("select id from tenants where slug='ground-shop'")).rows[0].id;
  actor = (await db.query("select id,is_super_admin from app_users where email='commerce-admin@example.test'")).rows[0];
  previousEmail = (await db.query("select * from commerce_email_connections where tenant_id=$1", [tenant])).rows[0];
  await db.query("delete from commerce_email_connections where tenant_id=$1", [tenant]);
  const token = await new SignJWT({ userId: actor.id, tenantId: tenant, email: "commerce-admin@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  assert.equal((await context.request.get(`${base}/api/superadmin/commerce-domains`)).status(), actor.is_super_admin ? 200 : 403);
  await db.query("update app_users set is_super_admin=true where id=$1", [actor.id]);
  async function fakeDns(id) {
    const row = (await db.query("select * from commerce_domain_requests where id=$1 and tenant_id=$2", [id, tenant])).rows[0];
    assert.ok(row);
    const check = { checkedAt: new Date().toISOString(), ownership: true, ownershipFound: [`pricing-pro=${row.verification_token}`], records: row.expected_records.map(record => ({ ...record, matched: true, found: [record.value] })) };
    await db.query("update commerce_domain_requests set last_check=$2 where id=$1", [id, JSON.stringify(check)]);
    const response = await context.request.get(`${base}/api/commerce/admin/domains`);
    return (await response.json()).domains.find(row => row.id === id);
  }
  // DNS and actual SMTP delivery are mocked; permissions, configuration, encryption and activation use the real local API.
  await context.route("**/api/commerce/admin/domains/*/check", async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ domain: await fakeDns(id) }) });
  });
  await context.route(`${base}/api/superadmin/commerce-domains`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const input = route.request().postDataJSON();
    if (input.action !== "check") return route.continue();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ domain: await fakeDns(input.id), message: "Consulta DNS local simulada." }) });
  });
  await context.route(`${base}/api/commerce/admin/email`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const input = route.request().postDataJSON();
    if (input.action !== "test") return route.continue();
    await db.query("update commerce_email_connections set tested_at=now(),tested_revision=revision where tenant_id=$1 and revision=$2", [tenant, input.revision]);
    const state = await context.request.get(`${base}/api/commerce/admin/email`);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ settings: (await state.json()).settings, message: "Teste aceito pelo SMTP fictício. Nenhum e-mail real enviado." }) });
  });
  page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/commerce`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Domínio e DNS", exact: true }).click();
  await page.getByLabel("Domínio desejado", { exact: true }).fill(hostname);
  await page.getByLabel("Provedor DNS (opcional)", { exact: true }).fill("Registro.br");
  await page.getByRole("button", { name: "Solicitar configuração do domínio", exact: true }).click();
  await page.getByText("Solicitação registrada. O DNS e o domínio ainda não foram alterados.", { exact: true }).waitFor();
  const domain = (await db.query("select id from commerce_domain_requests where tenant_id=$1 and hostname=$2", [tenant, hostname])).rows[0];
  assert.equal((await db.query("select count(*)::int as count from commerce_domain_requests where tenant_id=$1 and hostname=any($2::text[])", [tenant, [hostname, `www.${hostname}`]])).rows[0].count, 2);
  await page.goto(`${base}/superadmin`, { waitUntil: "networkidle" });
  await page.locator("summary").filter({ hasText: "Domínios das lojas e DNS" }).click();
  const article = page.locator("article").filter({ has: page.getByText(hostname, { exact: true }) });
  await article.locator("summary").click();
  assert.equal(await article.getByRole("button", { name: "Autorizar domínio no painel", exact: true }).isDisabled(), true);
  await article.getByRole("button", { name: "Adicionar registro esperado", exact: true }).click();
  await article.getByLabel("Nome", { exact: true }).fill("@");
  await article.getByLabel("Valor", { exact: true }).fill("8.8.8.8");
  await article.getByRole("checkbox", { name: /Confirmei que este hostname/ }).check();
  await article.getByRole("checkbox", { name: /Conferi na Vercel/ }).check();
  await article.getByRole("button", { name: "Salvar registros e confirmações", exact: true }).click();
  await article.getByText("Registros salvos. Consulte o DNS novamente antes de autorizar.", { exact: true }).waitFor();
  await article.getByRole("button", { name: "Verificar DNS agora", exact: true }).click();
  await article.getByText("Consulta DNS local simulada.", { exact: true }).waitFor();
  await article.getByRole("button", { name: "Autorizar domínio no painel", exact: true }).click();
  await article.getByText("Autorização registrada. Configure COMMERCE_CUSTOM_DOMAINS no deploy para ativar o vínculo.", { exact: true }).waitFor();
  assert.ok((await db.query("select approved_at from commerce_domain_requests where id=$1", [domain.id])).rows[0].approved_at);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Operator DNS fits ${width}px`);
    await page.screenshot({ path: `/tmp/commerce-domain-operator-${width}.png`, fullPage: true });
  }
  await page.goto(`${base}/commerce`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Domínio e DNS", exact: true }).click();
  await page.locator("summary").filter({ hasText: new RegExp(`^${hostname.replaceAll(".", "\\.")}`) }).click();
  await page.getByText("Autorizado no painel. Aguardando a administração configurar o vínculo no deploy da Vercel.", { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Tenant DNS fits ${width}px`);
    await page.screenshot({ path: `/tmp/commerce-domain-tenant-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "E-mail da empresa", exact: true }).click();
  await page.getByLabel("Servidor SMTP", { exact: true }).fill("smtp.gmail.com");
  await page.getByLabel("Usuário SMTP", { exact: true }).fill("loja@example.com");
  await page.getByLabel("Senha SMTP / senha de aplicativo", { exact: true }).fill("test-only-password-do-not-use");
  await page.getByLabel("Nome do remetente", { exact: true }).fill("Ground Shop");
  await page.getByLabel("E-mail do remetente", { exact: true }).fill("loja@example.com");
  await page.getByRole("button", { name: "Salvar configuração SMTP", exact: true }).click();
  await page.getByText("Configuração salva e desativada. Envie um teste antes de ativar.", { exact: true }).waitFor();
  let state = await context.request.get(`${base}/api/commerce/admin/email`);
  assert.ok(!(await state.text()).includes("test-only-password-do-not-use"));
  const cipher = (await db.query("select password_encrypted from commerce_email_connections where tenant_id=$1", [tenant])).rows[0].password_encrypted;
  assert.ok(!cipher.includes("test-only-password-do-not-use"));
  await page.getByRole("button", { name: "Enviar teste para meu e-mail", exact: true }).click();
  await page.getByRole("checkbox", { name: /Recebi o e-mail de teste/ }).check();
  await page.getByRole("button", { name: "Ativar e-mail da empresa", exact: true }).click();
  await page.getByText("Os códigos de acesso da loja serão enviados pelo e-mail da empresa.", { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Tenant email fits ${width}px`);
    for (const input of await page.locator('input:not([type="checkbox"])').all()) {
      const bounds = await input.boundingBox();
      if (bounds) assert.ok(bounds.height < 100 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, "Inputs remain compact and bounded");
    }
    await page.screenshot({ path: `/tmp/commerce-email-tenant-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Nome do remetente", { exact: true }).fill("Ground Shop atendimento");
  assert.equal(await page.getByRole("button", { name: "Enviar teste para meu e-mail", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Salvar e desativar para novo teste", exact: true }).click();
  await page.getByText("Configuração salva e desativada. Envie um teste antes de ativar.", { exact: true }).waitFor();
  state = await context.request.get(`${base}/api/commerce/admin/email`); assert.equal((await state.json()).settings.enabled, false);
  assert.equal((await db.query("select password_encrypted from commerce_email_connections where tenant_id=$1", [tenant])).rows[0].password_encrypted, cipher);
  assert.deepEqual(errors, []);
  console.log("Domain/email browser passed: owner cannot access global domains, root/www request, operator configuration, pending gates, explicit approval/deploy distinction, encrypted SMTP save, simulated delivery, activation and blank-password preservation at 1440/390/320px. DNS lookup and SMTP delivery only are stubbed; no real provider changes.");
} catch (error) {
  if (page && !page.isClosed()) { console.error("Setup browser failed at", page.url()); await page.screenshot({ path: "/tmp/commerce-domain-email-failure.png", fullPage: true }).catch(() => {}); }
  throw error;
} finally {
  await browser.close();
  if (tenant) {
    await db.query("delete from commerce_domain_requests where tenant_id=$1 and hostname=any($2::text[])", [tenant, [hostname, `www.${hostname}`]]);
    await db.query("delete from commerce_email_connections where tenant_id=$1", [tenant]);
    if (previousEmail) await db.query(`insert into commerce_email_connections(tenant_id,host,port,username,from_email,from_name,reply_to,password_encrypted,enabled,revision,tested_revision,tested_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [tenant, previousEmail.host, previousEmail.port, previousEmail.username, previousEmail.from_email, previousEmail.from_name, previousEmail.reply_to, previousEmail.password_encrypted, previousEmail.enabled, previousEmail.revision, previousEmail.tested_revision, previousEmail.tested_at, previousEmail.updated_at]);
  }
  if (actor) await db.query("update app_users set is_super_admin=$2 where id=$1", [actor.id, actor.is_super_admin]);
  await db.end();
}
