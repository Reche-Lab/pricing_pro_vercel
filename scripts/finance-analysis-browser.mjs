import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FINANCE_PLAYWRIGHT_PATH || "playwright");
const url = process.env.FINANCE_TEST_DATABASE_URL;
const base = process.env.FINANCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("Isolated local environment required");
const db = new pg.Client({ connectionString: url });
await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.FINANCE_BROWSER_EXECUTABLE || undefined });
let tenant, actor;
try {
  tenant = (await db.query("insert into tenants(name,slug) values('Finanças teste',$1) returning id", [`analysis-${randomUUID()}`])).rows[0].id;
  actor = (await db.query("insert into app_users(email,name,password_hash,status,is_super_admin) values($1,'Teste','not-a-password','active',true) returning id", [`analysis-${randomUUID()}@example.test`])).rows[0].id;
  await db.query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenant, actor]);
  const token = await new SignJWT({ userId: actor, tenantId: tenant, email: "analysis@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("finance-local-test-secret-at-least-32-characters"));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const created = await context.request.post(`${base}/api/finance/accounts`, { data: { name: "Conta teste", accountType: "checking", institution: "nubank", currency: "BRL", ownershipType: "personal", sameEconomicEntity: true, requiredForMonthlyClose: true } });
  assert(created.ok(), await created.text());
  const account = (await created.json()).account.id;
  for (const [competence, rows] of [["2026-04", "25/04/2026,-25.00,a,Compra abril"], ["2026-05", "25/05/2026,150.00,b,Venda teste\n26/05/2026,-50.00,c,Compra teste"]]) {
    const imported = await context.request.post(`${base}/api/finance/imports`, { multipart: { accountId: account, competence, action: "import", file: { name: `${competence}.csv`, mimeType: "text/csv", buffer: Buffer.from(`Data,Valor,Identificador,Descrição\n${rows}`) } } });
    assert(imported.ok(), await imported.text());
  }
  await db.query(`update financial_transactions t set nature=case when amount_cents>0 then 'operating_revenue' else 'operating_expense' end,
    include_operating_result=true, category_id=(select c.id from financial_categories c where c.tenant_id=t.tenant_id and c.name=case when t.amount_cents>0 then 'Receitas operacionais' else 'Despesas operacionais' end limit 1) where t.tenant_id=$1`, [tenant]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/finance?competence=2026-05`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: /^Lançamentos \(/ }).click();
  const totals = page.locator('[aria-label="Totais dos lançamentos filtrados"]');
  assert((await totals.innerText()).includes("100,00"));
  await page.getByPlaceholder("Descrição, contraparte ou conta").fill("Venda");
  assert.equal((await totals.locator("dd").last().innerText()).replace(/\s/g, ""), "R$150,00");
  assert((await totals.innerText()).includes("1 lançamento(s)"));
  await page.getByPlaceholder("Descrição, contraparte ou conta").fill("inexistente");
  assert((await totals.innerText()).includes("0 lançamento(s)"));
  await page.getByPlaceholder("Descrição, contraparte ou conta").fill("");
  await page.getByRole("combobox").selectOption("operating_expense");
  assert.equal((await totals.locator("dd").last().innerText()).replace(/\s/g, ""), "-R$50,00");
  await page.getByRole("combobox").selectOption("");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Transactions overflow");
    await page.screenshot({ path: `/tmp/finance-totals-${width}.png` });
  }
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  await page.getByRole("img", { name: "Gráfico de evolução financeira" }).waitFor();
  await page.getByRole("button", { name: "3 meses" }).click();
  await page.getByRole("img", { name: "Gráfico de evolução financeira" }).waitFor();
  await page.getByRole("button", { name: "Por categoria", exact: true }).click();
  await page.getByLabel("Categoria da evolução").selectOption({ label: "Receitas operacionais" });
  await page.getByRole("heading", { name: "Receitas operacionais", exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Comparison overflow");
    await page.screenshot({ path: `/tmp/finance-categories-${width}.png` });
  }
  await page.getByRole("button", { name: "Por natureza", exact: true }).click();
  await page.getByLabel("Natureza da evolução").selectOption({ label: "Despesa operacional" });
  assert((await page.getByRole("table").innerText()).includes("75,00"));
  await page.getByLabel("Indicador da evolução").selectOption("externalOutflowsCents");
  await page.screenshot({ path: "/tmp/finance-natures-mobile.png" });
  assert.deepEqual(errors, []);
  console.log("Finance analysis browser passed: filters, totals, monthly categories/natures, zero months, desktop/mobile.");
} finally {
  await browser.close();
  if (tenant) { await db.query("delete from financial_transactions where tenant_id=$1", [tenant]); await db.query("delete from tenants where id=$1", [tenant]); }
  if (actor) await db.query("delete from app_users where id=$1", [actor]);
  await db.end();
}
