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
const root = fileURLToPath(new URL("../", import.meta.url)), output = "/tmp/commerce-studio-blend";
await mkdir(output, { recursive: true });
const model = JSON.parse(await readFile(resolve(root, "public/mockups/botton-25mm-v1/modelo.json"), "utf8"));
const products = [{ id: "botton", name: "Botton 3,5 cm", personalized: true, geometry: { shape: "circle", widthMm: 35, heightMm: 35, cornerRadiusMm: 0, rotationDegrees: 0 }, margins: { safeMarginMm: 3, bleedMm: 3 }, artworkOptions: { mockup: model } }];
const bundle = await build({
  stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import{StudioPersonalizer}from'./src/components/commerce/StudioPersonalizer';import store from'./src/components/commerce/store.module.css';import studio from'./src/components/commerce/studio.module.css';
    const theme=new URLSearchParams(location.search).get('theme')||'light';createRoot(document.getElementById('root')).render(<main className={store.store} data-theme={theme} style={{'--accent':theme==='dark'?'#79d8d0':'#047857','--accent-ink':theme==='dark'?'#081311':'#fff',minHeight:'100vh'}}><section className={studio.demo} aria-label='Estúdio de teste'><StudioPersonalizer products={${JSON.stringify(products)}} slug='test' base='/loja/test' autoDemo/></section></main>);`, loader: "tsx", sourcefile: "studio-fade-fixture.tsx", resolveDir: root },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", loader: { ".module.css": "local-css" }, alias: { "@": resolve(root, "src") }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "local-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|dynamic)$|studio-draft-cache$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path.endsWith("studio-draft-cache") ? "export async function readStudioDraft(){return null}export async function writeStudioDraft(){window.studioDraftWrites=(window.studioDraftWrites||0)+1;return true}" : args.path.endsWith("navigation") ? "export const useRouter=()=>({push:()=>{throw Error('Unexpected navigation')}})" : "export default function dynamic(){return()=>null}" }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const utilities = await postcss([tailwind({ content: [resolve(root, "src/components/commerce/StudioPersonalizer.tsx"), resolve(root, "src/components/commerce/StoreProductMockup.tsx")] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
assets.set("/tailwind.css", utilities.css);
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  try {
    assert.equal(request.method, "GET", "No mutations during the demo");
    assert.equal(path.startsWith("/api/"), false, "No API calls during the demo");
    response.setHeader("content-type", ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" })[extname(path)] || "text/html; charset=utf-8");
    if (path === "/") return response.end(html);
    if (assets.has(path)) return response.end(assets.get(path));
    const file = resolve(root, "public", `.${path}`);
    assert.ok(file.startsWith(resolve(root, "public") + "/")); response.end(await readFile(file));
  } catch (error) { response.writeHead(400); response.end(error.message); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const settleStage = stage => page.waitForFunction(stage => document.querySelector("[data-studio-demo-stage]")?.dataset.studioDemoStage === String(stage) && document.querySelector("[data-studio-demo-transition]")?.dataset.studioDemoTransition === "idle", stage);
  const pixels = () => page.locator("canvas").evaluateAll(canvases => canvases.map(canvas => {
    const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let filled = 0, signature = 0;
    for (let index = 0; index < bytes.length; index += 4) { if (bytes[index + 3]) filled++; signature = (signature + bytes[index] * (index % 97 + 1) + bytes[index + 1]) % 1000000007; }
    return { filled, signature, width: canvas.width };
  }));
  for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height }); await page.goto(`${origin}/?theme=${theme}`);
    await settleStage(0);
    const first = await pixels(); assert.equal(first.length, 2); assert.ok(first.every(face => face.width === 256 && face.filled > 10000));
    assert.notEqual(first[0].signature, first[1].signature);
    await page.evaluate(() => {
      window.studioSamples = []; window.studioSampling = true;
      const pair = document.querySelector("[data-studio-demo-transition] canvas").closest("section").parentElement, controls = document.querySelector('fieldset[aria-label="Criação da arte"]');
      const thumbnail = document.createElement("canvas"); thumbnail.width = thumbnail.height = 32; const ctx = thumbnail.getContext("2d");
      function sample(time) {
        if (!window.studioSampling) return;
        const faces = [...pair.querySelectorAll("canvas")].map(canvas => {
          ctx.clearRect(0, 0, 32, 32); ctx.drawImage(canvas, 0, 0, 32, 32);
          const bytes = ctx.getImageData(0, 0, 32, 32).data;
          let signature = 0; for (let index = 0; index < bytes.length; index += 4) signature = (signature + bytes[index] * (index % 97 + 1) + bytes[index + 1]) % 1000000007;
          return { alpha: canvas.getContext("2d").getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3], signature, state: canvas.dataset.mockupTransition };
        });
        window.studioSamples.push({ time, faces, opacity: Number(getComputedStyle(pair).opacity), controlsOpacity: Number(getComputedStyle(controls).opacity) });
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    if (theme === "light" && width === 1440 || theme === "dark" && width === 390) {
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some(canvas => canvas.dataset.mockupTransition === "blending"));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${output}/blend-${theme}-${width}.png` });
      for (let stage = 1; stage <= 4; stage++) {
        await settleStage(stage);
        const current = await pixels(); assert.ok(current.every(face => face.filled > 10000));
        if (stage === 1) assert.notEqual(current[0].signature, first[0].signature);
      }
      await settleStage("complete");
      const samples = await page.evaluate(() => { window.studioSampling = false; return window.studioSamples; });
      assert.ok(samples.length > 50);
      assert.ok(samples.every(frame => frame.opacity === 1 && frame.controlsOpacity === 1), "Preview and controls never fade away");
      assert.ok(samples.every(frame => frame.faces.length === 2 && frame.faces.every(face => face.alpha >= 253)), "Product center remains opaque in every sampled frame");
      for (let side = 0; side < 2; side++) {
        const mixed = samples.flatMap(frame => frame.faces[side]?.state === "blending" ? [frame.faces[side].signature] : []);
        assert.ok(new Set(mixed).size > 8, "Both faces display intermediate pixel compositions, not a hard swap");
      }
      assert.equal(await page.evaluate(() => window.studioDraftWrites || 0), 0, "Automatic demonstration never saves a draft");
      await page.getByRole("button", { name: "Criar minha arte", exact: true }).click();
    } else {
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some(canvas => canvas.dataset.mockupTransition === "blending"));
      await page.getByRole("button", { name: "Pular demonstração" }).click();
      assert.equal(await page.locator("[data-studio-demo-transition]").getAttribute("data-studio-demo-transition"), "idle");
      assert.equal(await page.getByLabel("Sua mensagem").inputValue(), "Sua ideia\nganha forma");
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].every(canvas => canvas.dataset.mockupTransition !== "blending"));
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `${output}/studio-${theme}-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []); console.log(`Passed continuous studio blend ${theme} ${width}px`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.reload(); await settleStage("complete");
  const controls = page.getByRole("group", { name: "Criação da arte", exact: true });
  assert.deepEqual(await controls.evaluate(element => ({ opacity: getComputedStyle(element).opacity, duration: getComputedStyle(element).transitionDuration })), { opacity: "1", duration: "0s" });
  assert.equal(await page.getByLabel("Sua mensagem").inputValue(), "Sua ideia\nganha forma");
  assert.deepEqual(errors, []); console.log(`Studio continuous blend checks passed. Screenshots: ${output}`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
