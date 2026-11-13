import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url)), publicRoot = resolve(root, "public");
// Exercise the real footer and its CSS without a tenant database or external services.
// Only Next's navigation wrapper is replaced by a normal anchor in this isolated harness.
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {StoreFooter} from './src/components/commerce/StoreFooter';
    import store from './src/components/commerce/store.module.css';
    import studio from './src/components/commerce/studio.module.css';
    const query = new URLSearchParams(location.search), preview = query.has('preview');
    const theme = query.get('theme') || 'light', base = preview ? '/commerce/ground-shop/preview' : '';
    const settings = {name:query.has('long') ? 'Uma empresa com nome bastante longo para conferir o rodapé' : 'Ground Shop',logoUrl:'/brands/ground-shop.jpeg',contactEmail:'atendimento@groundshop.com.br',contactPhone:'+55 (12) 99999-1234',pickupEnabled:true,pickupAddress:'Rua da loja, 203 · São José dos Campos, SP',experience:{style:'studio',motion:!query.has('static')}};
    const products = ['Botton 2,5 cm','Espelho 5,5 cm','Ímã 4,5 cm'].map((name,i)=>({id:String(i),name,imageUrl:'/mockups/'+['botton-25mm-v1','espelho-redondo-v1','ima-redondo-v1'][i]+'/base-verso.png',personalized:true,geometry:{shape:'circle'},artworkOptions:{mockup:{}}}));
    const institutionalLinks = [{slug:'quem-somos',title:'Quem somos'},{slug:'termos-de-uso',title:'Termos de uso'},{slug:'politica-de-privacidade',title:'Política de Privacidade'},{slug:'politica-de-troca',title:'Trocas e devoluções'},{slug:'politica-de-reembolso',title:'Reembolso'}];
    createRoot(document.getElementById('root')).render(<main data-theme={theme} className={store.store+' '+studio.theme} style={{'--accent':theme==='dark'?'#79d8d0':'#047857','--accent-ink':theme==='dark'?'#081311':'#ffffff'}}><header style={{padding:24}}><a href="#inicio" data-store-home-link>Ground Shop</a></header><section id="inicio" style={{minHeight:900,padding:24}}><h1>Catálogo de teste</h1></section><StoreFooter settings={settings} products={products} base={base} preview={preview} libraryEnabled institutionalLinks={institutionalLinks} payments={{mp_enabled:true,payment_environment:'production'}}/></main>);
  `, resolveDir: root, sourcefile: "footer-fixture.tsx", loader: "tsx" },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": resolve(root, "src") }, loader: { ".module.css": "local-css" },
  plugins: [{ name: "local-next-link", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import React from 'react'; export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}", loader: "js", resolveDir: root }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}button,a{font:inherit}button{cursor:pointer}a{color:inherit}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", path === "/" ? "text/html; charset=utf-8" : ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpeg": "image/jpeg", ".webp": "image/webp" })[extname(path)] || "application/octet-stream");
    if (path === "/") return response.end(html);
    if (assets.has(path)) return response.end(assets.get(path));
    const file = resolve(publicRoot, `.${path}`);
    if (!file.startsWith(`${publicRoot}/`)) throw new Error("Invalid asset");
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const preview of [false, true]) for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844], [320, 844], [844, 390]]) {
    console.log(`Checking footer ${preview ? "preview" : "public"} ${theme} ${width}x${height}`);
    await page.setViewportSize({ width, height }); await page.goto(`${base}/?theme=${theme}${preview ? "&preview" : ""}`, { waitUntil: "networkidle" });
    const footer = page.locator("[data-store-footer]"); await footer.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("[data-store-footer]")?.dataset.animate === "true");
    for (const image of await footer.locator("img").all()) await image.evaluate(image => image.decode());
    for (const product of await footer.getByRole("link", { name: /^Ver / }).all()) {
      const box = await product.boundingBox(); assert.ok(box && Math.abs(box.width - box.height) < 1, "Product miniatures keep a stable square frame");
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await footer.getByRole("link", { name: "Ver Botton 2,5 cm" }).getAttribute("href"), `${preview ? "/commerce/ground-shop/preview" : ""}/produto/0`);
    for (const [name, href] of [["Liaflow", "https://liaflow-calcula.vercel.app/"], ["rechelab", "https://reche-lab-portfolio.vercel.app/"]]) {
      const link = footer.getByRole("link", { name, exact: true }); assert.equal(await link.getAttribute("href"), href); assert.ok((await link.getAttribute("rel")).includes("noopener"));
      const box = await link.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width);
    }
    const summary = footer.locator("summary").filter({ hasText: "Informações da loja" }), details = summary.locator("..");
    assert.equal(await details.evaluate(element => element.open), width > 700);
    if (width <= 700) { await summary.click(); await footer.getByRole("link", { name: "Quem somos", exact: true }).waitFor(); }
    await page.keyboard.press("Tab");
    await footer.getByRole("link", { name: "rechelab", exact: true }).focus();
    assert.notEqual(await footer.getByRole("link", { name: "rechelab", exact: true }).evaluate(element => getComputedStyle(element).outlineStyle), "none");
    await footer.screenshot({ path: `/tmp/store-footer-${preview ? "preview" : "public"}-${theme}-${width}.png`, animations: "disabled" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const backTop = footer.getByRole("button", { name: "Voltar ao topo" }); await backTop.click();
    await page.waitForFunction(() => scrollY === 0 && document.activeElement?.hasAttribute("data-store-home-link"));
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${base}/?theme=light&long&static`, { waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  assert.equal(await page.locator("[data-store-footer]").getAttribute("data-animate"), "false");
  await page.getByRole("img", { name: /^Logo / }).evaluate(image => image.dispatchEvent(new Event("error")));
  assert.equal(await page.getByRole("img", { name: /^Logo / }).count(), 0);
  assert.deepEqual(errors, []); await context.close();
  console.log("Footer component verified: public/custom-domain and private-preview links, light/dark, 1440/390/320 and landscape, decoded catalog/logo images, responsive disclosure, focus, top navigation, safe credits, long tenant name, disabled/reduced motion and no overflow. Isolated component harness; no database or external services.");
} finally { await browser.close(); await new Promise(done => server.close(done)); }
