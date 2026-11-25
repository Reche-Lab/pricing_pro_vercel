import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFPage, PDFDocument, StandardFonts } from "pdf-lib";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";

afterEach(() => vi.restoreAllMocks());

describe("quote PDF", () => {
  it("shows negative discounts composing the final total without reducing unit prices", async () => {
    const draw = vi.spyOn(PDFPage.prototype, "drawText"), input = pdfInput("");
    input.quote.discount_total = "30"; input.quote.grand_total = "190";
    await generateQuotePdf({ ...input, discountLabel: "Desconto por arte pronta e aprovada" });
    const texts = draw.mock.calls.map(([value]) => value);
    expect(texts).toContain("-R$ 30,00"); expect(texts).toContain("R$ 190,00");
    expect(texts).toContain("Desconto por arte pronta e aprovada"); expect(texts).toContain("R$ 2,00");
  });
  it("wraps long content, repeats item headers and numbers every A4 page without clipping text", async () => {
    const draw = vi.spyOn(PDFPage.prototype, "drawText"), input = pdfInput("");
    input.tenant.name = "Empresa de produtos personalizados para eventos corporativos com nome bastante extenso";
    input.quote.customer_email = `${"cliente".repeat(20)}@example.com`;
    input.quote.notes = Array.from({ length: 50 }, (_, i) => `Condição ${i}: detalhes completos devem continuar legíveis na proposta sem cortes.`).join("\n");
    input.items = Array.from({ length: 35 }, (_, i) => ({ ...input.items[0], id: `item-${i}`, description: `Produto ${i} com descrição muito longa, nome da campanha e informações importantes para o comprador.`, artwork_name: "Campanha empresarial com nome longo para conferir quebra de linhas" }));
    const bytes = await generateQuotePdf(input), pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (const [value, options] of draw.mock.calls) {
      if (!options) continue;
      expect(options.y).toBeGreaterThanOrEqual(36);
      const f = options.font?.name.includes("Bold") ? bold : font;
      expect((options.x ?? 0) + f.widthOfTextAtSize(value, options.size ?? 10)).toBeLessThanOrEqual(595.28 - 35);
    }
    expect(draw.mock.calls.filter(([value]) => value === "Produto / personalização").length).toBeGreaterThan(1);
    for (let i = 1; i <= pdf.getPageCount(); i++) expect(draw.mock.calls.some(([value]) => value === `${i} / ${pdf.getPageCount()}`)).toBe(true);
  });
  it.each([
    ["draft", "Orçamento"],
    ["sent", "Enviado"],
    ["accepted", "Aceito"],
    ["rejected", "Recusado"],
    ["expired", "Expirado"],
    ["cancelled", "Cancelado"]
  ] as const)("prints the customer-facing label for %s without changing the internal status", async (status, label) => {
    const draw = vi.spyOn(PDFPage.prototype, "drawText");
    const input = pdfInput("");
    input.quote.status = status;
    await generateQuotePdf(input);
    const texts = draw.mock.calls.map(([text]) => text);
    expect(texts[texts.indexOf("Status") + 1]).toBe(label);
    expect(input.quote.status).toBe(status);
  });

  it("preserves Portuguese accents while removing unsupported image symbols", async () => {
    const draw = vi.spyOn(PDFPage.prototype, "drawText");
    const input = pdfInput("");
    input.quote.customer_name = "João Conceição \u{1F3A8}";
    const pdf = await generateQuotePdf(input);
    const texts = draw.mock.calls.map(([text]) => text).join("\n");
    expect(texts).toContain("João Conceição");
    expect(texts).not.toContain("\u{1F3A8}");
    expect(Buffer.from(pdf.subarray(0, 4)).toString("ascii")).toBe("%PDF");
  });

  it("generates a PDF buffer", async () => {
    const pdf = await generateQuotePdf(pdfInput("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="));

    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(Buffer.from(pdf.subarray(0, 4)).toString("ascii")).toBe("%PDF");
  });

  it("does not fail when the logo mime type does not match the image bytes", async () => {
    const pdf = await generateQuotePdf(pdfInput("data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="));

    expect(Buffer.from(pdf.subarray(0, 4)).toString("ascii")).toBe("%PDF");
  });

  it("embeds WebP artwork previews by converting them before writing the PDF", async () => {
    const pdf = await generateQuotePdf(
      pdfInput(
        "",
        "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/vuUAAA="
      )
    );

    expect(Buffer.from(pdf.subarray(0, 4)).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });

  it("generates the customer PDF when a Pix payment snapshot is included", async () => {
    const input = pdfInput("");
    input.quote.pix_payment_snapshot = {
      keyType: "email",
      key: "pagamentos@example.com",
      beneficiaryName: "Ground Shop"
    };

    const pdf = await generateQuotePdf(input);

    expect(Buffer.from(pdf.subarray(0, 4)).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});

function pdfInput(logoUrl: string, artworkDataUrl?: string): {
  tenantName: string;
  tenant: {
    name: string;
    logo_url: string;
    company_document: string;
    company_phone: string;
    company_site: string;
  };
  quote: QuoteDetail;
  items: QuoteItemRow[];
} {
  return {
    tenantName: "Ground Shop",
    tenant: {
      name: "Ground Shop",
      logo_url: logoUrl,
      company_document: "00.000.000/0001-00",
      company_phone: "(11) 99999-9999",
      company_site: "https://example.com"
    },
    quote: {
      id: "quote-id",
      status: "draft",
      valid_until: "2026-06-30",
      subtotal: "200",
      shipping_total: "20",
      discount_total: "0",
      grand_total: "220",
      margin_amount: "100",
      margin_percent: "50",
      notes: "Observacao teste",
      created_at: "2026-06-26",
      customer_id: "customer-id",
      customer_name: "Cliente Teste",
      customer_document: null,
      customer_email: null,
      customer_phone: null,
      customer_postal_code: null,
      customer_address_line: null,
      customer_address_number: null,
      customer_address_complement: null,
      customer_district: null,
      customer_city: null,
      customer_state: null,
      customer_external_olist_id: null,
      external_crm_id: null,
      created_by_name: "Admin"
    },
    items: [
      {
        id: "item-id",
        description: "Botton - 2,5 cm",
        quantity: 100,
        unit_price: "2",
        total_price: "200",
        artworks: artworkDataUrl
          ? [
              {
                id: "artwork-id",
                quote_item_id: "item-id",
                artwork_name: "Arte WebP",
                file_name: "arte.webp",
                mime_type: "image/webp",
                file_size: artworkDataUrl.length,
                data_url: artworkDataUrl,
                storage_path: null
              }
            ]
          : []
      }
    ]
  };
}
