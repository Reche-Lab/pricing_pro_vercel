import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = "/tmp/commerce-branding-browser";
await mkdir(output, { recursive: true });
const image = await readFile(process.env.COMMERCE_BROWSER_LOGO || resolve(root, "public/mockups/botton-25mm-v1/base-verso.png"));
const bundle = await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{CommerceBrandingFields}from'./src/components/commerce/CommerceBrandingFields';
  function Fixture(){const[logo,setLogo]=React.useState('/brand'),[icon,setIcon]=React.useState(''),[busy,setBusy]=React.useState(false);return <main className="mx-auto max-w-5xl p-5 text-zinc-100"><form onSubmit={event=>{event.preventDefault();window.submits=(window.submits||0)+1}}><CommerceBrandingFields name="Ground Shop" logoUrl={logo} faviconUrl={icon} onLogoChange={setLogo} onIconChange={setIcon} onBusyChange={setBusy}/><button type="submit" disabled={busy} className="mt-6 rounded-md bg-emerald-600 p-3">Salvar loja</button></form></main>}createRoot(document.getElementById('root')).render(<Fixture/>);`, loader: "tsx", resolveDir: root },
  bundle: true, write: false, format: "iife", jsx: "automatic", alias: { "@": resolve(root, "src") }, define: { "process.env.NODE_ENV": '"production"' },
});
const css = await postcss([tailwind({ content: [resolve(root, "src/components/commerce/CommerceBrandingFields.tsx"), resolve(root, "src/components/commerce/CommerceImageUpload.tsx"), { raw: '<main class="mx-auto max-w-5xl p-5 text-zinc-100"><button class="mt-6 rounded-md bg-emerald-600 p-3"></button></main>', extension: "html" }] })]).process("@tailwind base;@tailwind components;@tailwind utilities;body{margin:0;background:#09090b;font-family:system-ui,sans-serif}", { from: undefined });
let uploads = 0;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (path === "/app.js") { response.setHeader("content-type", "text/javascript"); return response.end(bundle.outputFiles[0].contents); }
  if (path === "/style.css") { response.setHeader("content-type", "text/css"); return response.end(css.css); }
  if (path === "/brand" || path === "/new-icon") { response.setHeader("content-type", process.env.COMMERCE_BROWSER_LOGO ? "image/webp" : "image/png"); return response.end(image); }
  if (path === "/api/commerce/admin/media" && request.method === "POST") {
    let raw = ""; for await (const chunk of request) raw += chunk;
    assert.equal(JSON.parse(raw).purpose, "icon"); uploads++;
    response.setHeader("content-type", "application/json"); return response.end(JSON.stringify({ url: "/new-icon" }));
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext();
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height }); await page.goto(origin);
    await page.getByRole("heading", { name: "Logo e ícone da loja" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
    const groups = page.getByRole("group");
    const boxes = await groups.evaluateAll(elements => elements.map(element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; }));
    assert.equal(boxes.length, 2);
    assert.ok(boxes[1].x >= boxes[0].x + boxes[0].width || boxes[1].y >= boxes[0].y + boxes[0].height, "Upload groups must not overlap");
    await page.screenshot({ path: `${output}/branding-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Enviar Ícone do navegador e Google").setInputFiles({ name: "icon.webp", mimeType: "image/webp", buffer: image });
  await page.getByRole("status").filter({ hasText: "Imagem enviada" }).waitFor();
  assert.equal(uploads, 1); assert.equal(await page.evaluate(() => window.submits || 0), 0);
  assert.equal(await page.getByAltText("Ícone na aba").getAttribute("src"), "/new-icon");
  await page.getByRole("button", { name: "Remover Ícone do navegador e Google" }).click();
  assert.equal(await page.getByAltText("Ícone na aba").getAttribute("src"), "/brand");
  assert.deepEqual(errors, []);
  console.log(`Branding responsive/upload checks passed. Screenshots: ${output}`);
} finally { await browser.close(); server.close(); }
