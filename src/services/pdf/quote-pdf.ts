import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAGE_SIZE: [number, number] = [595.28, 841.89];
const margin = 42;

export async function generateQuotePdf(input: {
  tenantName: string;
  tenant?: {
    name: string;
    logo_url: string | null;
    company_phone: string | null;
    company_site: string | null;
    company_document: string | null;
  } | null;
  quote: QuoteDetail;
  items: QuoteItemRow[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage(PAGE_SIZE);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = PAGE_SIZE[0];
  let y = 790;
  const tenantName = input.tenant?.name ?? input.tenantName;
  const logo = await loadLogo(pdf, input.tenant?.logo_url);

  const ensureSpace = (needed = 80) => {
    if (y >= needed) return;
    page = pdf.addPage(PAGE_SIZE);
    y = 790;
  };

  const drawText = (
    text: string,
    options?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; y?: number }
  ) => {
    const size = options?.size ?? 10;
    ensureSpace(70);
    page.drawText(sanitizePdfText(text), {
      x: options?.x ?? margin,
      y: options?.y ?? y,
      size,
      font: options?.bold ? bold : regular,
      color: options?.color ?? rgb(0.12, 0.12, 0.13)
    });
    if (options?.y === undefined) y -= size + 8;
  };

  if (logo) page.drawImage(logo, { x: margin, y: 744, width: 48, height: 48 });
  const headerX = logo ? margin + 64 : margin;
  drawText("Proposta Comercial", { x: headerX, y: 774, size: 20, bold: true });
  drawText(tenantName, { x: headerX, y: 754, size: 12, bold: true, color: rgb(0.25, 0.25, 0.27) });
  const companyLine = [input.tenant?.company_document, input.tenant?.company_phone, input.tenant?.company_site]
    .filter(Boolean)
    .join(" | ");
  if (companyLine) drawText(companyLine, { x: headerX, y: 738, size: 9, color: rgb(0.35, 0.35, 0.38) });
  page.drawLine({ start: { x: margin, y: 720 }, end: { x: pageWidth - margin, y: 720 }, thickness: 1, color: rgb(0.78, 0.78, 0.8) });
  y = 696;

  drawSectionTitle("Detalhes da Proposta");
  drawKeyValueGrid([
    ["Orcamento", shortId(input.quote.id)],
    ["Data", formatDate(input.quote.created_at)],
    ["Validade", input.quote.valid_until ? formatDate(input.quote.valid_until) : "-"],
    ["Status", input.quote.status]
  ]);

  drawSectionTitle("Cliente");
  const customerParts = [
    input.quote.customer_name ? `Aos cuidados de ${input.quote.customer_name}` : "Cliente nao informado",
    input.quote.customer_document ? `CPF/CNPJ: ${input.quote.customer_document}` : null,
    input.quote.customer_email ? `email: ${input.quote.customer_email}` : null,
    input.quote.customer_phone ? `telefone: ${input.quote.customer_phone}` : null
  ].filter(Boolean) as string[];
  for (const line of wrapText(customerParts.join(", "), 95)) drawText(line, { size: 10 });
  y -= 8;

  drawSectionTitle("Itens");
  drawTable(
    ["Descricao", "Qtd", "Ref.", "Unitario", "Total"],
    input.items.map((item) => [
      [
        item.description,
        item.artwork_name ? `Arte: ${item.artwork_name}` : null,
        item.reference_quantity ? `Regra: ${formatPricingRule(item.pricing_rule)}`
          : null
      ].filter(Boolean).join(" | "),
      String(item.quantity),
      item.reference_quantity ? String(item.reference_quantity) : "-",
      brl.format(Number(item.unit_price)),
      brl.format(Number(item.total_price))
    ]),
    [230, 44, 44, 90, 90]
  );

  drawSectionTitle("Resumo");
  const summaryRows = [
    ["Subtotal", brl.format(Number(input.quote.subtotal))],
    ["Frete", brl.format(Number(input.quote.shipping_total))],
    ["Desconto", brl.format(Number(input.quote.discount_total))],
    ["TOTAL GERAL", brl.format(Number(input.quote.grand_total))]
  ];
  drawTable(["Item", "Valor"], summaryRows, [330, 168], summaryRows.length - 1);

  if (input.quote.notes) {
    drawSectionTitle("Observacoes");
    for (const line of wrapText(input.quote.notes, 90)) drawText(line, { size: 9, color: rgb(0.28, 0.28, 0.3) });
  }

  page.drawText("Valores sujeitos a confirmacao ate o aceite da proposta.", {
    x: margin,
    y: 42,
    size: 8,
    font: regular,
    color: rgb(0.45, 0.45, 0.48)
  });

  return pdf.save();

  function drawSectionTitle(title: string) {
    ensureSpace(72);
    drawText(title, { size: 12, bold: true });
    y -= 2;
  }

  function drawKeyValueGrid(rows: Array<[string, string]>) {
    const colWidth = (pageWidth - margin * 2) / 2;
    rows.forEach(([label, value], index) => {
      const x = margin + (index % 2) * colWidth;
      const rowY = y - Math.floor(index / 2) * 36;
      page.drawRectangle({ x, y: rowY - 16, width: colWidth - 10, height: 30, color: rgb(0.96, 0.96, 0.97) });
      page.drawText(sanitizePdfText(label), { x: x + 8, y: rowY + 2, size: 8, font: bold, color: rgb(0.42, 0.42, 0.45) });
      page.drawText(sanitizePdfText(value), { x: x + 8, y: rowY - 10, size: 10, font: regular, color: rgb(0.12, 0.12, 0.13) });
    });
    y -= Math.ceil(rows.length / 2) * 36 + 12;
  }

  function drawTable(headers: string[], rows: string[][], widths: number[], highlightRow?: number) {
    const rowHeight = 24;
    ensureSpace(rowHeight * (rows.length + 2));
    let x = margin;
    page.drawRectangle({ x: margin, y: y - rowHeight + 6, width: widths.reduce((sum, value) => sum + value, 0), height: rowHeight, color: rgb(0.12, 0.12, 0.13) });
    headers.forEach((header, index) => {
      page.drawText(sanitizePdfText(header), { x: x + 8, y: y - 10, size: 9, font: bold, color: rgb(1, 1, 1) });
      x += widths[index];
    });
    y -= rowHeight;

    rows.forEach((row, rowIndex) => {
      ensureSpace(rowHeight + 50);
      const highlight = highlightRow === rowIndex;
      page.drawRectangle({
        x: margin,
        y: y - rowHeight + 6,
        width: widths.reduce((sum, value) => sum + value, 0),
        height: rowHeight,
        color: highlight ? rgb(1, 0.94, 0.82) : rowIndex % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1)
      });
      x = margin;
      row.forEach((cell, index) => {
        const value = wrapText(cell, index === 0 ? 42 : 16)[0] ?? "";
        page.drawText(sanitizePdfText(value), {
          x: x + 8,
          y: y - 10,
          size: 9,
          font: highlight ? bold : regular,
          color: rgb(0.12, 0.12, 0.13)
        });
        x += widths[index];
      });
      y -= rowHeight;
    });
    y -= 14;
  }
}

async function loadLogo(pdf: PDFDocument, logoUrl: string | null | undefined) {
  if (!logoUrl || !/^https?:\/\//.test(logoUrl)) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("png") || logoUrl.toLowerCase().endsWith(".png")) return pdf.embedPng(bytes);
    return pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function sanitizePdfText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

function formatPricingRule(rule: string | null | undefined) {
  if (rule === "per_art_average") return "por artes";
  if (rule === "aggregate_total") return "por total";
  return "por item";
}

function wrapText(value: string, maxLength: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}
