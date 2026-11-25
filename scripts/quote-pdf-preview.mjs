import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, stop } from "esbuild";

// Generates only fictional PDFs, without database, storage or provider access.
const root = fileURLToPath(new URL("../", import.meta.url)), require = createRequire(import.meta.url);
const bundle = await build({ entryPoints: [`${root}src/services/pdf/quote-pdf.ts`], alias: { "@": `${root}src` }, bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "native-pdf-libraries", setup(builder) { builder.onResolve({ filter: /^(sharp|pdf-lib)$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true })); } }],
});
stop();
const { generateQuotePdf } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const art = `data:image/jpeg;base64,${(await readFile(`${root}public/brands/ground-shop.jpeg`)).toString("base64")}`;
const model = JSON.parse(await readFile(`${root}public/mockups/botton-25mm-v1/modelo.json`, "utf8"));
const artwork = { id: "art-1", quote_item_id: "line-1", artwork_name: "Identidade da campanha", file_name: "original.jpg", mime_type: "image/jpeg", file_size: 1000, data_url: art, prepared_data_url: art, storage_path: null, approval_status: "approved" };
const item = { id: "line-1", description: "Botton personalizado · 3,5 cm", quantity: 50, unit_price: "3", total_price: "150", product_mockup: model, print_shape: "circle", print_width_mm: "30", print_height_mm: "30", print_safe_margin_mm: "2.5", print_bleed_mm: "3", artworks: [artwork] };
const input = {
  tenantName: "Ground Shop", tenant: { name: "Ground Shop", logo_url: art, company_phone: "(11) 99999-0000", company_document: "00.000.000/0001-00", company_site: "www.example.test" },
  quote: { id: "GS202600-1234", status: "draft", created_at: "2026-11-25", valid_until: "2026-12-02", subtotal: "270", shipping_total: "25.90", discount_total: "15", discount_reason: "Benefício por arte preparada e aprovada", grand_total: "280.90", customer_name: "Empresa Exemplo · Mariana", customer_document: "00.000.000/0001-00", customer_email: "mariana@example.test", customer_phone: "(11) 99999-0000", customer_address_line: "Rua Exemplo", customer_address_number: "123", customer_address_complement: "Sala 2", customer_district: "Centro", customer_city: "São Paulo", customer_state: "SP", customer_postal_code: "01001-000", delivery_attention_to: "Equipe de eventos", notes: "Produção mediante confirmação do pagamento e aprovação das artes.\nA imagem do produto é ilustrativa. Confira as quantidades e os dados antes do aceite.", pix_payment_snapshot: { keyType: "email", key: "pagamentos@example.test", beneficiaryName: "Empresa Exemplo" } },
  discountLabel: "Desconto por arte pronta e aprovada",
  items: [item, { ...item, id: "line-2", description: "Ímã personalizado · 4,5 cm", quantity: 20, unit_price: "5", total_price: "100", artworks: [{ ...artwork, id: "art-2", approval_status: "pending" }] }, { ...item, id: "line-3", description: "Botton · exemplo sem arte definida", quantity: 10, unit_price: "2", total_price: "20", artworks: [], product_image_url: art }],
};
const output = "/tmp/quote-pdf-proposal-preview.pdf";
await writeFile(output, await generateQuotePdf(input));
await writeFile("/tmp/quote-pdf-front-preview.pdf", await generateQuotePdf({ ...input, mockupView: "front" }));
const many = Array.from({ length: 35 }, (_, index) => ({ ...item, id: `line-${index}`, description: `Produto ${index + 1} com descrição longa para demonstrar paginação e repetição de cabeçalhos`, artwork_name: "Campanha corporativa", artworks: [], product_mockup: undefined }));
await writeFile("/tmp/quote-pdf-long-preview.pdf", await generateQuotePdf({ ...input, items: many, quote: { ...input.quote, subtotal: "5250", grand_total: "5260.90" } }));
console.log(`PDFs fictícios gerados: ${output}, /tmp/quote-pdf-front-preview.pdf, /tmp/quote-pdf-long-preview.pdf`);
