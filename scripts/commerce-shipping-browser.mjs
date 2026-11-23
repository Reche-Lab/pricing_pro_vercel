import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const root = process.cwd();
const output = "/tmp/commerce-shipping-browser";
await mkdir(output, { recursive: true });
const initial = () => ({ shipping: null, readiness: { eligible: true, reason: null }, contracted: { name: "Correios - SEDEX", priceCents: 1500 }, notifications: { pending: 0, failed: 0 }, fiscal: { invoiceKey: "1".repeat(44), senderStateRegister: "ISENTO", productionReady: true } });
let state = initial();
const review = { serviceName: "Correios - SEDEX", contractedCents: 1500, currentCents: 1500, changed: false, sender: { name: "Ground Shop", postalCode: "12212650" },
  recipient: { name: "Cliente de demonstração", document: "52998224725", phone: "11999999999", postalCode: "01001000", address: "Praça da Sé", number: "100", complement: "A/C Recepção", district: "Sé", city: "São Paulo", state: "SP" }, volumes: [{ width: 15, height: 8, length: 20, weight: 0.5 }], warnings: [] };
const tracking = { status: "posted", serviceName: "Correios - SEDEX", trackingCode: "AA123456789BR", trackingUrl: "https://www.melhorrastreio.com.br/rastreio/AA123456789BR", postedAt: "2026-11-23T12:00:00Z", deliveredAt: null, updatedAt: "2026-11-23T12:00:00Z", events: [{ status: "posted", occurredAt: "2026-11-23T12:00:00Z", description: "Pedido postado" }, { status: "label_ready", occurredAt: "2026-11-22T12:00:00Z", description: "Envio em preparação" }] };
const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{CommerceOrderShipping}from'./src/components/commerce/CommerceOrderShipping';import{StoreOrderTracking}from'./src/components/commerce/StoreOrderTracking';
const buyer=new URLSearchParams(location.search).has('buyer'),dark=!new URLSearchParams(location.search).has('light');
document.body.style.background=dark?'#09090b':'#f7faf9';document.body.style.color=dark?'#f4f4f5':'#18181b';
createRoot(document.getElementById('root')).render(<main data-theme={dark?'dark':'light'} style={{maxWidth:1000,margin:'auto',padding:20,'--line':dark?'#3f3f46':'#d7e3de','--ink':dark?'#f4f4f5':'#18181b','--muted':dark?'#a1a1aa':'#52525b','--surface':dark?'#18181b':'#fff','--soft':dark?'#202723':'#edf5f0','--highlight':dark?'#a3ebc9':'#17684b'}}><h1 style={{fontSize:22,marginBottom:20}}>{buyer?'Acompanhe seu pedido':'Expedição do pedido'}</h1>{buyer?<StoreOrderTracking shipping={${JSON.stringify(tracking)}}/>:<CommerceOrderShipping orderId="aaaaaaaa-0000-4000-8000-000000000001" canManage/>}</main>);`, resolveDir: root, loader: "tsx" }, bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", loader: { ".module.css": "local-css" }, alias: { "@": resolve(root, "src") }, define: { "process.env.NODE_ENV": '"production"' } });
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").pop()}`, file.contents]));
const css = await postcss([tailwind({ content: [resolve(root, "src/components/commerce/CommerceOrderShipping.tsx")] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
assets.set("/tailwind.css", Buffer.from(css.css));
const server = createServer(async (request, response) => {
  if (request.url.startsWith("/api/")) {
    response.setHeader("content-type", "application/json");
    if (request.method === "GET") return response.end(JSON.stringify(state));
    let body = ""; for await (const part of request) body += part;
    const { action } = JSON.parse(body);
    if (action === "review") state.shipping = { id: "shipment", status: "quoted", service_name: "Correios - SEDEX", quoted_cents: 1500, purchase_cents: null, tracking_code: null, tracking_url: null, label_url: null, last_error: null, parcels: [] };
    if (action === "cart") Object.assign(state.shipping, { status: "cart", purchase_cents: 1500 });
    if (action === "checkout") state.shipping.status = "purchased";
    if (action === "generate") Object.assign(state.shipping, { status: "label_ready", tracking_code: tracking.trackingCode, tracking_url: tracking.trackingUrl });
    if (action === "print") state.shipping.label_url = "https://www.melhorenvio.com.br/print/private-demo";
    return response.end(JSON.stringify({ ok: true, ...state, ...(action === "review" ? { review } : {}) }));
  }
  const path = request.url.split("?")[0];
  if (assets.has(path)) { response.setHeader("content-type", path.endsWith(".css") ? "text/css" : "text/javascript"); return response.end(assets.get(path)); }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:system-ui,sans-serif}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage(); const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    state = initial(); await page.setViewportSize({ width, height: 900 });
    await page.goto(base); await page.getByRole("button", { name: "Revisar envio", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Revisar envio", exact: true }); await dialog.waitFor();
    await page.screenshot({ path: `${output}/admin-review-${width}.png` });
    const bounds = await dialog.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 901, `Modal outside viewport ${width}: ${JSON.stringify(bounds)}`);
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
    await page.screenshot({ path: `${output}/admin-review-${width}.png` });
    await dialog.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
    await page.getByRole("button", { name: "Pagar etiqueta", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar cobrança", exact: true }).click();
    await page.getByRole("button", { name: "Gerar etiqueta", exact: true }).click();
    await page.getByRole("button", { name: "Imprimir etiqueta", exact: true }).click();
    await page.getByRole("link", { name: "Abrir etiqueta para impressão", exact: true }).waitFor();
    assert(await page.getByRole("button", { name: "Pagar etiqueta", exact: true }).isDisabled());
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
    await page.screenshot({ path: `${output}/admin-ready-${width}.png`, fullPage: true });
    for (const theme of ["dark", "light"]) {
      await page.goto(`${base}/?buyer${theme === "light" ? "&light" : ""}`);
      await page.getByRole("heading", { name: "Rastreamento da entrega", exact: true }).waitFor();
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
      assert.equal(await page.getByRole("link", { name: /Acompanhar|Rastrear|rastreamento/i }).count() > 0, true);
      await page.screenshot({ path: `${output}/buyer-${theme}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log("Shipping admin workflow/modal and buyer tracking passed at 1440/390/320px, light/dark, no overflow or real provider calls.");
} finally { await browser.close(); await new Promise(done => server.close(done)); }
