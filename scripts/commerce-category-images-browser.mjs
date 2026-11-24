import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, stop } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url)), publicRoot = resolve(root, "public");
const studio = process.argv.includes("--studio");
// Exercise the actual home/category markup and CSS without Next.js, a database or external services.
const bundle = await build({
  stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {StoreHome} from './src/components/commerce/StoreHome';
    import styles from './src/components/commerce/store.module.css';
    import studio from './src/components/commerce/studio.module.css';
    const query=new URLSearchParams(location.search),theme=query.get('theme')||'light';
    const names=['Bottons','Espelhos','Ímãs','Abridores',query.has('long')?'Chaveiros personalizados para eventos e presentes':'Chaveiros'];
    const models=['botton-25mm-v1','espelho-redondo-v1','ima-redondo-v1','abridor-redondo-v1','botton-25mm-v1'];
    const products=names.map((category,i)=>({id:String(i),name:category,category,imageUrl:'/mockups/'+models[i]+'/base-verso.png',personalized:false,unitCents:500,minQuantity:1,offer:{originalUnitCents:500,discountQuantity:100,maxDiscountPercent:${studio ? "35+i*5" : "0"}},media:[]}));
    const settings={name:'Ground Shop',description:'Sua arte em produtos personalizados.',experience:{style:'studio'},contactEmail:'',contactPhone:'',pickupEnabled:false,bannerUrl:''};
    createRoot(document.getElementById('root')).render(<main className={styles.store+' '+studio.theme} data-theme={theme} style={{'--accent':'#047857','--accent-ink':'white'}}><StoreHome settings={settings} products={products} base="/loja/ground-shop" slug="ground-shop" preview/></main>);
  `, resolveDir: root, loader: "tsx", sourcefile: "category-images-fixture.tsx" },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", alias: { "@": resolve(root, "src") }, loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-home", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|dynamic)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/(StudioHero|StudioPersonalizer|StoreGoogleReviews|StoreAnalytics)$/ }, args => studio && args.path === "./StudioHero" ? undefined : ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ resolveDir: root, loader: "js", contents: args.path === "next/link"
      ? "import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}"
      : args.path === "next/dynamic" ? "export default function dynamic(){return function Empty(){return null}}"
      : "export function StudioHero(){return null}export function StudioPersonalizer(){return null}export function StoreGoogleReviews(){return null}export const useStoreAnalytics=()=>({track:()=>false});" }));
  } }],
});
stop();
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif}h1,h2,h3,p{margin:0}button,input,a{font:inherit}button{border:0;background:none;color:inherit;cursor:pointer}a{color:inherit;text-decoration:none}svg{vertical-align:middle}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    response.setHeader("content-type", ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp" })[extname(path)] || "text/html; charset=utf-8");
    if (assets.has(path)) return response.end(assets.get(path));
    if (!path.startsWith("/mockups/") && !path.startsWith("/studio/")) return response.end(html);
    const file = resolve(publicRoot, `.${path}`); if (!file.startsWith(`${publicRoot}/`)) throw new Error("Invalid path");
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--serve")) {
  console.log(`${studio ? "Studio carousel" : "Category section"} preview (isolated): ${base}`);
} else {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
  const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=128"] });
  try {
    const context = await browser.newContext();
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    if (studio) {
      for (const width of [1440, 768, 390, 320]) for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/?theme=${theme}`, { waitUntil: "networkidle" });
        const hero = page.getByRole("region", { name: "Estúdio Ground Shop" });
        await hero.getByRole("button", { name: "Pausar movimento da vitrine" }).click();
        assert.equal(await hero.locator("img").evaluateAll(images => images.filter(image => image.alt).every(image => image.complete && image.naturalWidth > 0)), true);
        await hero.getByText("Descontos de até 35%").waitFor();
        assert.doesNotMatch(await hero.textContent(), /R\$|\/ un\./);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await hero.screenshot({ path: `/tmp/groundshop-studio-carousel-${theme}-${width}.png` });
      }
      const hero = page.getByRole("region", { name: "Estúdio Ground Shop" });
      await hero.getByRole("button", { name: "Retomar movimento da vitrine" }).click();
      const product = hero.locator("[data-studio-float]");
      const before = await product.evaluate(element => getComputedStyle(element).transform);
      await page.waitForTimeout(250);
      assert.notEqual(await product.evaluate(element => getComputedStyle(element).transform), before);
      await page.waitForTimeout(2350);
      await hero.getByText("Descontos de até 35%").waitFor();
      await hero.getByText("Descontos de até 40%").waitFor();
      await hero.getByRole("button", { name: "Pausar movimento da vitrine" }).click();
      await page.waitForTimeout(5000);
      await hero.getByText("Descontos de até 40%").waitFor();
      await hero.getByRole("button", { name: "Mostrar Chaveiros" }).click();
      await hero.getByText("Descontos de até 55%").waitFor();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await hero.getByRole("button", { name: "Retomar movimento da vitrine" }).click();
      assert.equal(await hero.getAttribute("data-moving"), "false");
      assert.deepEqual(errors, []);
      console.log("Studio carousel verified: two full heartbeat cycles per product, real images/discounts, manual navigation, pause/reduced motion, desktop/mobile screenshots in both themes, no page overflow.");
    } else {
    for (const width of [1440, 1024, 768, 700, 390, 360, 320]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(`${base}/?theme=${theme}`, { waitUntil: "networkidle" });
      const section = page.getByRole("region", { name: "Coleções" }); await section.waitFor();
      await section.locator("img").evaluateAll(images => Promise.all(images.map(image => { image.loading = "eager"; return image.decode(); })));
      const expected = width > 1000 ? 140 : width > 700 ? 112 : width > 360 ? 88 : 80;
      for (const image of await section.locator("img").all()) {
        const size = await image.evaluate(element => ({ width: parseFloat(getComputedStyle(element).width), height: parseFloat(getComputedStyle(element).height) }));
        assert.equal(size.width, expected); assert.equal(size.height, expected);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (width >= 1024) {
        await section.getByRole("link", { name: "Bottons", exact: true }).hover(); await page.waitForTimeout(350);
        const heading = await section.getByRole("heading").boundingBox(), image = await section.locator("img").first().boundingBox();
        assert.ok(image.y > heading.y + heading.height, "Hover must not collide with the heading");
      }
      await section.screenshot({ path: `/tmp/groundshop-category-images-${theme}-${width}.png` });
      await section.getByRole("link", { name: "Chaveiros", exact: true }).focus();
      assert.equal(await section.getByRole("link", { name: "Chaveiros", exact: true }).getAttribute("href"), "/loja/ground-shop/catalogo?categoria=Chaveiros");
    }
    await page.setViewportSize({ width: 320, height: 740 }); await page.goto(`${base}/?long`, { waitUntil: "networkidle" });
    const long = page.getByRole("region", { name: "Coleções" }).getByRole("link", { name: "Chaveiros personalizados para eventos e presentes", exact: true }); await long.focus();
    const fits = await long.locator("span").evaluate(element => element.scrollWidth <= element.clientWidth + 1); assert.equal(fits, true);
    assert.deepEqual(errors, []);
    console.log("Category images verified: 140px desktop, 112px tablet, 88/80px mobile; both themes; decoded images; no page overflow; hover below heading; scrolling, links and long labels. Isolated lightweight fixture, no database or app build.");
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
}
