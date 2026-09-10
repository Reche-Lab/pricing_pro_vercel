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
  tenant = (await db.query("insert into tenants(name,slug) values('Finanças pessoais',$1) returning id", [`finance-browser-${randomUUID()}`])).rows[0].id;
  actor = (await db.query("insert into app_users(email,name,password_hash,status,is_super_admin) values($1,'Teste','not-a-password','active',true) returning id", [`finance-${randomUUID()}@example.test`])).rows[0].id;
  await db.query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenant, actor]);
  const token = await new SignJWT({ userId: actor, tenantId: tenant, email: "finance@example.test", role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("finance-local-test-secret-at-least-32-characters"));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/finance?competence=2026-05`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: /^Contas \(/ }).click();
  for (const [name, kind] of [["Conta pessoal", "checking"], ["Cartão pessoal", "credit_card"]]) {
    await page.getByRole("button", { name: "Nova conta", exact: true }).click();
    await page.getByLabel("Nome da conta", { exact: true }).fill(name);
    await page.getByLabel(/^Tipo de conta/).selectOption(kind);
    await page.getByLabel(/^Titularidade/).selectOption("personal");
    const saved = page.waitForResponse(r => r.url().endsWith("/api/finance/accounts") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Salvar conta e continuar" }).click();
    assert((await saved).ok());
    await page.getByRole("heading", { name, exact: true }).waitFor();
  }
  await page.getByRole("button", { name: "Importações", exact: true }).click();
  await page.getByLabel("Conta padrão para os novos arquivos").selectOption({ label: "Conta pessoal" });
  const csvs = [
    { name: "bank.csv", text: "Data,Valor,Identificador,Descrição\n27/05/2026,-20.01,test-payment,Pagamento de fatura" },
    { name: "Nubank_2026-05-28.csv", text: 'date,title,amount\n2026-04-25,Supermercado,"10,00"\n2026-04-25,Supermercado,"10,00"\n2026-04-28,Pagamento recebido,"- 5,00"' }
  ];
  for (const csv of csvs) {
    await page.locator('input[type="file"]').setInputFiles({ name: csv.name, mimeType: "text/csv", buffer: Buffer.from(csv.text) });
    const button = page.getByRole("button", { name: "Confirmar importação" });
    await button.waitFor();
    if (csv.name.includes("Nubank")) {
      assert.equal(await page.getByLabel("Confirme o vencimento da fatura").inputValue(), "2026-05-28");
      await page.screenshot({ path: "/tmp/finance-card-import.png" });
    }
    const imported = page.waitForResponse(r => r.url().endsWith("/api/finance/imports") && r.request().method() === "POST");
    await button.click();
    const response = await imported;
    assert(response.ok(), JSON.stringify(await response.json()));
    await button.waitFor({ state: "detached" });
  }
  await page.getByRole("button", { name: "Faturas", exact: true }).click();
  await page.getByText(/sugestão encontrada/).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const select = page.getByLabel("Lançamento bancário");
    const option = await select.locator("option").nth(1).getAttribute("value");
    await select.selectOption(option);
    await page.getByRole("button", { name: "Conferir vínculo" }).click();
    const modal = page.getByRole("dialog");
    await modal.waitFor();
    assert((await modal.innerText()).includes("0,01"));
    assert(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "Modal overflow");
    await page.screenshot({ path: `/tmp/finance-card-confirm-${width}.png` });
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))) console.log(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map(el => ({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,100),right:el.getBoundingClientRect().right}))), width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Page overflow");
    await modal.getByRole("button", { name: "Fechar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Conferir vínculo" }).click();
  await page.getByRole("button", { name: "Confirmar vínculo", exact: true }).click();
  await page.getByText(/Pago a mais:/).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Faturas", exact: true }).click();
  await page.getByText(/Pago a mais:/).waitFor();
  await page.getByRole("button", { name: "Desvincular pagamento" }).click();
  await page.getByRole("button", { name: "Confirmar desvinculação" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal((await db.query("select count(*) from credit_card_payments where tenant_id=$1", [tenant])).rows[0].count, "0");
  assert.deepEqual(errors, []);
  console.log("Finance cards: account creation, CSV upload, preview, matching, reload, unlink, desktop/mobile passed.");
} finally {
  await browser.close();
  if (tenant) {
    await db.query("delete from credit_card_payments where tenant_id=$1", [tenant]);
    await db.query("delete from financial_transactions where tenant_id=$1", [tenant]);
    await db.query("delete from tenants where id=$1", [tenant]);
  }
  if (actor) await db.query("delete from app_users where id=$1", [actor]);
  await db.end();
}
