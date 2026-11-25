import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, stop } from "esbuild";

// Isolated fixtures: no application server, database, SMTP or external requests.
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ entryPoints: [`${root}src/services/email/email-layout.ts`], bundle: true, write: false, platform: "node", format: "esm" });
stop();
const { renderTransactionalEmail } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const brand = { name: "Ground Shop", url: "https://groundshop.com.br", logoUrl: "https://email-fixture.example.test/logo.jpg", accent: "#12a9d5", contactEmail: "atendimento@example.test", contactPhone: "+55 11 99999-0000" };
const receipt = {
  code: "GS202600", date: "25/11/2026 10:30",
  items: [{ name: "Botton personalizado · 3,5 cm", quantity: 50, unitCents: 300, totalCents: 15000, artworkName: "Campanha de conscientização" }, { name: "Ímã personalizado · 4,5 cm", quantity: 20, unitCents: 500, totalCents: 10000, artworkName: "Equipe de eventos" }],
  subtotalCents: 22500, shippingCents: 2590, artworkDiscountCents: 2500, totalCents: 25090,
};
const order = { brand, greeting: "Olá, Mariana.", eyebrow: "Pedido #GS202600 · Atualização da compra", summary: receipt, action: { label: "Acompanhar pedido", url: "https://groundshop.com.br/pedidos/exemplo" }, sections: [{ title: "Entrega do pedido", lines: ["Correios · SEDEX", "Mariana · Aos cuidados da equipe de eventos", "Rua Exemplo, 123 · Sala 2", "Centro · São Paulo/SP · CEP 01001-000"] }] };
const fixtures = {
  acesso: { brand, title: "Seu acesso está quase pronto", preheader: "Use seu código para acessar a loja. Ele é válido por 10 minutos.", eyebrow: "Acesso à sua conta", greeting: "Olá, Mariana.", paragraphs: ["Digite o código abaixo na tela em que solicitou o acesso para consultar seus pedidos e orçamentos."], code: { label: "Seu código de acesso", value: "753192", note: "Válido por 10 minutos · uso único" }, notice: "Não compartilhe este código. Nossa equipe nunca pedirá seu código de acesso por telefone ou mensagem.", footerNote: "Se você não solicitou este acesso, ignore esta mensagem. Nenhuma ação é necessária." },
  recebido: { ...order, title: "Pedido recebido", preheader: "Recebemos seu pedido. Confira os detalhes na sua conta.", paragraphs: ["Recebemos seu pedido. Acompanhe os detalhes e as próximas etapas na sua conta."], facts: [{ label: "Pagamento", value: "Aguardando confirmação" }] },
  pagamento: { ...order, title: "Pagamento confirmado", preheader: "Pedido #GS202600 · Obrigado pela compra!", paragraphs: ["O pagamento do seu pedido foi confirmado. Obrigado pela compra!"], facts: [{ label: "Pagamento", value: "Confirmado" }], notice: "Se houver artes para aprovação, revise-as na sua conta para liberar a produção." },
  arte: { ...order, title: "Arte pronta para aprovação", preheader: "Uma prova da sua arte está disponível.", paragraphs: ["Uma prova da sua arte está disponível. Acesse seu pedido para revisar e aprovar antes da produção."], action: { label: "Revisar e aprovar arte", url: "https://groundshop.com.br/pedidos/exemplo" } },
  producao: { ...order, title: "Pedido em produção", preheader: "Seu pedido entrou em produção.", paragraphs: ["Seu pedido entrou em produção. Avisaremos quando houver novidades."], sections: [...order.sections, { title: "Prazos informados na compra", lines: ["Produção: 3 dias úteis", "Transporte: 2 dias úteis", "Previsão registrada na compra: 02 de dezembro de 2026", "A previsão depende da confirmação do pagamento, da aprovação das artes e do transporte. Confira o andamento atualizado no seu pedido."] }] },
  enviado: { ...order, title: "Pedido enviado", preheader: "Seu pedido foi enviado. Acompanhe a entrega.", paragraphs: ["Seu pedido foi enviado. Acompanhe a entrega pelos detalhes abaixo ou pela sua conta."], tracking: [{ code: "AA123456789BR", url: "https://tracking.example.test/AA123456789BR" }, { code: "BB123456789BR", url: "https://tracking.example.test/BB123456789BR" }] },
  entregue: { ...order, title: "Pedido entregue", preheader: "A transportadora informou a entrega do seu pedido.", paragraphs: ["A transportadora informou que seu pedido foi entregue. Obrigado por comprar conosco!"] },
  retirada: { ...order, title: "Retirada confirmada", preheader: "A retirada do seu pedido foi registrada pela loja.", paragraphs: ["A retirada do seu pedido foi registrada pela loja. Obrigado por comprar conosco!"], sections: [{ title: "Retirada na loja", lines: ["Rua Exemplo, 123 · São Paulo/SP"] }] },
  convite: { brand: { name: "Pricing Pro" }, title: "Seu convite chegou", preheader: "Defina sua senha para ativar seu acesso.", greeting: "Olá, Mariana.", paragraphs: ["Você foi convidada para acessar a equipe Ground Shop. Defina sua senha para ativar seu acesso."], action: { label: "Ativar meu acesso", url: "https://app.example.test/convite/exemplo" } },
  longo: { ...order, brand: { ...brand, name: "Empresa de presentes personalizados para eventos corporativos e campanhas especiais" }, title: "Pagamento confirmado", preheader: "Pedido com muitos itens para validar a leitura.", summary: { ...receipt, items: Array.from({ length: 40 }, (_, index) => ({ name: `Produto ${index + 1} ${"ProdutoPersonalizado".repeat(8)}`, quantity: 50, unitCents: 500, totalCents: 25000, artworkName: "ArteDeCampanha".repeat(10) })), subtotalCents: 1000000, artworkDiscountCents: 0, totalCents: 1002590 } },
};
const logo = await readFile(`${root}public/brands/ground-shop.jpeg`);
const pages = new Map(Object.entries(fixtures).map(([key, value]) => [key, renderTransactionalEmail(value)]));
const gallery = `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia de e-mails</title><style>body{background:#edf2f4;font:16px Arial;color:#20343d;max-width:840px;margin:40px auto;padding:20px}h1{font-size:28px}nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}a{color:#126352;border:1px solid #d4e4de;padding:18px;background:white;border-radius:6px;text-decoration:none}a:hover{border-color:#126352}</style><h1>E-mails da loja</h1><p>Prévia visual com dados fictícios. Nenhum e-mail será enviado.</p><nav>${Object.entries(fixtures).map(([key, value]) => `<a href="/${key}">${value.title}${key === "longo" ? " · 40 itens" : ""}</a>`).join("")}</nav></html>`;
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname.slice(1);
  if (path === "logo.jpg") { response.setHeader("content-type", "image/jpeg"); response.end(logo); return; }
  const page = pages.get(path.replace(/\.txt$/, ""));
  response.setHeader("content-type", path.endsWith(".txt") ? "text/plain; charset=utf-8" : "text/html; charset=utf-8");
  response.end(page ? path.endsWith(".txt") ? page.text : page.html.replaceAll("https://email-fixture.example.test/logo.jpg", "/logo.jpg") : gallery);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--serve")) console.log(`Prévia de e-mails com dados fictícios: ${base}`);
else {
  let browser;
  try {
    const require = createRequire(import.meta.url);
    const { chromium } = require(process.env.COMMERCE_PLAYWRIGHT_PATH || "playwright");
    browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=128"] });
    const page = await browser.newPage();
    await page.route("**/*", route => route.request().url().startsWith("https://email-fixture.example.test/") ? route.fulfill({ contentType: "image/jpeg", body: logo }) : new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    for (const width of [720, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [key, fixture] of Object.entries(fixtures)) {
        await page.goto(`${base}/${key}`);
        assert.equal(await page.title(), fixture.title);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${key}: overflow at ${width}`);
        assert.equal(await page.locator("h1").isVisible(), true);
        if (fixture.brand.logoUrl) assert.equal(await page.locator("img").evaluate(image => image.complete && image.naturalWidth > 0), true);
        if (fixture.action) {
          const link = page.getByRole("link", { name: fixture.action.label, exact: true });
          assert.equal(await link.getAttribute("href"), fixture.action.url);
          const bounds = await link.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
        }
        assert.ok(Buffer.byteLength(pages.get(key).html) < 95000, `${key}: email too large`);
        if (["acesso", "pagamento", "enviado"].includes(key)) await page.screenshot({ path: `/tmp/transactional-email-${key}-${width}.png`, fullPage: true });
      }
    }
    await page.goto(`${base}/enviado`);
    await page.evaluate(() => { document.querySelectorAll("style").forEach(element => element.remove()); document.querySelectorAll("img").forEach(element => element.remove()); });
    assert.equal(await page.getByRole("heading", { name: "Pedido enviado" }).isVisible(), true);
    assert.equal(await page.getByRole("link", { name: "Acompanhar pedido", exact: true }).isVisible(), true);
    assert.equal(await page.getByText("AA123456789BR", { exact: true }).isVisible(), true);
    console.log("Email previews passed: 10 templates × 3 viewports; images, link bounds, overflow, payload size and CSS/image-free fallback.");
  } finally { if (browser) await browser.close(); await new Promise(done => server.close(done)); }
}
