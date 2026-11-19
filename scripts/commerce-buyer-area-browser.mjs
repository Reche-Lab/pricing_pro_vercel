import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
const require = createRequire(import.meta.url), { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url)), output = "/tmp/commerce-buyer-area";
const paletteOnly = process.env.COMMERCE_BROWSER_PRODUCT_PALETTE_ONLY === "true";
const discoveryOnly = process.env.COMMERCE_BROWSER_DISCOVERY_ONLY === "true" || paletteOnly;
await mkdir(output, { recursive: true });
const products = [{ id: "00000000-0000-4000-8000-000000000001", slug: "botton-3-5-cm", name: "Botton - 3,5 cm", description: "Personalizado", category: "Bottons", imageUrl: "/mockups/botton-25mm-v1/base-verso.png", personalized: true, minQuantity: 1, maxQuantity: 1000, maxArtworks: 10, unitCents: 500, offer: { originalUnitCents: 500, minimumUnitCents: 300, maxDiscountPercent: 40, discountQuantity: 100 }, geometry: null, margins: { bleedMm: 2, safeMarginMm: 2 } }];
const pricingBundle = await build({ stdin: { contents: "export {commerceQuantityPricing} from './src/domain/commerce/quantity-pricing';export {calculateCart} from './src/domain/commerce/commerce';", resolveDir: root, loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", alias: { "@": resolve(root, "src") } });
const { commerceQuantityPricing, calculateCart } = await import(`data:text/javascript;base64,${Buffer.from(pricingBundle.outputFiles[0].contents).toString("base64")}`);
const pricingProduct = { ...products[0], pricingRule: "per_art", curve: { mode: "step", points: [{ quantity: 1, unitPrice: 5 }, { quantity: 100, unitPrice: 3 }, { quantity: 1000, unitPrice: 2 }] }, platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 } };
products[0].quantityPricing = commerceQuantityPricing(pricingProduct);
products[0].pricingRule = "per_art";
products[0].offer = { originalUnitCents: 500, minimumUnitCents: 200, maxDiscountPercent: 60, discountQuantity: 1000 };
const billing = { name: "Cliente de teste", email: "cliente@example.test", phone: "11999990000", document: "52998224725", personType: "F", postalCode: "01001000", street: "Praça de teste", number: "100", complement: "", district: "Centro", city: "São Paulo", state: "SP", attention: "" };
const settings = { name: "Ground Shop", description: "Personalizados", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "", pickupEnabled: true, pickupAddress: "Rua da loja, 100", carrierEnabled: false, deliveryEnabled: true, deliveryCents: 1200, deliveryDescription: "Entrega local", terms: "Condições da loja" };
const items = [{ id: "line", productId: products[0].id, name: products[0].name, artworkName: "Campanha de novembro", quantity: 30, unitCents: 500, totalCents: 15000 }];
const orders = ["aaaaaaaa", "bbbbbbbb", "cccccccc"].map((code, index) => ({
  id: `${code}-0000-4000-8000-000000000001`, created_at: `2026-11-${15 - index}T12:00:00Z`, items, subtotal_cents: 15000, shipping_cents: 1200, total_cents: 16200,
  payment_status: ["paid", "pending", "refunded"][index], fulfillment_status: ["production", "received", "received"][index], provider: "manual", payment_environment: "production",
  billing, address: billing, deliveryAddressSameAsBilling: true, delivery: "delivery", shippingOption: { id: "sedex", name: "Correios - SEDEX", priceCents: 1200 },
  production: { productionDays: 3, transportDays: 2, deliveryDate: "2026-11-24" }, artworkDiscountCents: 0, hasTerms: true, termsVersion: "teste",
}));
const cart = { customer: { id: "buyer", name: "Cliente de teste", email: "cliente@example.test" }, revision: 1, lines: [], artworks: [], calculation: { totalCents: 0, items: [] }, payments: { manual_enabled: true, mp_enabled: false, manual_instructions: "Realize o pagamento combinado com a loja." } };
let session = "member", orderError = false, calls = [];
const bundle = await build({ stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import{Storefront}from'./src/components/commerce/Storefront';import{CommerceSearchSettings}from'./src/components/commerce/CommerceSearchSettings';import{CommerceMerchantProduct}from'./src/components/commerce/CommerceMerchantProduct';
  const query=new URLSearchParams(location.search),theme=query.get('theme')||sessionStorage.getItem('buyer-theme')||'light',storeStyle=query.get('style')||sessionStorage.getItem('buyer-style')||'classic';sessionStorage.setItem('buyer-theme',theme);sessionStorage.setItem('buyer-style',storeStyle);localStorage.setItem('commerce-theme:test',theme);const experience=storeStyle==='studio'?{style:'studio',motion:false}:undefined;
  function SearchFixture(){const[value,setValue]=React.useState();return <main style={{background:'#09090b',color:'#f4f4f5',minHeight:'100vh',padding:'24px'}}><div style={{maxWidth:'1100px',margin:'auto'}}><CommerceSearchSettings publicUrl={location.origin} published selectedProducts={1} onCatalog={()=>{}}/><CommerceMerchantProduct value={value} onChange={setValue}/></div></main>}
  const base=location.pathname.startsWith('/loja/test')?'/loja/test':'',path=location.pathname.slice(base.length).split('/').filter(Boolean);createRoot(document.getElementById('root')).render(path[0]==='admin-search'?<SearchFixture/>:<Storefront slug='test' settings={{...${JSON.stringify(settings)},...(experience?{experience}:{})}} products={${JSON.stringify(products)}} path={path} basePath={base} paused={false}/>);`, loader: "tsx", sourcefile: "buyer-area-fixture.tsx", resolveDir: root },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", loader: { ".module.css": "local-css" }, alias: { "@": resolve(root, "src") }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation|dynamic)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", resolveDir: root, contents: args.path.endsWith("navigation") ? "const query=new URLSearchParams(location.search),router={push:url=>location.assign(url)};export const useSearchParams=()=>query;export const useRouter=()=>router" : args.path.endsWith("link") ? "import React from'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}" : "import React,{lazy,Suspense}from'react';export default function dynamic(load,options){const C=lazy(()=>load().then(value=>({default:value})));return props=>React.createElement(Suspense,{fallback:options?.loading?React.createElement(options.loading):null},React.createElement(C,props))}" }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const utilities = await postcss([tailwind({ content: [resolve(root, "src/components/commerce/*.tsx")] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined }); assets.set("/tailwind.css", utilities.css);
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname; response.setHeader("cache-control", "no-store");
  try {
    if (path.startsWith("/api/")) {
      let raw = ""; for await (const chunk of request) raw += chunk; const body = raw ? JSON.parse(raw) : null;
      calls.push({ path, method: request.method, body }); response.setHeader("content-type", "application/json"); const json = value => response.end(JSON.stringify(value));
      if (path.endsWith("/auth") && request.method === "POST") { assert.deepEqual(body, { action: "logout" }); session = "guest"; return json({ ok: true }); }
      if (path.endsWith("/price") && request.method === "POST") {
        assert.ok(body.lines.every(line => line.productId === products[0].id), "Friendly navigation must keep UUIDs in pricing");
        return json(calculateCart(body.lines, [pricingProduct]));
      }
      assert.equal(request.method, "GET", "No purchase/payment/artwork mutation");
      if (path.endsWith("/cart")) {
        await new Promise(done => setTimeout(done, 400));
        if (session === "error") { response.writeHead(503); return json({ error: "Conexão indisponível" }); }
        return json({ ...cart, customer: session === "guest" ? null : cart.customer });
      }
      if (path.endsWith("/assistant")) return json({ enabled: false });
      if (path.endsWith("/orders")) { if (orderError) { response.writeHead(503); return json({ error: "Pedidos indisponíveis. Tente novamente." }); } return json({ orders }); }
      if (path.endsWith("/artworks")) return json({ proofs: [], editable: false });
      if (path.endsWith("/quotes")) return json({ quotes: [] });
      throw new Error(`Unexpected fixture API: ${path}`);
    }
    const isPage = path.startsWith("/loja/") || ["/conta", "/pedidos", "/orcamentos", "/catalogo", "/produto/", "/admin-search"].some(prefix => path.startsWith(prefix));
    response.setHeader("content-type", isPage ? "text/html; charset=utf-8" : ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png" })[extname(path)] || "application/octet-stream");
    if (isPage) return response.end(html); if (assets.has(path)) return response.end(assets.get(path));
    const file = resolve(root, "public", `.${path}`); assert.ok(file.startsWith(resolve(root, "public") + "/")); response.end(await readFile(file));
  } catch (error) { response.writeHead(400); response.end(JSON.stringify({ error: error.message })); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done)); const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => { window.loginFlashes = 0; new MutationObserver(() => { if ([...document.querySelectorAll("h2")].some(element => element.textContent === "Entre ou crie sua conta")) window.loginFlashes++; }).observe(document, { childList: true, subtree: true }); });
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const fits = async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) {
      console.error("Overflow diagnostics", page.url(), await page.evaluate(() => [...document.querySelectorAll("main *")].filter(el => { const rect = el.getBoundingClientRect(); return rect.width && (rect.right > innerWidth + 1 || rect.left < -1); }).slice(0, 18).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, scroll: el.scrollWidth, overflow: getComputedStyle(el).overflowX }))));
      await page.screenshot({ path: `${output}/overflow.png`, fullPage: true });
    }
    assert.equal(overflow, false, "No horizontal overflow");
  };
  const noLoginFlash = async () => assert.equal(await page.evaluate(() => window.loginFlashes), 0, "No login form flash for a signed-in or unresolved session");
  if (!discoveryOnly) for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
    session = "member"; await page.setViewportSize({ width, height });
    await page.goto(`${origin}/loja/test/pedidos?theme=${theme}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Meus pedidos", exact: true }).waitFor(); await noLoginFlash();
    const list = page.getByRole("article"); assert.equal(await list.count(), 3);
    const positions = await list.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top)); assert.ok(positions.every((top, index) => !index || top > positions[index - 1]));
    await page.getByRole("combobox", { name: "Pagamento", exact: true }).selectOption("paid"); assert.equal(await list.count(), 1);
    await page.getByRole("searchbox", { name: "Buscar pedido", exact: true }).fill("inexistente"); await page.getByText("Nenhum pedido corresponde à busca", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click(); await fits();
    await page.screenshot({ path: `${output}/orders-${theme}-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Minha conta", exact: true }).click();
    const menu = page.getByRole("navigation", { name: "Atalhos da minha conta" }); await menu.waitFor();
    assert.equal(await menu.getByRole("link", { name: "Minhas compras", exact: true }).getAttribute("href"), "/loja/test/pedidos");
    const menuBox = await menu.boundingBox(); assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1);
    await page.screenshot({ path: `${output}/menu-${theme}-${width}.png` }); await page.keyboard.press("Escape"); await menu.waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "Abrir pedido AAAAAAAA", exact: true }).click(); await page.getByRole("heading", { name: "Seu pedido", exact: true }).waitFor(); await noLoginFlash();
    assert.equal(await page.locator("details").first().getAttribute("open"), null);
    await page.getByRole("button", { name: "Minhas artes e aprovação", exact: true }).click(); await page.getByText("Este pedido não possui artes personalizadas.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Minhas artes e aprovação", exact: true }).click(); await fits();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/detail-${theme}-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Voltar aos meus pedidos", exact: true }).click(); await list.first().waitFor(); await noLoginFlash();
    await page.getByRole("link", { name: "Abrir pedido BBBBBBBB", exact: true }).click(); await page.getByRole("region", { name: "Orientações de pagamento", exact: true }).waitFor(); await fits();
    await page.getByRole("link", { name: "Ver pagamento", exact: true }).click();
    assert.deepEqual(errors, []); console.log(`Passed buyer area ${theme} ${width}x${height}`);
  }
  const contrast = (foreground, background) => {
    const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126,.7152,.0722][index], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
  };
  for (const style of paletteOnly ? ["classic", "studio"] : ["classic"]) for (const base of ["/loja/test", ""]) for (const theme of ["light", "dark"]) for (const width of [1440, 390, 320]) {
    session = "member"; await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}${base}/catalogo?theme=${theme}&style=${style}`);
    const card = page.locator("[data-product-card]").first(); await card.waitFor();
    assert.equal(await card.getAttribute("href"), `${base}/produto/botton-3-5-cm`);
    if (paletteOnly) {
      const colors = await card.evaluate(element => {
        const css = selector => { const node = element.querySelector(selector) || element.querySelector('[class*="discountBadge"]'), computed = getComputedStyle(node); return { color: computed.color, background: computed.backgroundColor }; };
        return { tag: css('[class*="productTag"]'), price: css('[class*="priceLine"]'), benefit: css('[class*="discountHeadline"]'), surface: getComputedStyle(element).backgroundColor };
      });
      assert.equal(colors.tag.color, theme === "light" ? "rgb(14, 96, 112)" : "rgb(217, 255, 251)");
      assert.equal(colors.tag.background, theme === "light" ? "rgb(231, 245, 251)" : "rgb(37, 79, 76)");
      assert.equal(colors.price.color, theme === "light" ? style === "studio" ? "rgb(32, 39, 35)" : "rgb(32, 48, 56)" : style === "studio" ? "rgb(244, 246, 243)" : "rgb(243, 246, 249)");
      assert.equal(colors.benefit.color, theme === "light" ? "rgb(22, 101, 52)" : "rgb(140, 222, 192)");
      for (const [foreground, background] of [[colors.tag.color, colors.tag.background], [colors.price.color, colors.surface], [colors.benefit.color, colors.benefit.background]]) assert.ok(contrast(foreground, background) >= 4.5, "Product text contrast must be at least 4.5:1");
      const title = card.locator("h3"), size = await title.boundingBox();
      await card.focus(); await page.waitForTimeout(250);
      assert.equal(await title.evaluate(element => getComputedStyle(element).color), theme === "light" ? "rgb(14, 96, 112)" : "rgb(111, 208, 201)");
      await card.hover(); await page.waitForTimeout(250);
      assert.equal(await title.evaluate(element => getComputedStyle(element).color), theme === "light" ? "rgb(14, 96, 112)" : "rgb(111, 208, 201)");
      assert.equal((await title.boundingBox()).height, size.height, "Hover must not change product title height");
      await fits(); await card.screenshot({ path: `${output}/palette-card-${style}-${base ? "platform" : "domain"}-${theme}-${width}.png` });
      await page.screenshot({ path: `${output}/palette-catalog-${style}-${base ? "platform" : "domain"}-${theme}-${width}.png`, fullPage: true });
    }
    await card.click(); await page.getByRole("heading", { name: products[0].name, exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Adicionar ao carrinho') && !button.disabled));
    assert.equal(new URL(page.url()).pathname, `${base}/produto/botton-3-5-cm`);
    await page.getByText("Ver tabela de preços", { exact: true }).click();
    assert.equal(await page.locator("tbody tr").count(), products[0].quantityPricing.rows.length);
    const recalculated = page.waitForResponse(response => response.url().endsWith("/price"));
    await page.getByRole("button", { name: "Simular 100 unidades com uma arte", exact: true }).click(); await recalculated;
    assert.equal(await page.getByLabel("Quantidade de produtos", { exact: true }).inputValue(), "100");
    if (paletteOnly) {
      assert.equal(await page.locator('[class*="savings"]').first().evaluate(element => getComputedStyle(element).color), theme === "light" ? "rgb(22, 101, 52)" : "rgb(140, 222, 192)");
      assert.equal(await page.locator('[class*="heading"] > span').filter({ hasText: "Até" }).first().evaluate(element => getComputedStyle(element).color), theme === "light" ? "rgb(22, 101, 52)" : "rgb(140, 222, 192)");
      await page.screenshot({ path: `${output}/palette-product-${style}-${base ? "platform" : "domain"}-${theme}-${width}.png`, fullPage: true });
    }
    await page.getByText("Posso enviar mais de uma arte?", { exact: true }).click();
    assert.ok(await page.getByText(/O preço considera separadamente a quantidade de cada arte/).count());
    await page.evaluate(() => scrollTo(0, 0));
    await fits(); await page.screenshot({ path: `${output}/product-url-${base ? "platform" : "domain"}-${theme}-${width}.png`, fullPage: true });
    assert.ok(calls.some(call => call.path.endsWith("/price") && call.body.lines[0].productId === products[0].id));
    assert.deepEqual(errors, []); console.log(`Passed friendly product URL ${base || "custom domain"} ${theme} ${width}px`);
  }
  for (const width of paletteOnly ? [] : [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(`${origin}/admin-search`);
    await page.getByRole("heading", { name: "Busca e catálogo", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Abrir Catálogo Merchant Center" }).getAttribute("href"), `${origin}/produtos.xml`);
    await page.locator("summary").filter({ hasText: "Catálogo Google" }).click();
    await page.getByRole("checkbox", { name: /Incluir no catálogo Google/ }).check();
    await page.getByRole("status").waitFor(); await page.getByRole("checkbox", { name: /não possui GTIN/ }).check();
    assert.equal(await page.getByRole("status").count(), 0);
    await page.getByText("Etapas de ativação", { exact: true }).click(); await fits();
    await page.screenshot({ path: `${output}/search-admin-${width}.png`, fullPage: true }); console.log(`Passed search administration ${width}px`);
  }
  if (!discoveryOnly) {
  const pendingOrder = orders[1];
  cart.lines = items.map(({ id, productId, quantity, artworkName }) => ({ id, productId, quantity, artworkName, artworkId: null }));
  cart.calculation = { totalCents: 15000, baseSubtotalCents: 15000, artworkDiscountCents: 0, items };
  cart.pendingOrder = { id: pendingOrder.id, total_cents: pendingOrder.total_cents, shipping_cents: pendingOrder.shipping_cents };
  for (const theme of ["light", "dark"]) for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/loja/test/carrinho?theme=${theme}`);
    await page.getByRole("heading", { name: "Seu carrinho", exact: true }).waitFor();
    await page.getByRole("link", { name: "Continuar pagamento", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Atualizar quantidade", exact: true }).isDisabled(), true);
    await fits(); await page.screenshot({ path: `${output}/pending-cart-${theme}-${width}.png`, fullPage: true });
    for (const label of ["Editar itens", "Salvar como orçamento", "Limpar carrinho"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      const dialog = page.getByRole("dialog"); await dialog.waitFor(); await fits();
      const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, "Pending purchase dialog fits viewport");
      await page.screenshot({ path: `${output}/pending-${label.split(" ")[0]}-${theme}-${width}.png`, fullPage: true });
      await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
    }
    await page.goto(`${origin}/loja/test/pedidos/${pendingOrder.id}?theme=${theme}`);
    await page.getByRole("button", { name: "Salvar como orçamento", exact: true }).waitFor();
    await fits(); await page.screenshot({ path: `${output}/pending-order-${theme}-${width}.png`, fullPage: true });
    console.log(`Passed pending purchase controls ${theme} ${width}px`);
  }
  cart.lines = []; cart.pendingOrder = null; cart.calculation = { totalCents: 0, items: [] };
  session = "error"; await page.goto(`${origin}/conta`); await page.getByRole("button", { name: "Tentar recuperar conta" }).waitFor(); await noLoginFlash();
  session = "member"; await page.getByRole("button", { name: "Tentar recuperar conta" }).click(); await page.getByRole("heading", { name: "Olá, Cliente de teste" }).waitFor(); await noLoginFlash();
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
  const menu = page.getByRole("navigation", { name: "Atalhos da minha conta" });
  assert.equal(await menu.getByRole("link", { name: "Meus orçamentos", exact: true }).getAttribute("href"), "/orcamentos");
  await menu.getByRole("link", { name: "Meus orçamentos", exact: true }).click(); await page.getByRole("heading", { name: "Meus orçamentos", exact: true }).waitFor(); await noLoginFlash();
  orderError = true; await page.goto(`${origin}/pedidos`); await page.getByRole("alert").waitFor(); assert.equal(await page.getByText("Nenhum pedido por aqui ainda", { exact: true }).count(), 0);
  orderError = false; await page.getByRole("button", { name: "Tentar novamente" }).click(); await page.getByRole("article").first().waitFor(); await noLoginFlash();
  await page.getByRole("button", { name: "Minha conta", exact: true }).click(); await page.getByRole("navigation", { name: "Atalhos da minha conta" }).getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("heading", { name: "Entre ou crie sua conta", exact: true }).waitFor(); assert.equal(await page.getByRole("article").count(), 0);
  }
  assert.ok(calls.filter(call => call.method !== "GET").every(call => call.path === "/api/store/test/auth" && call.body.action === "logout" || call.path === "/api/store/test/price"));
  assert.deepEqual(errors, []); console.log(`Buyer area checks passed. Screenshots: ${output}`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
