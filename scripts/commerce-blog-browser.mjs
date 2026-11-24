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
// Real blog components and assets; no customer database or outside requests.
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {StoreBlog} from './src/components/commerce/blog/StoreBlog';
    import {StoreCategoryNavigation} from './src/components/commerce/StoreCategoryNavigation';
    import {groundShopArticles} from './src/content/ground-shop-blog';
    import store from './src/components/commerce/store.module.css';
    const query=new URLSearchParams(location.search), theme=query.get('theme')||'light';
    const preview=query.has('preview'), base=preview?'/commerce/ground-shop/preview':'';
    const article=groundShopArticles.find(a=>a.slug===query.get('article'));
    createRoot(document.getElementById('root')).render(<main className={store.store} data-theme={theme} style={{'--store-header-offset':'140px','--accent':'#047857','--accent-ink':'white'}}>
      <header style={{padding:'12px 22px',fontWeight:700}}>Ground Shop</header>
      <StoreCategoryNavigation products={[]} base={base} preview={preview} view="blog" blogEnabled/>
      <div className={store.wrap}><StoreBlog base={base} article={article} products={[]} preview={preview}/></div>
    </main>);
  `, resolveDir: root, sourcefile: "blog-fixture.tsx", loader: "tsx" },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": resolve(root, "src") }, loader: { ".module.css": "local-css" },
  plugins: [{ name: "local-next-link", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}", loader: "js", resolveDir: root }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}button,a{font:inherit}button{cursor:pointer}a{color:inherit}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", ({ ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp" })[extname(path)] || "text/html; charset=utf-8");
    if (assets.has(path)) return response.end(assets.get(path));
    if (!path.startsWith("/studio/")) return response.end(html);
    const file = resolve(publicRoot, `.${path}`);
    if (!file.startsWith(`${publicRoot}/`)) throw new Error("Invalid asset");
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext();
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
    console.log(`Blog ${theme} ${width}x${height}`);
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/blog?theme=${theme}`, { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Blog Ground Shop");
    assert.equal(await page.getByRole("link", { name: "Blog e ideias" }).getAttribute("href"), "/blog");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.locator("[data-store-blog] img").evaluateAll(images => Promise.all(images.map(i => { i.loading = "eager"; return i.decode(); })));
    await page.screenshot({ path: `/tmp/groundshop-blog-${theme}-${width}.png`, fullPage: width === 390 });
    await page.getByRole("button", { name: "Empresas e eventos", exact: true }).click();
    assert.match(await page.getByRole("status").textContent(), /2 histórias/);
    await page.getByRole("button", { name: "Todas as histórias", exact: true }).click();
    await page.getByRole("searchbox").fill("imas geladeira");
    assert.match(await page.getByRole("status").textContent(), /1 história/);
    await page.getByRole("button", { name: "Guardar leitura neste navegador" }).click();
    assert.equal(await page.getByRole("button", { name: "Remover dos favoritos" }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Limpar busca" }).click();
    const idea = page.locator('[aria-live="polite"]'); const before = await idea.textContent();
    await page.getByRole("button", { name: "Experimentar outra ideia" }).click(); assert.notEqual(await idea.textContent(), before);
    await page.goto(`${base}/blog?theme=${theme}&article=bottons-eventos-corporativos-summits`, { waitUntil: "networkidle" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.locator('[data-store-blog] img').evaluateAll(images => Promise.all(images.map(i => { i.loading = "eager"; return i.decode(); })));
    await page.screenshot({ path: `/tmp/groundshop-blog-article-${theme}-${width}.png`, fullPage: width === 390 });
    await page.getByRole("link", { name: "A conta acontece por arte, não só pelo público" }).click();
    await page.waitForFunction(() => Number(document.querySelector('[data-blog-progress]').value) > 0);
    await page.getByText("Preciso colocar o logo inteiro no botton?", { exact: true }).click();
    assert.equal(await page.locator('details').filter({ hasText: "Preciso colocar o logo inteiro" }).evaluate(el => el.open), true);
    await page.evaluate(() => localStorage.clear());
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/blog?preview`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("link", { name: "Blog e ideias" }).getAttribute("href"), "/commerce/ground-shop/preview/blog");
  assert.equal(await page.getByRole("button", { name: "Experimentar outra ideia" }).evaluate(el => getComputedStyle(el).transitionDuration), "0s");
  assert.deepEqual(errors, []);
  console.log("Blog verified: light/dark, desktop/mobile/landscape, images decoded, no overflow, search/category filters, saved reading, idea shuffle, article anchors, FAQ, progress and reduced motion. Isolated component fixture, no database or third-party services.");
} finally { await browser.close(); await new Promise(done => server.close(done)); }
