import { describe, expect, it } from "vitest";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";

describe("quote PDF", () => {
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
