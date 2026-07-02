import { describe, expect, it } from "vitest";
import {
  buildOlistCrmQuotePayload,
  buildOlistCustomerPayload,
  buildOlistInvoicePayload,
  buildOlistSalesOrderPayload,
  missingOlistSkus
} from "@/services/olist/payloads";
import type { CustomerRow } from "@/repositories/customers";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";

describe("olist payloads", () => {
  it("builds customer payload", () => {
    const payload = buildOlistCustomerPayload(customer());

    expect(payload).toMatchObject({
      codigo: "customer-1",
      nome: "Cliente Teste",
      cpfCnpj: "52998224725",
      telefone: "11999999999",
      email: "cliente@example.com",
      endereco: {
        cep: "01001000",
        uf: "SP"
      }
    });
  });

  it("builds CRM quote payload", () => {
    const payload = buildOlistCrmQuotePayload({ quote: quote(), items: [item()] });

    expect(payload).toMatchObject({
      idContato: 12345,
      descricao: "Orçamento quote-1 - Cliente Teste",
      data: "2026-06-27"
    });
  });

  it("builds sales order payload with Olist product id and quote price", () => {
    const payload = buildOlistSalesOrderPayload({ quote: quote(), items: [item()] });

    expect(payload.itens[0]).toMatchObject({
      produto: { id: 98765, tipo: "P" },
      quantidade: 100,
      valorUnitario: 2.5
    });
    expect(payload.itens[0].infoAdicional).toContain("Arte azul");
    expect(payload.valorFrete).toBe(20);
  });

  it("builds invoice generation payload", () => {
    const payload = buildOlistInvoicePayload({ quote: quote(), items: [item()] });

    expect(payload).toEqual({ modelo: 55 });
  });

  it("reports quote items without numeric Olist product id before order/invoice operations", () => {
    expect(missingOlistSkus([{ ...item(), sku: null }])).toEqual(["Botton - 55mm"]);
    expect(missingOlistSkus([{ ...item(), sku: "BOTTON-55" }])).toEqual(["Botton - 55mm"]);
  });
});

function customer(): CustomerRow {
  return {
    id: "customer-1",
    name: "Cliente Teste",
    document: "529.982.247-25",
    email: "cliente@example.com",
    phone: "(11) 99999-9999",
    postal_code: "01001-000",
    address_line: "Rua A",
    address_number: "123",
    address_complement: null,
    district: "Centro",
    city: "Sao Paulo",
    state: "sp",
    external_olist_id: null,
    created_at: "2026-06-27T00:00:00.000Z"
  };
}

function quote(): QuoteDetail {
  return {
    id: "quote-1",
    status: "draft",
    valid_until: "2026-07-01",
    subtotal: "250.0000",
    shipping_total: "20.0000",
    discount_total: "0.0000",
    grand_total: "270.0000",
    margin_amount: "80.0000",
    margin_percent: "32.0000",
    notes: null,
    created_at: "2026-06-27T00:00:00.000Z",
    customer_id: "customer-1",
    customer_name: "Cliente Teste",
    customer_document: "529.982.247-25",
    customer_email: "cliente@example.com",
    customer_phone: "(11) 99999-9999",
    customer_postal_code: "01001-000",
    customer_address_line: "Rua A",
    customer_address_number: "123",
    customer_address_complement: null,
    customer_district: "Centro",
    customer_city: "Sao Paulo",
    customer_state: "sp",
    customer_external_olist_id: "12345",
    external_crm_id: null,
    created_by_name: "Admin"
  };
}

function item(): QuoteItemRow {
  return {
    id: "item-1",
    product_variant_id: "variant-1",
    sku: "98765",
    description: "Botton - 55mm",
    quantity: 100,
    unit_price: "2.5000",
    total_price: "250.0000",
    artwork_name: "Arte azul"
  };
}
