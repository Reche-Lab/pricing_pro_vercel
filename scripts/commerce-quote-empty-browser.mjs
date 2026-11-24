import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { build, stop } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = resolve(root, "public");
// Render real quote components with in-memory data, without Next.js or tenant access.
const bundle = await build({
  stdin: {
    resolveDir: root, loader: "tsx", sourcefile: "quote-empty-fixture.tsx",
    contents: `
      import React,{useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {StoreQuoteOverview} from './src/components/commerce/StoreQuoteOverview';
      import {StoreQuoteJourney} from './src/components/commerce/StoreQuoteJourney';
      import styles from './src/components/commerce/store.module.css';
      const names=['Botton - 3,5 cm','Espelho - 5,5 cm','Ímã personalizado','Abridor personalizado','Chaveiro personalizado'];
      const models=['botton-25mm-v1','espelho-redondo-v1','ima-redondo-v1','abridor-redondo-v1','botton-25mm-v1'];
      const query=new URLSearchParams(location.search),theme=query.get('theme')||'light';
      const products=query.has('no-products')?[]:names.map((name,index)=>({
        id:'00000000-0000-4000-8000-00000000000'+index,name:query.has('long')?name+' para campanhas corporativas e eventos especiais':name,
        category:['Bottons','Espelhos','Ímãs','Abridores','Chaveiros'][index],
        imageUrl:'/mockups/'+models[index]+'/base-verso.png',description:'Personalizado',
        minQuantity:10,maxQuantity:1000,maxArtworks:10,personalized:true,unitCents:500,
      }));
      function App(){
        const[cart,setCart]=useState({lines:[],revision:1,artworks:[],customer:query.has('guest')?null:{name:'Cliente teste'},calculation:{items:[],totalCents:0,artworkDiscountCents:0}});
        return <main className={styles.store} data-theme={theme} style={{'--accent':theme==='dark'?'#79d8d0':'#047857','--accent-ink':theme==='dark'?'#081311':'#fff'}}>
          <header className="fixtureHeader">Ground Shop</header>
          <StoreQuoteJourney base="/loja/test" step={1} count={cart.lines.length} totalCents={cart.calculation.totalCents} identified={Boolean(cart.customer)} onPurchase={()=>{}}/>
          <div className="fixtureContent"><StoreQuoteOverview cart={cart} products={products} base="/loja/test" storeName="Ground Shop" busy={false} onUpdate={async lines=>{
            const items=lines.map(line=>({...line,name:products.find(p=>p.id===line.productId).name,unitCents:500,totalCents:line.quantity*500,artworkDiscountCents:0}));
            setCart({...cart,lines,revision:cart.revision+1,calculation:{items,totalCents:items.reduce((sum,item)=>sum+item.totalCents,0),artworkDiscountCents:0}});
          }}/></div>
        </main>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `,
  },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic",
  loader: { ".module.css": "local-css" }, alias: { "@": resolve(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixture-link", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
      loader: "js", resolveDir: root,
      contents: "import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}",
    }));
  } }],
});
stop();
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const html = `<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif}h1,h2,h3,p{margin:0}button,input,select,a{font:inherit}button{border:0;background:none;color:inherit;cursor:pointer}a{color:inherit;text-decoration:none}svg{vertical-align:middle}button:disabled{cursor:wait}
  .fixtureHeader{padding:20px 24px;border-bottom:1px solid var(--line);font-weight:700}.fixtureContent{max-width:1200px;margin:auto;padding:24px 20px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
  input,select{width:100%;min-width:0;min-height:42px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink)}
  @media(max-width:700px){.fixtureContent{padding:20px 12px}}
</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    response.setHeader("content-type", ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png" })[extname(path)] || "text/html; charset=utf-8");
    if (assets.has(path)) return response.end(assets.get(path));
    if (!path.startsWith("/mockups/")) return response.end(html);
    const file = resolve(publicRoot, `.${path}`);
    if (!file.startsWith(`${publicRoot}/`)) throw new Error("Invalid path");
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--serve")) {
  console.log(`Quote workspace preview (isolated): ${base}`);
} else {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=128"] });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [320, 740], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/?theme=${theme}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Sua próxima ideia começa aqui." }).waitFor();
      const suggestions = page.getByRole("list", { name: "Sugestões para começar seu orçamento" });
      await suggestions.locator("img").evaluateAll(images => Promise.all(images.map(image => { image.loading = "eager"; return image.decode(); })));
      assert.equal(await suggestions.getByRole("button").count(), 4);
      await noOverflow();
      await page.screenshot({ path: `/tmp/quote-empty-${theme}-${width}x${height}.png`, fullPage: true });
      await page.getByRole("button", { name: "Orçar Botton - 3,5 cm", exact: true }).click();
      const modal = page.getByRole("dialog", { name: "Adicionar produtos ao orçamento" });
      const quantity = modal.getByLabel("Quantidade de produtos", { exact: true });
      assert.equal(await quantity.inputValue(), "10");
      const bounds = await modal.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
      await quantity.fill("25");
      await modal.getByRole("button", { name: "Adicionar ao orçamento", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: "Monte seu orçamento", exact: true }).waitFor();
      assert.equal(await page.getByRole("textbox", { name: /Quantidade de Botton/ }).inputValue(), "25");
      await noOverflow();
      await page.getByRole("button", { name: /Remover Botton/ }).click();
      await page.getByRole("heading", { name: "Sua próxima ideia começa aqui." }).waitFor();
      await page.getByRole("button", { name: "Desfazer remoção" }).click();
      await page.getByRole("heading", { name: "Monte seu orçamento", exact: true }).waitFor();
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`${base}/?long&guest`, { waitUntil: "networkidle" });
    await noOverflow();
    assert.equal(await page.getByRole("link", { name: "Meus orçamentos", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Escolher produtos", exact: true }).focus();
    assert.equal(await page.getByRole("button", { name: "Escolher produtos", exact: true }).evaluate(element => element === document.activeElement), true);
    await page.screenshot({ path: "/tmp/quote-empty-long-mobile.png", fullPage: true });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base, { waitUntil: "networkidle" });
    const choice = page.getByRole("button", { name: "Orçar Botton - 3,5 cm", exact: true });
    const beforeHover = await choice.boundingBox();
    await choice.hover(); await page.waitForTimeout(300);
    const afterHover = await choice.boundingBox();
    assert.ok(afterHover.y < beforeHover.y && beforeHover.y - afterHover.y <= 4);
    await page.screenshot({ path: "/tmp/quote-empty-desktop-hover.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log("Empty quote verified: desktop/mobile and landscape, both themes, real image decoding, quick selection, quantities, inclusion, removal/undo, modal bounds, long names and no page overflow. No database or full app build.");
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
}
