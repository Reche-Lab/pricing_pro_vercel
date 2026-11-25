import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { quoteDiscountLabel } from "@/domain/quotes/discount";
import { parsePixPaymentSnapshot, pixKeyTypeLabel } from "@/domain/payments/pix";
import type { QuotePdfArtworkVariant } from "@/domain/quotes/pdf-artwork";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import type { QuoteStatus } from "@/domain/quotes/types";
import { deliveryEstimate, formatDeliveryDate, type DeliveryEstimate, type ProductionSettings } from "@/domain/shipping/production-lead-time";
import { pdfImagePng } from "./pdf-images";
import { quotePdfItemVisuals } from "./quote-visuals";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 42, WIDTH = PAGE[0] - MARGIN * 2, BOTTOM = 72;
const ink = rgb(.12, .20, .22), muted = rgb(.36, .43, .46), accent = rgb(.06, .39, .33);
const pale = rgb(.94, .97, .96), lineColor = rgb(.86, .90, .90);
const STATUS_LABELS: Record<QuoteStatus, string> = { draft: "Orçamento", sent: "Enviado", accepted: "Aceito", rejected: "Recusado", expired: "Expirado", cancelled: "Cancelado" };

export async function generateQuotePdf(input: {
  tenantName: string;
  tenant?: { name: string; logo_url: string | null; company_phone: string | null; company_site: string | null; company_document: string | null; production_settings?: ProductionSettings } | null;
  quote: QuoteDetail; items: QuoteItemRow[]; artworkVariant?: QuotePdfArtworkVariant; mockupView?: "front" | "both";
  productionEstimate?: DeliveryEstimate; discountLabel?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Orçamento ${shortId(input.quote.id)} · ${input.tenant?.name ?? input.tenantName}`);
  pdf.setAuthor(input.tenant?.name ?? input.tenantName); pdf.setSubject("Proposta comercial com produtos, condições e valores");
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const name = input.tenant?.name ?? input.tenantName;
  const logoBytes = await pdfImagePng(input.tenant?.logo_url);
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
  let page = pdf.addPage(PAGE), y = PAGE[1] - MARGIN;

  function text(value: string, x: number, baseline: number, size = 10, strong = false, color = ink) {
    page.drawText(clean(value), { x, y: baseline, size, font: strong ? bold : regular, color });
  }
  function rule(baseline: number) { page.drawLine({ start: { x: MARGIN, y: baseline }, end: { x: PAGE[0] - MARGIN, y: baseline }, thickness: .6, color: lineColor }); }
  function newPage() {
    page = pdf.addPage(PAGE); y = PAGE[1] - MARGIN;
    for (const value of wrap(name, WIDTH - 150, 10, bold)) { text(value, MARGIN, y, 10, true); y -= 13; }
    text(`ORÇAMENTO #${shortId(input.quote.id)}`, PAGE[0] - MARGIN - 145, PAGE[1] - MARGIN, 9, true, accent);
    y -= 9; rule(y); y -= 25;
  }
  function ensure(height: number) { if (y - height < BOTTOM) newPage(); }
  function paragraph(value: string, size = 9, color = muted, strong = false) {
    for (const row of wrap(value, WIDTH, size, strong ? bold : regular)) { ensure(size + 6); text(row, MARGIN, y, size, strong, color); y -= size + 6; }
  }
  function section(title: string, reserve = 44) { ensure(reserve + 30); y -= 8; text(title, MARGIN, y, 12, true, accent); y -= 20; }

  // A constrained header keeps long company names and contact details inside A4.
  const logoWidth = logo ? 76 : 0;
  if (logo) {
    const fit = fitImage(logo.width, logo.height, 62, 58);
    page.drawImage(logo, { x: MARGIN, y: y - 48 + (58 - fit.height) / 2, ...fit });
  }
  const companyX = MARGIN + logoWidth, companyWidth = WIDTH - logoWidth - 152;
  const companyLines = wrap(name, companyWidth, 19, bold);
  for (const [index, value] of companyLines.entries()) text(value, companyX, y - index * 24, 19, true);
  text("ORÇAMENTO", PAGE[0] - MARGIN - 136, y, 17, true, accent);
  text(`#${shortId(input.quote.id)}`, PAGE[0] - MARGIN - 136, y - 21, 11, false, muted);
  y -= Math.max(58, companyLines.length * 24 + 10);
  const companyInfo = [input.tenant?.company_document, input.tenant?.company_phone, input.tenant?.company_site].filter(Boolean).join("  |  ");
  if (companyInfo) paragraph(companyInfo, 8);
  y -= 6; rule(y); y -= 27;
  const meta = [["Data", formatDate(input.quote.created_at)], ["Validade", input.quote.valid_until ? formatDate(input.quote.valid_until) : "A confirmar"], ["Status", STATUS_LABELS[input.quote.status] ?? "Orçamento"]];
  for (const [index, [label, value]] of meta.entries()) { const x = MARGIN + index * WIDTH / 3; text(label, x, y, 8, false, muted); text(value, x, y - 16, 10, true); }
  y -= 44;

  section("Preparado para você");
  const customer = [input.quote.customer_name || "Cliente não informado", input.quote.customer_document ? `CPF/CNPJ: ${input.quote.customer_document}` : "", input.quote.customer_email || "", input.quote.customer_phone || ""].filter(Boolean);
  const address = [input.quote.customer_address_line, input.quote.customer_address_number, input.quote.customer_address_complement, input.quote.customer_district, input.quote.customer_city, input.quote.customer_state, input.quote.customer_postal_code].filter(Boolean).join(", ");
  for (const [index, value] of customer.entries()) paragraph(value, index === 0 ? 11 : 9, index === 0 ? ink : muted, index === 0);
  if (input.quote.delivery_attention_to) paragraph(`Aos cuidados de: ${input.quote.delivery_attention_to}`, 9, ink, true);
  if (address) paragraph(`Endereço de entrega: ${address}`, 9);
  y -= 8;

  section("Produtos e quantidades", 65);
  const widths = [WIDTH - 236, 40, 90, 106];
  function tableHeader() {
    page.drawRectangle({ x: MARGIN, y: y - 24, width: WIDTH, height: 26, color: accent });
    let x = MARGIN;
    for (const [index, label] of ["Produto / personalização", "Qtd.", "Valor unitário", "Total"].entries()) {
      text(label, index === 0 ? x + 10 : x + widths[index] - 10 - bold.widthOfTextAtSize(clean(label), 8), y - 14, 8, true, rgb(1, 1, 1)); x += widths[index];
    }
    y -= 26;
  }
  tableHeader();
  for (const [index, item] of input.items.entries()) {
    const description = [item.description, item.artwork_name ? `Arte: ${item.artwork_name}` : "", item.reference_quantity && item.reference_quantity !== item.quantity ? `Quantidade de referência: ${item.reference_quantity}` : ""].filter(Boolean).join("\n");
    const rows = wrap(description, widths[0] - 20, 9, regular), height = Math.max(38, rows.length * 13 + 16);
    if (y - height < BOTTOM) { newPage(); tableHeader(); }
    page.drawRectangle({ x: MARGIN, y: y - height, width: WIDTH, height, color: index % 2 === 0 ? rgb(.97, .98, .98) : rgb(1, 1, 1) });
    rows.forEach((value, row) => text(value, MARGIN + 10, y - 17 - row * 13, 9));
    let x = MARGIN + widths[0];
    for (const [column, value] of [String(item.quantity), brl.format(Number(item.unit_price)), brl.format(Number(item.total_price))].entries()) {
      const size = 9, font = column === 2 ? bold : regular;
      text(value, x + widths[column + 1] - 10 - font.widthOfTextAtSize(clean(value), size), y - 17, size, column === 2); x += widths[column + 1];
    }
    y -= height;
  }
  y -= 18;

  const discount = Math.abs(Number(input.quote.discount_total));
  const totals = [["Produtos", brl.format(Number(input.quote.subtotal))],
    ...(discount > 0 ? [[input.discountLabel ?? quoteDiscountLabel(input.quote.discount_type, Number(input.quote.discount_value ?? input.quote.discount_total), discount), brl.format(-discount)]] : []),
    [input.quote.delivery_method === "pickup" ? "Retirada no local" : "Frete", brl.format(Number(input.quote.shipping_total))]];
  const totalsHeight = totals.reduce((sum, [label]) => sum + Math.max(25, wrap(label, WIDTH - 150, 10, regular).length * 14 + 10), 0) + 52;
  section("Composição do valor", totalsHeight);
  for (const [label, value] of totals) {
    const rows = wrap(label, WIDTH - 150, 10, regular);
    rows.forEach((row, i) => text(row, MARGIN, y - i * 14, 10, false, muted));
    text(value, PAGE[0] - MARGIN - regular.widthOfTextAtSize(clean(value), 10), y, 10, false, label === "Produtos" ? ink : accent);
    y -= Math.max(25, rows.length * 14 + 10);
  }
  page.drawRectangle({ x: MARGIN, y: y - 36, width: WIDTH, height: 44, color: pale });
  text("TOTAL DO ORÇAMENTO", MARGIN + 12, y - 17, 11, true, accent);
  const total = brl.format(Number(input.quote.grand_total));
  text(total, PAGE[0] - MARGIN - 12 - bold.widthOfTextAtSize(clean(total), 18), y - 18, 18, true, accent); y -= 57;
  if (discount > 0 && input.quote.discount_reason) paragraph(`Desconto: ${input.quote.discount_reason}`, 8);

  const pix = parsePixPaymentSnapshot(input.quote.pix_payment_snapshot);
  if (pix) {
    section("Pagamento via Pix"); paragraph(`Chave ${pixKeyTypeLabel(pix.keyType)}: ${pix.key}`, 10, ink, true);
    if (pix.beneficiaryName) paragraph(`Favorecido: ${pix.beneficiaryName}`, 9);
  }
  const quantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const forecast = input.productionEstimate ?? (input.tenant?.production_settings && quantity > 0 ? deliveryEstimate(quantity, input.quote.delivery_method === "pickup" ? 0 : null, input.tenant.production_settings) : null);
  if (forecast) {
    section("Produção e entrega estimadas", 100);
    paragraph(`Produção: ${forecast.productionDays} dias úteis após pagamento e aprovação das artes.`, 9);
    if (input.quote.delivery_method !== "pickup") paragraph(`Transporte: ${forecast.transportDays === null ? "prazo a confirmar" : `${forecast.transportDays} dias úteis`}.`, 9);
    if (forecast.deliveryDate) paragraph(`${input.quote.delivery_method === "pickup" ? "Retirada" : "Recebimento"} estimado: ${formatDeliveryDate(forecast.deliveryDate)}.`, 10, ink, true);
    paragraph(`Projeção condicionada à confirmação em ${formatDeliveryDate(forecast.estimatedFrom)}. Datas não garantidas.`, 8);
  }
  if (input.quote.notes) { section("Condições e observações"); paragraph(input.quote.notes, 9); }

  let visualTitle = false, disclaimer = false;
  for (const item of input.items) {
    const visuals = await quotePdfItemVisuals(item, input.artworkVariant ?? "product", input.mockupView ?? "both");
    for (const visual of visuals) {
      if (!visualTitle) { section("Seu produto e suas artes", 208); visualTitle = true; }
      const titleRows = wrap(visual.title, WIDTH, 11, bold);
      const artRows = visual.artworkName ? wrap(`Arte: ${visual.artworkName}`, WIDTH, 9, regular) : [];
      const height = 152 + titleRows.length * 15 + artRows.length * 13;
      ensure(height + 16); rule(y + 7);
      for (const value of titleRows) { text(value, MARGIN, y - 10, 11, true); y -= 15; }
      for (const value of artRows) { text(value, MARGIN, y - 10, 9, false, muted); y -= 13; }
      text(visual.label, MARGIN, y - 10, 8, false, accent); y -= 27;
      const col = WIDTH / visual.images.length;
      for (const [index, image] of visual.images.entries()) {
        const embedded = await pdf.embedPng(image.bytes), fit = fitImage(embedded.width, embedded.height, Math.min(170, col - 24), 102);
        const x = MARGIN + col * index;
        page.drawImage(embedded, { x: x + (col - fit.width) / 2, y: y - 102 + (102 - fit.height) / 2, ...fit });
        text(image.label, x + (col - regular.widthOfTextAtSize(image.label, 8)) / 2, y - 116, 8, false, muted);
      }
      y -= 138; disclaimer ||= visual.illustrative;
    }
  }
  if (disclaimer) paragraph("Imagens meramente ilustrativas. Cores, acabamento e fecho podem variar no produto final. A simulação não substitui a aprovação da arte.", 8);

  const pages = pdf.getPages();
  for (const [index, sheet] of pages.entries()) {
    sheet.drawLine({ start: { x: MARGIN, y: 55 }, end: { x: PAGE[0] - MARGIN, y: 55 }, thickness: .5, color: lineColor });
    sheet.drawText("Valores e condições conforme a validade desta proposta.", { x: MARGIN, y: 40, size: 7, font: regular, color: muted });
    sheet.drawText(`${index + 1} / ${pages.length}`, { x: PAGE[0] - MARGIN - 30, y: 40, size: 8, font: regular, color: muted });
  }
  return pdf.save();

  function wrap(value: string, width: number, size: number, font: PDFFont): string[] {
    const lines: string[] = [];
    for (const paragraph of String(value).split(/\r?\n/)) {
      let current = "";
      for (const word of clean(paragraph).split(/\s+/).filter(Boolean)) {
        const next = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { current = next; continue; }
        if (current) lines.push(current); current = "";
        for (const char of word) {
          if (current && font.widthOfTextAtSize(current + char, size) > width) { lines.push(current); current = ""; }
          current += char;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }
}

function clean(value: string) { return String(value).normalize("NFC").replace(/[^\x20-\x7E\xA0-\xFF]/g, " "); }
function shortId(value: string) { return value.slice(0, 8).toUpperCase(); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date); }
function fitImage(width: number, height: number, maxWidth: number, maxHeight: number) { const ratio = Math.min(maxWidth / width, maxHeight / height); return { width: width * ratio, height: height * ratio }; }
