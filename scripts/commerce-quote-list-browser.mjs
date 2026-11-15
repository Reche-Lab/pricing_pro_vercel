import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";

const require = createRequire(import.meta.url), { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url)), output = "/tmp/commerce-quote-list-ui";
await mkdir(output, { recursive: true });
const day = 86400000, now = Date.now();
const quotes = [0, 1, 2, 3].map(index => ({
  id: `${["aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd"][index]}-0000-4000-8000-000000000001`,
  created_at: new Date(now - day * (index + 1)).toISOString(),
  valid_until: new Date(now + day * (index === 1 ? -1 : 7)).toISOString(),
  total_cents: [25750, 100000000, 9000, 42000][index], shipping_cents: [2200, null, 0, 1875][index],
}));
let state = "loaded", calls = [];
const bundle = await build({
  stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import{StoreBuyerQuotes}from'./src/components/commerce/StoreBuyerQuotes';import styles from'./src/components/commerce/store.module.css';
    const theme=new URLSearchParams(location.search).get('theme')||sessionStorage.getItem('theme')||'light';sessionStorage.setItem('theme',theme);
    const detail=location.pathname!='/loja/test/orcamentos';createRoot(document.getElementById('root')).render(<main className={styles.store} data-theme={theme} style={{'--accent':theme==='dark'?'#79d8d0':'#047857','--accent-ink':theme==='dark'?'#081311':'#fff',minHeight:'100vh'}}><header style={{padding:'20px 24px',borderBottom:'1px solid var(--line)',fontWeight:700}}>Ground Shop</header><div style={{maxWidth:1100,margin:'auto',padding:20}}>{detail?<h1>Destino do orçamento</h1>:<StoreBuyerQuotes api='/api/store/test' base='/loja/test' revision={1} hasCart={false} onRestored={async()=>{}}/>}</div></main>);`,
    loader: "tsx", sourcefile: "quote-list-fixture.tsx", resolveDir: root },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", loader: { ".module.css": "local-css" }, alias: { "@": resolve(root, "src") }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "next-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", resolveDir: root, contents: args.path.endsWith("navigation") ? "export const useRouter=()=>({push:url=>location.assign(url)})" : "import React from'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}" }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const utilities = await postcss([tailwind({ content: [resolve(root, "src/components/commerce/*.tsx")] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
assets.set("/tailwind.css", utilities.css);
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  response.setHeader("cache-control", "no-store");
  if (path.startsWith("/api/")) {
    calls.push({ path, method: request.method });
    assert.equal(request.method, "GET");
    response.setHeader("content-type", "application/json");
    if (state === "error") { response.writeHead(503); response.end(JSON.stringify({ error: "Não foi possível carregar seus orçamentos." })); }
    else response.end(JSON.stringify({ quotes: state === "empty" ? [] : quotes }));
    return;
  }
  response.setHeader("content-type", path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html; charset=utf-8");
  response.end(assets.get(path) || html);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const cards = () => page.getByRole("article");
  for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
    await page.setViewportSize({ width, height });
    state = "loaded"; await page.goto(`${origin}/loja/test/orcamentos?theme=${theme}`);
    await page.getByRole("article", { name: "Orçamento AAAAAAAA", exact: true }).waitFor();
    assert.equal(await cards().count(), 4);
    await page.getByRole("combobox", { name: "Validade", exact: true }).selectOption("review");
    assert.equal(await cards().count(), 1);
    assert.equal(await cards().first().getAttribute("aria-label"), "Orçamento BBBBBBBB");
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await page.getByRole("combobox", { name: "Ordenar por", exact: true }).selectOption("highest");
    assert.equal(await cards().first().getAttribute("aria-label"), "Orçamento BBBBBBBB");
    await page.getByRole("searchbox").fill("#CCCCCCCC"); assert.equal(await cards().count(), 1);
    await page.getByRole("searchbox").fill("inexistente");
    await page.getByRole("heading", { name: "Nenhum orçamento corresponde à busca." }).waitFor();
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No page overflow");
    assert.equal(await cards().locator("strong").evaluateAll(elements => elements.some(element => element.scrollWidth > element.clientWidth + 1)), false, "Amounts fit");
    await page.getByRole("link", { name: "Abrir orçamento AAAAAAAA" }).focus();
    await page.screenshot({ path: `${output}/list-${theme}-${width}.png`, fullPage: true });
    const pdf = page.getByRole("link", { name: "Baixar PDF do orçamento AAAAAAAA" });
    assert.equal(await pdf.getAttribute("href"), `/api/store/test/quotes/${quotes[0].id}/pdf`);
    assert.equal(await pdf.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); }), true, "PDF independent of stretched link");
    await cards().first().click({ position: { x: 70, y: 135 } });
    await page.waitForURL(`**/orcamentos/${quotes[0].id}`);
    await page.getByRole("heading", { name: "Destino do orçamento" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`Passed saved quote list ${theme} ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/loja/test/orcamentos`);
  await page.getByRole("link", { name: "Abrir orçamento AAAAAAAA" }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("link", { name: "Baixar PDF do orçamento AAAAAAAA" }).evaluate(element => element === document.activeElement), true, "PDF reachable separately by keyboard");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await cards().first().hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector("article")).transform !== "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await cards().first().evaluate(element => getComputedStyle(element).transform), "none", "Reduced motion disables card movement");
  state = "error"; await page.goto(`${origin}/loja/test/orcamentos`);
  await page.getByRole("alert").waitFor(); assert.equal(await page.getByText("Seu próximo projeto começa aqui").count(), 0);
  state = "loaded"; await page.getByRole("button", { name: "Tentar novamente" }).click(); await cards().first().waitFor();
  state = "empty"; await page.reload(); await page.getByRole("link", { name: "Montar meu primeiro orçamento" }).waitFor();
  assert.equal(calls.every(call => call.method === "GET" && call.path === "/api/store/test/quotes"), true);
  assert.deepEqual(errors, []);
  console.log(`Saved quote list checks passed. Screenshots: ${output}`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
