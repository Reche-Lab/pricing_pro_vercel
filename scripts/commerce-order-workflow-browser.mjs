import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build, stop } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
  stdin: { resolveDir: root, loader: "tsx", sourcefile: "order-progress-fixture.tsx", contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{CommerceOrderWorkflow}from'./src/components/commerce/CommerceOrderWorkflow';
    const scenario=new URLSearchParams(location.search).get('stage')||'production';
    const order={id:'00000000-0000-4000-8000-000000000001',customer_name:'Empresa cliente · Campanha de fim de ano',payment_status:'paid',payment_environment:scenario==='test'?'test':'production',fulfillment_status:scenario==='ready'?'received':'production',provider:'manual',required_artworks:1,prepared_artworks:1,approved_artworks:1,total_cents:17500,item_count:2};
    let olist={configured:!['manual','pickup'].includes(scenario),enabled:true,autoInvoice:true,autoDispatch:true,job:{status:'waiting',customer_id:'11',sales_order_id:'22',production_completed_at:null,invoice_status:null}};
    if(['invoice','shipping','label','cart'].includes(scenario))olist.job={...olist.job,production_completed_at:'now',status:scenario==='invoice'?'pending':'done',invoice_id:'33',invoice_status:scenario==='invoice'?4:6,invoice_number:'78',invoice_link:scenario==='invoice'?null:'https://erp.tiny.com.br/nota-test',expedition_id:scenario==='invoice'?null:'44'};
    if(scenario==='error')olist.job={...olist.job,status:'blocked',error_code:'olist_oauth_invalid',last_error:'Reconecte o Olist para continuar. As etapas concluídas foram preservadas.',debug_id:'reference-test'};
    let shipping={shipping:scenario==='label'?{id:'s',status:'label_ready',label_url:'https://www.melhorenvio.com.br/print/test',tracking_code:'AA123456789BR',tracking_url:'https://www.melhorrastreio.com.br/test',parcels:[]}:scenario==='cart'?{id:'s',status:'cart',purchase_cents:2500,parcels:[]}:null,readiness:{eligible:true,reason:null},contracted:{name:'Correios · SEDEX',priceCents:2500},fiscal:{productionReady:true,productionSource:'olist',invoiceKey:'1'.repeat(44),senderStateRegister:'ISENTO'},notifications:{pending:0,failed:0}};
    window.__mutations=[];const originalFetch=window.fetch;
    window.fetch=async(input,options={})=>{
      const path=String(input);if(!path.startsWith('/api/commerce/admin/orders/'))return originalFetch(input,options);
      if(options.method==='POST'){
        const body=JSON.parse(options.body);window.__mutations.push({path,body});
        if(path.endsWith('/olist')){olist={...olist,job:{...olist.job,production_completed_at:'now',status:'pending'}};return Response.json(olist)}
        if(path.endsWith('/shipping'))return Response.json({...shipping,ok:true});
        return Response.json({ok:true});
      }
      return Response.json(path.endsWith('/olist')?olist:shipping);
    };
    function App(){return <div className="fixture"><header className="fixtureHeader">Pedido #GS001 · Ground Shop</header><CommerceOrderWorkflow order={order} canManage={scenario!=='readonly'} initialOlist={olist} pickup={scenario==='pickup'} melhorEnvio={['shipping','label','cart'].includes(scenario)} deliveryDate="2026-12-10" shippingBlockedReason={null} summary={<><h2 className="font-semibold">Resumo da compra</h2><p className="text-sm text-zinc-400">Produtos: R$ 150,00</p><p className="text-sm text-zinc-400">Frete: R$ 25,00</p><strong>Total: R$ 175,00</strong><details><summary>Cliente, faturamento e entrega</summary><p className="text-sm text-zinc-400">São Paulo · SP</p></details></>}><section className="space-y-4 py-4"><h2 className="font-semibold">Itens e artes da compra</h2><p className="border-y border-zinc-800 py-4 text-sm text-zinc-300">Botton personalizado · 50 unidades · Arte aprovada</p><details><summary>Histórico do pedido</summary><p className="text-sm text-zinc-400">Pagamento confirmado. Arte aprovada pelo cliente.</p></details></section></CommerceOrderWorkflow></div>};
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic",
  alias: { "@": resolve(root, "src") }, loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-order", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onResolve({ filter: /\/(OlistReconnectBoundary|MelhorEnvioReconnectBoundary)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ resolveDir: root, loader: "js", contents: args.path === "next/link"
      ? "import React from'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}"
      : args.path === "next/navigation" ? "export const useRouter=()=>({refresh:()=>{}})"
      : "export function OlistReconnectBoundary({children}){return children}export function MelhorEnvioReconnectBoundary({children}){return children}" }));
  } }],
});
stop();
const utilities = await postcss([tailwind({ content: ["CommerceOrderWorkflow", "CommerceOrderProduction", "CommerceOrderOlist", "CommerceOrderShipping", "LibraryUI"].map(name => resolve(root, `src/components/commerce/${name}.tsx`)) })]).process("@tailwind base;@tailwind utilities;", { from: undefined });
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
assets.set("/utilities.css", utilities.css);
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/utilities.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#09090b;color:#f4f4f5;font-family:Inter,system-ui,sans-serif}.fixture{max-width:1240px;margin:auto;padding:24px}.fixtureHeader{font-weight:650;font-size:22px;margin-bottom:20px}button,summary{cursor:pointer}input,textarea{font-size:16px}.space-y-4>*+*{margin-top:16px}@media(max-width:600px){.fixture{padding:16px}.fixtureHeader{font-size:18px}}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  response.setHeader("content-type", path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8");
  response.end(assets.get(path) ?? html);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--serve")) console.log(`Order workflow preview (isolated, simulated operations): ${base}`);
else {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=128"] });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) for (const stage of ["ready", "production", "invoice", "shipping", "label", "cart"]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/?stage=${stage}`, { waitUntil: "networkidle" });
      const band = page.getByRole("region", { name: "Andamento e próxima ação do pedido" });
      await band.waitFor();
      if (stage === "production") await band.getByRole("button", { name: "Concluir produção e liberar NF-e" }).waitFor();
      if (stage === "shipping") await band.getByRole("button", { name: "Revisar envio" }).waitFor();
      if (stage === "cart") await band.getByRole("button", { name: "Comprar etiqueta de envio" }).waitFor();
      if (stage === "label") {
        await band.getByRole("button", { name: "Confirmar postagem" }).waitFor();
        await band.getByRole("link", { name: "Imprimir etiqueta" }).waitFor();
        assert.equal(await band.getByRole("button", { name: "AA123456789BR" }).count(), 1);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(await page.evaluate(() => window.__mutations), []);
      await page.screenshot({ path: `/tmp/order-workflow-${stage}-${width}.png`, fullPage: true });
      if (stage === "cart") {
        await band.getByRole("button", { name: "Comprar etiqueta de envio" }).click();
        const modal = page.getByRole("dialog", { name: "Confirmar cobrança da etiqueta" });
        await modal.waitFor();
        assert.deepEqual(await page.evaluate(() => window.__mutations), []);
        const bounds = await modal.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
        assert.equal(await modal.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
        await modal.screenshot({ path: `/tmp/order-workflow-label-purchase-${width}.png` });
        await modal.getByRole("button", { name: "Fechar janela" }).click();
      }
      if (stage === "production") {
        await band.getByRole("button", { name: "Concluir produção e liberar NF-e" }).click();
        const modal = page.getByRole("dialog", { name: "Concluir produção e liberar faturamento" });
        assert.equal(await modal.getByRole("button", { name: "Confirmar", exact: true }).isDisabled(), true);
        await modal.getByRole("textbox", { name: "Observação" }).fill("Produção e embalagem conferidas");
        const bounds = await modal.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
        assert.equal(await modal.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
        await modal.screenshot({ path: `/tmp/order-workflow-confirm-${width}.png` });
        await modal.getByRole("button", { name: "Confirmar", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        assert.equal((await page.evaluate(() => window.__mutations)).length, 1);
      }
    }
    for (const stage of ["error", "pickup", "manual", "test", "readonly"]) {
      await page.goto(`${base}/?stage=${stage}`, { waitUntil: "networkidle" });
      const band = page.getByRole("region", { name: "Andamento e próxima ação do pedido" });
      if (stage === "pickup") await band.getByRole("button", { name: "Confirmar retirada" }).waitFor();
      if (stage === "error") await band.getByRole("button", { name: "Reconectar Olist" }).waitFor();
      if (["test", "readonly"].includes(stage)) assert.equal(await band.getByRole("button").count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__mutations), []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }
    assert.deepEqual(errors, []);
    console.log("Order workflow verified: guided production/fiscal/shipping stages, one next action, real confirmation modals, safe links, tracking, pickup/no ERP, read-only/test guards, desktop/mobile/landscape, no overflow or real external mutations.");
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
