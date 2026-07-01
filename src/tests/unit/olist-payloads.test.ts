import { describe, expect, it } from "vitest";
import {
  buildOlistCrmQuotePayload,
  buildOlistCustomerPayload,
  buildOlistInvoicePayload,
  buildOlistSalesOrderPayload
} from "@/services/olist/payloads";
import type { CustomerRow } from "@/repositories/customers";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";

describe("olist payloads", () => {
  it("builds customer payload", () => {
    const payload = buildOlistCustomerPayload(customer());

    expect(payload).toMatchObject({
      external_reference: "customer-1",
      name: "Cliente Teste",
      document: "52998224725",
      phone: "11999999999",
      address: {
        postal_code: "01001000",
        state: "SP"
      }
    });
  });

  it("builds CRM quote payload", () => {
    const payload = buildOlistCrmQuotePayload({ quote: quote(), items: [item()] });

    expect(payload).toMatchObject({
      external_reference: "quote-1",
      customer: {
        external_olist_id: "olist-customer-1"
      },
      totals: {
        grand_total: 250,
        margin_percent: 32
      },
      items: [
        {
          description: "Botton - 55mm",
          quantity: 100
        }
      ]
    });
  });

  it("builds sales order payload with sku and quote price", () => {
    const payload = buildOlistSalesOrderPayload({ quote: quote(), items: [item()] });

    expect(payload.items[0]).toMatchObject({
      sku: "BOTTON-55",
      unit_price: 2.5,
      total_price: 250
    });
    expect(payload.totals.grand_total).toBe(250);
  });

  it("builds invoice payload with fiscal products by sku", () => {
    const payload = buildOlistInvoicePayload({ quote: quote(), items: [item()] });

    expect(payload.products[0]).toMatchObject({
      sku: "BOTTON-55",
      quantity: 100,
      unit_price: 2.5
    });
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
    shipping_total: "0.0000",
    discount_total: "0.0000",
    grand_total: "250.0000",
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
    customer_external_olist_id: "olist-customer-1",
    external_crm_id: null,
    created_by_name: "Admin"
  };
}

function item(): QuoteItemRow {
  return {
    id: "item-1",
    product_variant_id: "variant-1",
    sku: "BOTTON-55",
    description: "Botton - 55mm",
    quantity: 100,
    unit_price: "2.5000",
    total_price: "250.0000"
  };
}
