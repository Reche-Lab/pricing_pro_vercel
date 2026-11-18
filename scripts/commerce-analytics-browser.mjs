import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
const require = createRequire(import.meta.url), { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url)), output = "/tmp/commerce-analytics-browser";
await mkdir(output, { recursive: true });
const fixtures = await build({ stdin: { contents: "export * from './src/tests/fixtures/commerce-analytics';", resolveDir: root, loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", alias: { "@": resolve(root, "src") } });
const { analyticsFixtureReport: report, analyticsFixtureSettings } = await import(`data:text/javascript;base64,${Buffer.from(fixtures.outputFiles[0].contents).toString("base64")}`);
report.daily = Array.from({ length: 30 }, (_, index) => ({ day: new Date(Date.UTC(2026, 9, 20 + index)).toISOString().slice(0, 10), orders: index > 26 ? [5, 8, 2][index - 27] : 0, paidCents: index > 26 ? [45000, 70000, 8450][index - 27] : 0, quotes: index > 26 ? [3, 7, 2][index - 27] : 0 }));
let config = { ...analyticsFixtureSettings, enabled: true, measurementId: "G-ABC1234567", privacyReviewed: true };
const products = [{ id: "00000000-0000-4000-8000-000000000001", slug: "botton-3-5-cm", name: "Botton - 3,5 cm", description: "Personalizado", category: "Bottons", imageUrl: "/mockups/botton-25mm-v1/base-verso.png", personalized: false, minQuantity: 1, maxQuantity: 1000, maxArtworks: 10, unitCents: 500, offer: { originalUnitCents: 500, minimumUnitCents: 500, maxDiscountPercent: 0, discountQuantity: 1 }, geometry: null, margins: { bleedMm: 2, safeMarginMm: 2 } }];
const settings = { name: "Ground Shop", description: "Produtos personalizados", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "", pickupEnabled: true, pickupAddress: "Rua da loja, 100", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições da loja" };
const customer = { id: "buyer", name: "Cliente de teste", email: "cliente@example.test" };
const payments = { manual_enabled: true, manual_instructions: "Pagamento combinado", mp_enabled: false, payment_environment: "production" };
const calculate = lines => ({ totalCents: lines.reduce((sum, line) => sum + line.quantity * 500, 0), baseSubtotalCents: lines.reduce((sum, line) => sum + line.quantity * 500, 0), artworkDiscountCents: 0, items: lines.map(line => ({ ...line, name: products[0].name, unitCents: 500, totalCents: line.quantity * 500 })) });
let lines = [], revision = 0;
const orderId = "aaaaaaaa-0000-4000-8000-000000000001";
const orderLines = [{ id: "line", productId: products[0].id, name: products[0].name, quantity: 2, unitCents: 500, totalCents: 1000, artworkName: "" }];
const order = { id: orderId, created_at: "2026-11-18T12:00:00Z", total_cents: 1000, subtotal_cents: 1000, shipping_cents: 0, payment_status: "paid", payment_environment: "production", fulfillment_status: "production", items: orderLines, provider: "manual", delivery: "pickup", address: null, billing: null, artworkDiscountCents: 0, production: null, hasTerms: false };
const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{Storefront}from'./src/components/commerce/Storefront';import{CommerceAnalytics}from'./src/components/commerce/CommerceAnalytics';
 const base='/loja/test',path=location.pathname.slice(base.length).split('/').filter(Boolean);createRoot(document.getElementById('root')).render(location.pathname==='/admin'?<main className="min-h-screen bg-zinc-950 p-5 text-zinc-100"><div className="mx-auto max-w-6xl"><CommerceAnalytics/></div></main>:<Storefront slug='test' analytics={${JSON.stringify(config)}} settings={${JSON.stringify(settings)}} products={${JSON.stringify(products)}} basePath={base} path={path} paused={false}/>);`, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", loader: { ".module.css": "local-css" }, alias: { "@": resolve(root, "src") }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixture", setup(builder) { builder.onResolve({ filter: /^next\/(link|navigation|dynamic)$/ }, args => ({ path: args.path, namespace: "fixture" })); builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", resolveDir: root, contents: args.path.endsWith("navigation") ? "const query=new URLSearchParams(location.search),router={push:url=>location.assign(url)};export const useSearchParams=()=>query;export const useRouter=()=>router" : args.path.endsWith("link") ? "import React from'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}" : "import React,{lazy,Suspense}from'react';export default function dynamic(load){const C=lazy(()=>load().then(value=>({default:value})));return props=>React.createElement(Suspense,{fallback:null},React.createElement(C,props))}" })); } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const css = await postcss([tailwind({ content: [resolve(root, "src/components/commerce/*.tsx"), { raw: '<main class="min-h-screen bg-zinc-950 p-5 text-zinc-100"><div class="mx-auto max-w-6xl"></div></main>', extension: "html" }] })]).process("@tailwind base;@tailwind components;@tailwind utilities;body{margin:0;font-family:system-ui,sans-serif}", { from: undefined });
assets.set("/tailwind.css", css.css);
const html = '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname; response.setHeader("cache-control", "no-store");
  try {
    if (path.startsWith("/api/")) {
      let raw = ""; for await (const chunk of request) raw += chunk; const body = raw ? JSON.parse(raw) : null;
      const json = value => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(value)); };
      if (path === "/api/commerce/admin/analytics") { if (request.method === "PUT") { config = body; return json({ settings: config }); } return json({ settings: config, report }); }
      if (path.endsWith("/cart")) { if (request.method === "PUT") { assert.equal(body.revision, revision); lines = body.lines; revision++; return json({ ok: true }); } return json({ customer, lines, revision, artworks: [], calculation: calculate(lines), payments }); }
      if (path.endsWith("/price")) return json(calculate(body.lines));
      if (path.endsWith("/checkout-draft")) return json({ version: 0, draft: null });
      if (path.endsWith("/assistant")) return json({ enabled: false });
      if (path.endsWith("/orders")) return json({ orders: [order] });
      if (path.endsWith("/artworks")) return json({ proofs: [], editable: false });
      throw new Error(`Unexpected fixture API ${request.method} ${path}`);
    }
    if (path === "/admin" || path.startsWith("/loja/")) { response.setHeader("content-type", "text/html; charset=utf-8"); return response.end(html); }
    response.setHeader("content-type", ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png" })[extname(path)] || "application/octet-stream");
    if (assets.has(path)) return response.end(assets.get(path));
    const file = resolve(root, "public", `.${path}`); assert.ok(file.startsWith(resolve(root, "public") + "/")); response.end(await readFile(file));
  } catch (error) { response.writeHead(400); response.end(JSON.stringify({ error: error.message })); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done)); const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" }); let googleRequests = 0;
  await context.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin === origin) return route.continue(); if (url.hostname === "www.googletagmanager.com") { googleRequests++; return route.fulfill({ contentType: "text/javascript", body: "/* locally mocked tag; no external data transmitted */" }); } return route.abort(); });
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const events = () => page.evaluate(() => (window.dataLayer || []).map(value => Array.from(value)).filter(value => value[0] === "event"));
  const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No viewport overflow");
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height }); await page.goto(`${origin}/admin`); await page.getByText("Recebido em pedidos", { exact: true }).waitFor(); await fits();
    await page.screenshot({ path: `${output}/dashboard-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Configurar GA4" }).click(); await page.getByLabel("ID de medição GA4").waitFor(); await fits();
    await page.getByLabel("Sem atividade por quantas horas?").fill(""); await page.getByLabel("Sem atividade por quantas horas?").fill("48"); await page.getByRole("button", { name: "Salvar métricas" }).click(); await page.getByRole("status").filter({ hasText: "Configuração de métricas salva" }).waitFor();
    await page.screenshot({ path: `${output}/settings-${width}.png`, fullPage: true });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); lines = []; revision = 0;
    const before = googleRequests;
    await page.goto(`${origin}/loja/test/produto/botton-3-5-cm?email=never-send@example.test`); await page.getByRole("region", { name: "Preferências de privacidade" }).waitFor();
    await fits(); assert.equal(googleRequests, before, "No Google tag before consent");
    await page.screenshot({ path: `${output}/consent-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Somente necessárias" }).click(); assert.equal(googleRequests, before);
    await page.getByRole("button", { name: "Privacidade e cookies" }).click(); await page.getByRole("button", { name: "Aceitar métricas" }).click();
    await page.waitForFunction(() => (window.dataLayer || []).some(value => value[0] === "event" && value[1] === "view_item"));
    await page.getByLabel("Quantidade de produtos", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
    await page.getByText("Produto adicionado ao carrinho", { exact: true }).waitFor();
    assert.equal((await events()).filter(event => event[1] === "add_to_cart").length, 1);
    await page.goto(`${origin}/loja/test/carrinho`); await page.waitForFunction(() => (window.dataLayer || []).some(value => value[1] === "view_cart"));
    await page.goto(`${origin}/loja/test/checkout`); await page.waitForFunction(() => (window.dataLayer || []).some(value => value[1] === "begin_checkout"));
    await page.goto(`${origin}/loja/test/pedidos/${orderId}`); await page.waitForFunction(() => (window.dataLayer || []).some(value => value[1] === "purchase"));
    const purchase = (await events()).find(event => event[1] === "purchase")[2]; assert.equal(purchase.value, 10); assert.equal(purchase.transaction_id, orderId);
    assert.doesNotMatch(JSON.stringify(await events()), /never-send|cliente@example|artworkName|postalCode/);
    await page.reload(); await page.getByRole("heading", { name: "Seu pedido", exact: true }).waitFor();
    assert.equal((await events()).filter(event => event[1] === "purchase").length, 0, "Paid order not repeated on refresh");
  }
  assert.deepEqual(errors, []); console.log(`Analytics dashboard/consent/cart/checkout/purchase checks passed. Screenshots: ${output}`);
} finally { await browser.close(); server.close(); }
