import { describe, expect, it } from "vitest";
import { buildQuoteWhatsAppText } from "@/domain/whatsapp/quote";

describe("quote whatsapp text", () => {
  it("builds a customer-facing quote summary", () => {
    const text = buildQuoteWhatsAppText({
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
        notes: null,
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
        delivery_attention_to: "Marina - Marketing",
        external_crm_id: null,
        created_by_name: "Admin"
      },
      items: [
        {
          id: "item-id",
          description: "Botton - 2,5 cm",
          quantity: 100,
          unit_price: "2",
          total_price: "200"
        }
      ]
    });

    expect(text).toContain("*Cliente:* Cliente Teste");
    expect(text).toContain("*Aos cuidados de:* Marina - Marketing");
    expect(text).toContain("*100x* Botton - 2,5 cm");
    expect(text.replace(/\s/g, " ")).toContain("*Total:* R$ 220,00");
  });

  it("shows discount type, amount and reason", () => {
    const quote = {
      id: "quote-id", status: "draft" as const, valid_until: null,
      subtotal: "200", shipping_total: "20", discount_total: "20",
      discount_type: "percent" as const, discount_value: "10", discount_reason: "Cliente recorrente",
      grand_total: "200", margin_amount: "80", margin_percent: "40", notes: null,
      created_at: "2026-06-26", customer_id: null, customer_name: null,
      customer_document: null, customer_email: null, customer_phone: null,
      customer_postal_code: null, customer_address_line: null, customer_address_number: null,
      customer_address_complement: null, customer_district: null, customer_city: null,
      customer_state: null, customer_external_olist_id: null, external_crm_id: null, created_by_name: null
    };
    const text = buildQuoteWhatsAppText({ quote, items: [{ id: "item", description: "Produto", quantity: 1, unit_price: "200", total_price: "200" }] });
    expect(text).toContain("*Desconto (10%):*");
    expect(text).toContain("*Motivo do desconto:* Cliente recorrente");
    expect(text).toContain("*Total:* R$ 200,00");
  });
});
