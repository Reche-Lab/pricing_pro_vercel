import { describe, expect, it } from "vitest";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import type { ShipmentRow } from "@/repositories/shipments";
import type { TenantShippingProfile } from "@/repositories/tenant-settings";
import { buildMelhorEnvioCartPayloadDraft } from "@/services/melhor-envio/payloads";

describe("melhor envio cart payload draft", () => {
  it("builds a cart payload from tenant, customer and quote data", () => {
    const draft = buildMelhorEnvioCartPayloadDraft({
      tenant: tenantProfile(),
      quote: quoteDetail(),
      items: [quoteItem()],
      shipment: shipment()
    });

    expect(draft.missingFields).toEqual(["volumes"]);
    expect(draft.payload.service).toBe("1");
    expect(draft.payload.from).toMatchObject({
      name: "Ground Shop",
      phone: "11999999999",
      document: "11222333000181",
      postal_code: "11696208",
      address: "Rua Origem",
      number: "10",
      district: "Centro",
      city: "Caraguatatuba",
      state_abbr: "SP"
    });
    expect(draft.payload.to).toMatchObject({
      name: "Cliente Teste",
      phone: "11888888888",
      document: "52998224725",
      postal_code: "01001000",
      address: "Rua Destino",
      number: "20",
      district: "Se",
      city: "Sao Paulo",
      state_abbr: "SP"
    });
    expect(draft.payload.products).toEqual([
      {
        name: "Botton - 55mm",
        quantity: 100,
        unitary_value: 2.5
      }
    ]);
    expect(draft.payload.options.insurance_value).toBe(250);
  });

  it("reports missing required fields", () => {
    const quote = { ...quoteDetail(), customer_phone: null, customer_postal_code: null };
    const tenant = { ...tenantProfile(), company_document: null };

    const draft = buildMelhorEnvioCartPayloadDraft({
      tenant,
      quote,
      items: [],
      shipment: null
    });

    expect(draft.missingFields).toEqual([
      "tenant.company_document",
      "customer.phone",
      "customer.postal_code",
      "quote.items",
      "shipment.service_code",
      "volumes"
    ]);
  });
});

function tenantProfile(): TenantShippingProfile {
  return {
    id: "tenant-1",
    name: "Ground Shop",
    slug: "ground-shop",
    logo_url: null,
    company_phone: "(11) 99999-9999",
    company_site: null,
    company_document: "11.222.333/0001-81",
    postal_code: "11696-208",
    address_line: "Rua Origem",
    address_number: "10",
    address_complement: null,
    district: "Centro",
    city: "Caraguatatuba",
    state: "sp"
  };
}

function quoteDetail(): QuoteDetail {
  return {
    id: "quote-1",
    status: "draft",
    valid_until: null,
    subtotal: "250.0000",
    shipping_total: "0.0000",
    discount_total: "0.0000",
    grand_total: "250.0000",
    margin_amount: "80.0000",
    margin_percent: "32.0000",
    notes: null,
    created_at: "2026-06-26T00:00:00.000Z",
    customer_id: "customer-1",
    customer_name: "Cliente Teste",
    customer_document: "529.982.247-25",
    customer_email: "cliente@example.com",
    customer_phone: "(11) 88888-8888",
    customer_postal_code: "01001-000",
    customer_address_line: "Rua Destino",
    customer_address_number: "20",
    customer_address_complement: null,
    customer_district: "Se",
    customer_city: "Sao Paulo",
    customer_state: "sp",
    created_by_name: "Admin"
  };
}

function quoteItem(): QuoteItemRow {
  return {
    id: "item-1",
    description: "Botton - 55mm",
    quantity: 100,
    unit_price: "2.5000",
    total_price: "250.0000"
  };
}

function shipment(): ShipmentRow {
  return {
    id: "shipment-1",
    provider: "melhor_envio",
    provider_shipment_id: null,
    provider_order_id: null,
    tracking_code: null,
    status: "quoted",
    service_name: "PAC",
    service_code: "1",
    shipping_amount: "20.0000",
    label_url: null,
    created_at: "2026-06-26T00:00:00.000Z"
  };
}
