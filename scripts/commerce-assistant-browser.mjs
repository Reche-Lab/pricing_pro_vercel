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
const root = fileURLToPath(new URL("../", import.meta.url)), output = "/tmp/commerce-assistant-browser";
await mkdir(output, { recursive: true });
const ids = { product: "00000000-0000-4000-8000-000000000001", conversation: "00000000-0000-4000-8000-000000000002", action: "00000000-0000-4000-8000-000000000003", quote: "00000000-0000-4000-8000-000000000004" };
const company = { legalName: "Empresa de teste", document: "11.222.333/0001-81", address: "Rua de teste, 100", bankName: "Banco de teste", agency: "0001", account: "123-4", accountType: "Conta empresarial", beneficiary: "Empresa de teste", pixKey: "financeiro@example.test" };
const assistant = { name: "Assistente Ground Shop", welcome: "Olá! Vamos encontrar o produto ideal para sua ideia? Posso ajudar com produtos, artes e orçamento.", tone: "friendly", about: "Produtos personalizados para eventos e campanhas.", businessHours: "Segunda a sexta, das 9h às 18h", retentionDays: 30, faq: [], allowQuotes: true, allowOrders: true, company };
let admin = { tenant_id: "tenant-test", settings: assistant, revision: 1, enabled: false, tested_revision: null };
const policy = { allowed: true, model: "openai/gpt-4.1-mini", monthlyCalls: 500, monthlyTokens: 2000000, monthlyUsd: 10, visitorDailyTurns: 20, revision: 1 };
const settings = { name: "Ground Shop", description: "Produtos personalizados", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "+55 (12) 99999-1234", pickupEnabled: true, pickupAddress: "Rua de teste, 100", deliveryEnabled: false, deliveryDescription: "", deliveryCents: 0, terms: "Condições de teste" };
const product = { id: ids.product, name: "Botton - 3,5 cm", description: "Personalizado para sua campanha", category: "Bottons", imageUrl: "/mockups/botton-25mm-v1/base-verso.png", minQuantity: 1, maxQuantity: 1000, maxArtworks: 10, personalized: true, unitCents: 500 };
const cart = { revision: 1, customer: { id: "buyer-test", name: "Cliente de teste", email: "cliente@example.test" }, lines: [{ id: ids.product, productId: ids.product, quantity: 20, artworkName: "Campanha", artworkId: null, preparation: "customer" }], artworks: [], payments: { mp_enabled: false, manual_enabled: true }, calculation: { totalCents: 6000, baseSubtotalCents: 6000, artworkDiscountCents: 0, items: [{ id: ids.product, productId: ids.product, name: product.name, quantity: 20, artworkName: "Campanha", unitCents: 300, totalCents: 6000 }] } };
const billing = { name: "Cliente de teste", email: "fiscal@example.test", phone: "11999990000", document: "52998224725", postalCode: "01001000", street: "Praça de teste", number: "100", complement: "", district: "Centro", city: "São Paulo", state: "SP", attention: "" };
let history = [], requests = [], conversationStarted = false, confirmedActionIds = [];
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {StoreAssistantLauncher} from './src/components/commerce/StoreAssistantLauncher';
    import {StoreShippingOptions} from './src/components/commerce/StoreShippingOptions';
    import {StoreCheckout} from './src/components/commerce/StoreCheckout';
    import {CommerceAssistantSettings} from './src/components/commerce/CommerceAssistantSettings';
    import {CommerceAssistantPolicies} from './src/components/superadmin/CommerceAssistantPolicies';
    import store from './src/components/commerce/store.module.css';
    const query = new URLSearchParams(location.search), theme = query.get('theme') || sessionStorage.getItem('fixture-theme') || 'light';
    sessionStorage.setItem('fixture-theme', theme);
    const quotePage = location.pathname === '/loja/test/orcamento';
    const content = quotePage ? <><h1>Dados do orçamento</h1><StoreCheckout cart={${JSON.stringify(cart)}} settings={${JSON.stringify(settings)}} base="/loja/test" api="/api/store/test" intent="quote" disabled={false} onSubmit={async()=>{}}/></> : <><h1 style={{fontSize:28}}>Produtos personalizados</h1><p>Catálogo de teste local do assistente.</p><StoreShippingOptions options={[{id:'sedex',name:'Correios - SEDEX',priceCents:2200,transitDays:2,insuranceValueCents:9500},{id:'pac',name:'Correios - PAC',priceCents:1500,transitDays:6,insuranceValueCents:9500}]} selectedId="sedex" onSelect={()=>{}} quantity={100}/></>;
    createRoot(document.getElementById('root')).render(query.has('admin') ? <main className="min-h-screen bg-zinc-950 p-5 text-zinc-100"><div className="mx-auto max-w-5xl"><CommerceAssistantSettings storeName="Ground Shop" storeSlug="ground-shop"/><CommerceAssistantPolicies/></div></main> : <main className={store.store} data-theme={theme} style={{'--accent':theme==='dark'?'#79d8d0':'#047857','--accent-ink':theme==='dark'?'#081311':'#fff'}}><header style={{padding:24,borderBottom:'1px solid var(--line)'}}>Ground Shop</header><section style={{minHeight:'100vh',padding:24}}>{content}</section><StoreAssistantLauncher api="/api/store/test" base="/loja/test" settings={${JSON.stringify(settings)}} buyerId="buyer-test" onCartChanged={async()=>{}}/></main>);
  `, loader: "tsx", sourcefile: "assistant-fixture.tsx", resolveDir: root },
  bundle: true, write: false, outfile: "app.js", format: "iife", jsx: "automatic", loader: { ".module.css": "local-css" }, alias: { "@": resolve(root, "src") }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "next-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|dynamic)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", resolveDir: root, contents: args.path.endsWith("link") ? "import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}" : "import React,{lazy,Suspense}from'react';export default function dynamic(load){const C=lazy(()=>load().then(defaultExport=>({default:defaultExport})));return props=>React.createElement(Suspense,{fallback:React.createElement('p',{role:'status'},'Abrindo atendimento…')},React.createElement(C,props))}" }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [`/${file.path.split("/").at(-1)}`, file.contents]));
const utilities = await postcss([tailwind({ content: [resolve(root, "src/components/commerce/CommerceAssistantSettings.tsx"), resolve(root, "src/components/superadmin/CommerceAssistantPolicies.tsx"), resolve(root, "src/components/commerce/Store*.tsx"), resolve(root, "src/components/commerce/LibraryUI.tsx")] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
assets.set("/tailwind.css", utilities.css);
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  try {
    response.setHeader("cache-control", "no-store");
    if (path.startsWith("/api/")) {
      let raw = ""; for await (const chunk of request) raw += chunk; const body = raw ? JSON.parse(raw) : {};
      requests.push({ path, body, method: request.method }); response.setHeader("content-type", "application/json");
      const json = value => response.end(JSON.stringify(value));
      if (path === "/api/commerce/admin/assistant") {
        if (request.method === "PUT") admin = { ...admin, settings: body.settings, revision: admin.revision + 1, enabled: false, tested_revision: null };
        if (body.action === "test") admin.tested_revision = admin.revision;
        if (body.action === "enable") admin.enabled = true;
        if (body.action === "preview") return json({ answer: { text: "Sou o assistente virtual. Confira os produtos oficiais abaixo.", cards: [{ kind: "products", products: [product] }] }, message: "Consulta de teste concluída sem criar carrinho." });
        if (request.method !== "GET") return json({ config: admin, answer: body.action === "test" ? "Olá! Sou o assistente virtual desta loja." : null, message: body.action === "enable" ? "Assistente ativado na loja." : "Configuração atualizada." });
        return json({ config: admin, defaults: assistant, ready: true, storageReady: true, policy, fallbackModel: "google/gemini-3.1-flash-lite", documents: [], metrics: { conversations: 0, handoffs: 0, usage: { calls: 1, tokens: 120, cost_usd: .001 }, events: [] }, conversations: [] });
      }
      if (path === "/api/superadmin/commerce-assistant") return json({ models: [policy.model, "google/gemini-3.1-flash-lite"], tenants: [{ id: "tenant-test", name: "Ground Shop", slug: "ground-shop", policy, usage: { calls: 1, tokens: 120, cost_usd: .001 } }] });
      if (path.endsWith("/cart")) return json(cart);
      if (path.endsWith("/checkout-draft")) return json({ version: 1, draft: { billing, address: billing, same: true, delivery: "pickup" } });
      if (path.endsWith("/quotes")) return json({ id: ids.quote });
      if (request.method === "GET") return json({ enabled: true, name: assistant.name, welcome: assistant.welcome, retentionDays: 30, quotes: true, orders: true });
      if (body.action === "resume") return json({ conversation: conversationStarted ? { id: ids.conversation } : null, messages: conversationStarted ? history : [], customer: true, confirmedActionIds });
      if (body.action === "start") { conversationStarted = true; return json({ conversation: { id: ids.conversation }, messages: history, customer: true, confirmedActionIds }); }
      if (body.action === "confirm") {
        if (!confirmedActionIds.includes(body.actionId)) { confirmedActionIds.push(body.actionId); history.push({ id: crypto.randomUUID(), role: "assistant", text: "Rascunho atualizado. Como deseja continuar?", cards: [{ kind: "cart", items: cart.calculation.items, totalCents: cart.calculation.totalCents }] }); }
        return json({ cart, messages: history, message: "Rascunho atualizado." });
      }
      if (body.action === "clear") { history = []; conversationStarted = false; confirmedActionIds = []; return json({ cleared: true }); }
      if (body.action === "handoff") return json({ summary: "Cliente deseja orientação para sua campanha.", message: "Solicitação registrada para a equipe." });
      if (body.action === "quote_saved") { history.push({ id: "saved", role: "assistant", text: "Seu orçamento está salvo.", cards: [{ kind: "quote_saved", quoteId: ids.quote, totalCents: 6000 }] }); return json({ messages: history }); }
      if (body.action === "message") {
        const adding = body.text === "Quero acrescentar outro produto ao orçamento.";
        const continuing = body.text === "Pode seguir com o orçamento";
        const cards = continuing ? [{ kind: "quote_continue" }] : adding ? [{ kind: "products", products: [product] }] : body.text.includes("orçamento") ? [{ kind: "proposal", desiredQuantities: true, actionId: ids.action, items: cart.calculation.items, totalCents: 6000, expiresAt: "2099-01-01T00:00:00Z" }] : body.text.includes("empresa") ? [{ kind: "company", company, documents: [] }] : body.text.includes("frete") ? [{ kind: "shipping", options: [{ id: "sedex", name: "Correios - SEDEX", priceCents: 2200, insuranceValueCents: 9500, estimate: { productionDays: 3, transportDays: 2, deliveryDate: "2026-11-20" } }], warnings: [] }] : [{ kind: "products", products: [product] }];
        const selected = body.text.startsWith('Tenho interesse no produto "');
        history.push({ id: body.messageId, role: "user", text: body.text, cards: [] }, { id: crypto.randomUUID(), role: "assistant", text: continuing ? "Vamos continuar pelo botão abaixo." : selected ? "Quantas unidades você precisa?" : adding ? "Qual outro produto você deseja?" : "Confira as opções abaixo.", cards: selected ? [] : cards });
        response.setHeader("content-type", "application/x-ndjson"); return response.end(JSON.stringify({ type: "status", text: "Consultando catálogo…" }) + "\n" + JSON.stringify({ type: "done", messages: history }) + "\n");
      }
      throw new Error("Unsupported fixture API");
    }
    const pagePath = path === "/" || path === "/loja/test/orcamento" || path.startsWith("/loja/test/produto/");
    response.setHeader("content-type", pagePath ? "text/html; charset=utf-8" : ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png" })[extname(path)] || "application/octet-stream");
    if (pagePath) return response.end(html); if (assets.has(path)) return response.end(assets.get(path));
    const file = resolve(root, "public", `.${path}`); if (!file.startsWith(resolve(root, "public") + "/")) throw new Error(); response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext(); await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
    history = []; requests = []; conversationStarted = false; confirmedActionIds = []; await page.setViewportSize({ width, height }); await page.goto(`${origin}/?theme=${theme}`);
    const shipping = page.getByRole("group", { name: "Opções de entrega" });
    assert.doesNotMatch(await shipping.innerText(), /seguro|valor declarado/i);
    await shipping.screenshot({ path: `${output}/shipping-${theme}-${width}.png` });
    await page.getByRole("button", { name: "Abrir assistente virtual da loja" }).click();
    assert.doesNotMatch(await page.getByRole("dialog").innerText(), /openrouter|provedor|\bZDR\b|guardrails/i);
    await page.screenshot({ path: `${output}/consent-${theme}-${width}.png` });
    await page.getByRole("button", { name: "Entendi, iniciar atendimento" }).click();
    await page.getByRole("button", { name: "Quero conhecer os produtos" }).click();
    await page.getByRole("link", { name: "Conhecer produto" }).waitFor();
    const box = await page.getByRole("dialog").boundingBox(); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, "Chat fits the viewport");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const image = page.getByRole("dialog").locator("img"); await image.evaluate(image => image.decode());
    await page.getByRole("button", { name: `Quero este produto: ${product.name}`, exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/chat-${theme}-${width}.png` });
    await page.getByRole("button", { name: `Quero este produto: ${product.name}`, exact: true }).click();
    await page.getByText("Quantas unidades você precisa?", { exact: true }).waitFor();
    assert.equal(requests.filter(r => r.body.action === "message" && r.body.text === `Tenho interesse no produto "${product.name}".`).length, 1);
    assert.equal(requests.some(r => r.body.action === "confirm"), false);
    await page.getByRole("link", { name: "Conhecer produto", exact: true }).click();
    await page.waitForURL(`**/loja/test/produto/${product.id}`);
    await page.getByRole("button", { name: "Abrir assistente virtual da loja" }).click();
    await page.getByText("Quantas unidades você precisa?", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Entendi, iniciar atendimento" }).count(), 0);
    assert.equal(requests.filter(r => r.body.action === "start").length, 1);
    await page.getByRole("button", { name: "Fechar atendimento" }).click();
    await page.getByRole("button", { name: "Abrir assistente virtual da loja" }).click();
    await page.getByText("Quantas unidades você precisa?", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Entendi, iniciar atendimento" }).count(), 0);
    await page.getByText("Quantas unidades você precisa?", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/resumed-${theme}-${width}.png` });
    await page.getByRole("textbox", { name: "Mensagem para o assistente" }).fill("Quero consultar o frete"); await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await page.getByText("Frete e produção · estimativa", { exact: true }).waitFor();
    assert.doesNotMatch(await page.getByRole("dialog").innerText(), /seguro|valor declarado/i);
    await page.getByText("Frete e produção · estimativa", { exact: true }).locator("..").screenshot({ path: `${output}/freight-chat-${theme}-${width}.png` });
    await page.getByRole("textbox", { name: "Mensagem para o assistente" }).fill("Quero um orçamento"); await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await page.getByRole("button", { name: "Confirmar atualização do orçamento" }).click();
    await page.getByText("Rascunho do seu orçamento", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Alterar itens do orçamento", exact: true }).getAttribute("href"), "/loja/test/orcamento");
    await page.getByRole("button", { name: "Adicionar outro produto", exact: true }).click();
    await page.getByText("Qual outro produto você deseja?", { exact: true }).waitFor();
    assert.equal(requests.filter(r => r.body.action === "confirm").length, 1);
    const draft = page.getByText("Rascunho do seu orçamento", { exact: true }).locator("..");
    await draft.screenshot({ path: `${output}/quote-next-steps-${theme}-${width}.png` });
    await page.getByRole("textbox", { name: "Mensagem para o assistente" }).fill("Pode seguir com o orçamento");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    const next = page.getByRole("link", { name: "Continuar orçamento", exact: true }); await next.waitFor();
    assert.equal(await next.getAttribute("href"), "/loja/test/orcamento?etapa=dados");
    assert.doesNotMatch(await page.getByRole("dialog").innerText(), /\[Link para|https:\/\//i);
    await page.getByText("Seu orçamento completo", { exact: true }).locator("..").screenshot({ path: `${output}/quote-continue-${theme}-${width}.png` });
    await next.click(); await page.waitForURL("**/loja/test/orcamento?etapa=dados");
    await page.getByRole("heading", { name: "Dados do orçamento", exact: true }).waitFor();
    await page.getByRole("button", { name: "Revisar orçamento", exact: true }).waitFor();
    await page.getByRole("button", { name: "Abrir assistente virtual da loja" }).click();
    await page.getByRole("link", { name: "Continuar orçamento", exact: true }).waitFor();
    await page.getByRole("button", { name: "Continuar para orçamento completo" }).click();
    const quoteForm = page.getByRole("dialog", { name: "Seu orçamento · dados e confirmação", exact: true });
    await quoteForm.screenshot({ path: `${output}/quote-form-${theme}-${width}.png` });
    await quoteForm.getByRole("button", { name: "Revisar orçamento" }).click();
    await quoteForm.getByRole("button", { name: "Salvar orçamento e acessar PDF" }).click();
    const pdf = page.getByRole("link", { name: "Baixar PDF" }); await pdf.waitFor(); assert.equal(await pdf.getAttribute("href"), `/api/store/test/quotes/${ids.quote}/pdf`);
    assert.equal(requests.filter(r => r.body.action === "confirm").length, 1);
    assert.equal(JSON.stringify(requests.filter(r => r.path.endsWith("/assistant"))).includes(billing.document), false);
    await page.getByRole("button", { name: "Fechar atendimento" }).click();
    await page.getByRole("button", { name: "Abrir assistente virtual da loja" }).click();
    await page.getByRole("button", { name: "Orçamento atualizado", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Orçamento atualizado", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Fechar atendimento" }).click();
    await page.getByRole("button", { name: "Abrir assistente virtual da loja" }).waitFor();
    console.log(`Passed chat, proposal and quote form ${theme} ${width}x${height}`);
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(`${origin}/?admin=1`);
    await page.getByRole("button", { name: "Informações oficiais" }).click();
    await page.getByText(/fallback: google\/gemini-3.1-flash-lite/).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `${output}/admin-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Laboratório", exact: true }).click();
    await page.getByRole("button", { name: "Consultar no laboratório" }).click();
    await page.getByText("Sou o assistente virtual. Confira os produtos oficiais abaixo.").waitFor();
    if (width === 1440) {
      await page.getByRole("button", { name: "Atendimento", exact: true }).click();
      await page.getByLabel("Nome do assistente", { exact: true }).fill("Assistente personalizado Ground Shop");
      await page.getByRole("button", { name: "Salvar e preparar novo teste" }).click();
      await page.getByText("Configuração atualizada.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Testar conexão OpenRouter" }).click();
      await page.getByRole("checkbox", { name: /Revisei as respostas/ }).check();
      await page.getByRole("button", { name: "Ativar assistente na loja" }).click();
      await page.getByText("Assistente ativado na loja.", { exact: true }).waitFor();
    }
  }
  assert.deepEqual(errors, []); console.log(`Browser checks passed. Screenshots: ${output}`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
