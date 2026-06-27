import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export async function generateQuotePdf(input: {
  tenantName: string;
  quote: QuoteDetail;
  items: QuoteItemRow[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = 790;

  const drawText = (text: string, options?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> }) => {
    const size = options?.size ?? 10;
    if (y < 70) {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
    }
    page.drawText(sanitizePdfText(text), {
      x: margin,
      y,
      size,
      font: options?.bold ? bold : regular,
      color: options?.color ?? rgb(0.12, 0.12, 0.13)
    });
    y -= size + 8;
  };

  drawText(input.tenantName, { size: 16, bold: true });
  drawText("Proposta Comercial", { size: 22, bold: true });
  y -= 8;

  drawText(`Orcamento: ${input.quote.id}`, { size: 9 });
  drawText(`Status: ${input.quote.status}`, { size: 9 });
  drawText(`Data: ${formatDate(input.quote.created_at)}`, { size: 9 });
  if (input.quote.valid_until) drawText(`Validade: ${formatDate(input.quote.valid_until)}`, { size: 9 });
  y -= 8;

  drawText("Cliente", { size: 13, bold: true });
  drawText(input.quote.customer_name ?? "Cliente nao informado");
  if (input.quote.customer_document) drawText(`Documento: ${input.quote.customer_document}`);
  if (input.quote.customer_email) drawText(`Email: ${input.quote.customer_email}`);
  if (input.quote.customer_phone) drawText(`Telefone: ${input.quote.customer_phone}`);
  y -= 8;

  drawText("Itens", { size: 13, bold: true });
  for (const item of input.items) {
    drawText(
      `${item.quantity}x ${item.description} - ${brl.format(Number(item.unit_price))}/un - ${brl.format(
        Number(item.total_price)
      )}`
    );
  }
  y -= 8;

  drawText("Resumo", { size: 13, bold: true });
  drawText(`Subtotal: ${brl.format(Number(input.quote.subtotal))}`);
  drawText(`Frete: ${brl.format(Number(input.quote.shipping_total))}`);
  drawText(`Desconto: ${brl.format(Number(input.quote.discount_total))}`);
  drawText(`Total: ${brl.format(Number(input.quote.grand_total))}`, { size: 14, bold: true });
  y -= 8;

  if (input.quote.notes) {
    drawText("Observacoes", { size: 13, bold: true });
    for (const line of wrapText(input.quote.notes, 90)) drawText(line);
  }

  page.drawText("Valores sujeitos a confirmacao ate o aceite da proposta.", {
    x: margin,
    y: 42,
    size: 8,
    font: regular,
    color: rgb(0.45, 0.45, 0.48)
  });

  return pdf.save();
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
