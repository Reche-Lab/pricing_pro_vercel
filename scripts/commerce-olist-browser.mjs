import { createRequire } from "node:module";
import { SignJWT } from "jose";
import pg from "pg";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const databaseUrl = process.env.COMMERCE_TEST_DATABASE_URL;
const base = process.env.COMMERCE_TEST_BASE_URL || "http://127.0.0.1:3011";
if (!databaseUrl || new URL(databaseUrl).hostname !== "127.0.0.1" || !new URL(databaseUrl).pathname.startsWith("/commerce_test_") || new URL(base).hostname !== "127.0.0.1") throw new Error("An isolated local test environment is required.");
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const { rows: [order] } = await db.query(`select o.id,o.tenant_id,u.id as user_id,u.email from commerce_orders o
    join commerce_olist_orders j on j.tenant_id=o.tenant_id and j.order_id=o.id
    join tenant_members tm on tm.tenant_id=o.tenant_id
    join app_users u on u.id=tm.user_id
    where o.payment_status='paid' and o.payment_environment='production' and o.deleted_at is null
      and j.invoice_id is null and j.status='waiting' and u.email like 'olist-%@example.test' limit 1`);
  if (!order) throw new Error("Run commerce-olist-database.test.ts in this database first.");
  await db.query("update commerce_orders set fulfillment_status='production' where id=$1 and tenant_id=$2", [order.id, order.tenant_id]);
  const token = await new SignJWT({ userId: order.user_id, tenantId: order.tenant_id, email: order.email, role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("commerce-local-test-secret-at-least-32-characters"));
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addCookies([{ name: "pricing_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  // All mutations are simulated: this review must not invoke ERP providers.
  await page.route("**/api/commerce/admin/orders/*/olist", async route => {
    if (route.request().method() === "POST") return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Confira a caixa antes de liberar o faturamento." }) });
    await route.continue();
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/commerce?tab=olist`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Pedidos da loja no Olist" }).waitFor();
    const inputs = await page.getByRole("combobox").first().boundingBox();
    if (!inputs || inputs.height < 43 || inputs.height > 46) throw new Error(`Unstable payment field at ${width}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Settings overflow at ${width}`);
    await page.screenshot({ path: `/tmp/commerce-olist-settings-${width}.png`, fullPage: true });
    await page.goto(`${base}/commerce/orders/${order.id}`, { waitUntil: "domcontentloaded" });
    const section = page.getByRole("region", { name: "Integração do pedido com Olist" });
    await section.waitFor(); await section.scrollIntoViewIfNeeded();
    if (!await page.getByRole("button", { name: "Aguardando liberação Olist", exact: true }).isDisabled()) throw new Error("Shipping must wait for fiscal release");
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Order overflow at ${width}`);
    await page.screenshot({ path: `/tmp/commerce-olist-order-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Concluir produção", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Concluir produção e liberar faturamento" });
    await dialog.waitFor();
    const bounds = await dialog.boundingBox();
    if (!bounds || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > width + 1 || bounds.y + bounds.height > 901) throw new Error(`Modal outside viewport at ${width}`);
    if (!await dialog.getByRole("button", { name: "Confirmar", exact: true }).isDisabled()) throw new Error("Reason must be required");
    await dialog.getByLabel("Observação").fill("Conferência sintética da produção");
    await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Confira a caixa" }).waitFor();
    await page.screenshot({ path: `/tmp/commerce-olist-modal-${width}.png` });
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Olist settings/order/modal passed at 1440/390/320px: fixed inputs, viewport modal, required reason, errors inside dialog, no overflow, no ERP requests.");
} finally { await browser.close(); await db.end(); }
