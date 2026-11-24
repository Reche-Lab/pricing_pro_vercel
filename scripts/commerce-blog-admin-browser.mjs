import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url)), publicRoot = resolve(root, "public");
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CommerceBlogSettings} from './src/components/commerce/CommerceBlogSettings';
    createRoot(document.getElementById('root')).render(<main style={{maxWidth:1200,margin:'auto',padding:20}}><CommerceBlogSettings slug="ground-shop" onBusyChange={()=>{}}/></main>);`, sourcefile: "blog-admin-fixture.tsx", loader: "tsx", resolveDir: root },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", alias: { "@": resolve(root, "src") }, loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixture-store-http", setup(builder) {
    builder.onResolve({ filter: /store-http$/ }, () => ({ path: "store-http", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ resolveDir: root, loader: "ts", contents: `
      import {groundShopArticles} from './src/content/ground-shop-blog';import {defaultBlogSettings} from './src/domain/commerce/blog-settings';
      const initial={settings:defaultBlogSettings('ground-shop','Ground Shop'),revision:0,migrationRequired:false,posts:groundShopArticles.map(article=>({article,status:'published',revision:0}))};
      export async function storeRequest(url,method='GET',body){
        await new Promise(done=>setTimeout(done,100));
        if(url.includes('/media'))return {url:'https://media.test/blog-cover.webp'};
        const state=JSON.parse(localStorage.getItem('fixture-blog')||JSON.stringify(initial));
        if(method==='GET')return state;
        if(window.__blogFail)throw new Error('Conflito de edição. Recarregue antes de salvar.');
        window.__lastBlogSave=body;
        if(body.action==='settings'){state.settings=body.settings;state.revision++;}else{
          const old=state.posts.find(p=>p.article.slug===body.slug);
          const post={article:{...body.content,slug:body.slug,published:old?.article.published||new Date().toISOString(),updated:new Date().toISOString()},status:body.status,revision:(old?.revision||0)+1};
          if(old)state.posts[state.posts.indexOf(old)]=post;else state.posts.push(post);
        }
        localStorage.setItem('fixture-blog',JSON.stringify(state));return {...state,message:'Alterações salvas.'};
      }` }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const utilities = await postcss([tailwindcss({ content: [resolve(root, "src/components/commerce/CommerceImageUpload.tsx"), resolve(root, "src/components/commerce/LibraryUI.tsx")], corePlugins: { preflight: false } })]).process("@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>${utilities.css}*{box-sizing:border-box}body{margin:0;background:#09090b;color:#f4f4f5;font-family:Inter,system-ui,sans-serif}h1,h2,h3,h4,p{margin:0}button,input,select,textarea{font:inherit}button{cursor:pointer}svg{flex-shrink:0}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    response.setHeader("content-type", ({ ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp" })[extname(path)] || "text/html; charset=utf-8");
    if (assets.has(path)) return response.end(assets.get(path));
    if (!path.startsWith("/studio/")) return response.end(html);
    const file = resolve(publicRoot, `.${path}`); if (!file.startsWith(`${publicRoot}/`)) throw new Error("Invalid path");
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.hostname === "media.test") return route.fulfill({ contentType: "image/webp", body: await readFile(resolve(publicRoot, "studio/blog/ground-shop/campanhas.webp")) });
    return route.abort();
  });
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 768, 390, 320]) {
    console.log(`Blog admin ${width}px`);
    await page.setViewportSize({ width, height: 900 }); await page.goto(base, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Blog da loja" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `/tmp/groundshop-blog-admin-${width}.png` });
    await page.getByText("Apresentação do blog", { exact: false }).first().click();
    await page.getByLabel("Título do blog", { exact: true }).fill(`Blog Ground Shop ${width}`);
    await page.getByRole("button", { name: "Salvar apresentação" }).click();
    await page.getByRole("status").filter({ hasText: "Alterações salvas" }).waitFor();
    await page.getByRole("button", { name: /^Editar / }).first().click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height <= 900);
    assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await dialog.getByLabel("Título", { exact: true }).fill(`Artigo revisado ${width}`);
    await dialog.getByLabel("Enviar Capa do artigo").setInputFiles(resolve(publicRoot, "studio/blog/ground-shop/campanhas.webp"));
    await dialog.getByRole("img", { name: "Prévia: Capa do artigo" }).evaluate(async img => { if (img.src.includes("media.test")) await img.decode(); });
    await page.waitForFunction(() => document.querySelector('dialog img[src="https://media.test/blog-cover.webp"]')?.complete);
    await dialog.screenshot({ path: `/tmp/groundshop-blog-admin-editor-${width}.png` });
    await page.evaluate(() => { window.__blogFail = true; });
    await dialog.getByRole("button", { name: "Salvar e publicar" }).click();
    await dialog.getByRole("alert").filter({ hasText: "Conflito de edição" }).waitFor();
    assert.equal(await dialog.getByLabel("Título", { exact: true }).inputValue(), `Artigo revisado ${width}`);
    await dialog.getByRole("alert").screenshot({ path: `/tmp/groundshop-blog-admin-error-${width}.png` });
    await page.evaluate(() => { window.__blogFail = false; });
    await dialog.getByRole("button", { name: "Salvar e publicar" }).click(); await dialog.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => window.__lastBlogSave.content.image), "https://media.test/blog-cover.webp");
    await page.reload({ waitUntil: "networkidle" }); await page.getByRole("heading", { name: `Artigo revisado ${width}`, exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.evaluate(() => localStorage.clear());
  }
  console.log("Blog administration verified at 1440/768/390/320px: no overflow, modal scroll and actions, image upload, text edits, presentation save, inline errors, preserved input and persisted fixture reload. Real components with a simulated repository; no real tenant mutations.");
} finally { await browser.close(); await new Promise(done => server.close(done)); }
