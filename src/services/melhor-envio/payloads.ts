import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import type { ShipmentRow } from "@/repositories/shipments";
import type { TenantShippingProfile } from "@/repositories/tenant-settings";

type BuildPayloadInput = {
  tenant: TenantShippingProfile;
  quote: QuoteDetail;
  items: QuoteItemRow[];
  shipment?: ShipmentRow | null;
};

export type MelhorEnvioCartPayloadDraft = {
  payload: {
    service?: string | number;
    from: MelhorEnvioAddressPayload;
    to: MelhorEnvioAddressPayload;
    products: Array<{
      name: string;
      quantity: number;
      unitary_value: number;
    }>;
    options: {
      insurance_value: number;
      receipt: boolean;
      own_hand: boolean;
      reverse: boolean;
      non_commercial: boolean;
    };
    volumes: Array<{
      height: number;
      width: number;
      length: number;
      weight: number;
    }>;
  };
  missingFields: string[];
};

type MelhorEnvioAddressPayload = {
  name?: string;
  phone?: string;
  email?: string;
  document?: string;
  company_document?: string;
  postal_code?: string;
  address?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  country_id: "BR";
  state_abbr?: string;
};

export function buildMelhorEnvioCartPayloadDraft({
  tenant,
  quote,
  items,
  shipment
}: BuildPayloadInput): MelhorEnvioCartPayloadDraft {
  const missingFields: string[] = [];
  const from = buildFromAddress(tenant, missingFields);
  const to = buildToAddress(quote, missingFields);
  const products = items.map((item) => ({
    name: item.description,
    quantity: item.quantity,
    unitary_value: money(item.unit_price)
  }));

  if (products.length === 0) missingFields.push("quote.items");

  const service = shipment?.service_code ?? undefined;
  if (!service) missingFields.push("shipment.service_code");

  return {
    payload: {
      service,
      from,
      to,
      products,
      options: {
        insurance_value: money(quote.grand_total),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true
      },
      volumes: []
    },
    missingFields: [...missingFields, "volumes"]
  };
}

function buildFromAddress(tenant: TenantShippingProfile, missingFields: string[]): MelhorEnvioAddressPayload {
  requireField(tenant.name, "tenant.name", missingFields);
  requireField(tenant.company_phone, "tenant.company_phone", missingFields);
  requireField(tenant.company_document, "tenant.company_document", missingFields);
  requireField(tenant.postal_code, "tenant.postal_code", missingFields);
  requireField(tenant.address_line, "tenant.address_line", missingFields);
  requireField(tenant.address_number, "tenant.address_number", missingFields);
  requireField(tenant.district, "tenant.district", missingFields);
  requireField(tenant.city, "tenant.city", missingFields);
  requireField(tenant.state, "tenant.state", missingFields);

  return {
    name: tenant.name,
    phone: onlyDigits(tenant.company_phone),
    document: onlyDigits(tenant.company_document),
    company_document: onlyDigits(tenant.company_document),
    postal_code: onlyDigits(tenant.postal_code),
    address: tenant.address_line ?? undefined,
    number: tenant.address_number ?? undefined,
    complement: tenant.address_complement ?? undefined,
    district: tenant.district ?? undefined,
    city: tenant.city ?? undefined,
    country_id: "BR",
    state_abbr: tenant.state?.toUpperCase()
  };
}

function buildToAddress(quote: QuoteDetail, missingFields: string[]): MelhorEnvioAddressPayload {
  requireField(quote.customer_name, "customer.name", missingFields);
  requireField(quote.customer_phone, "customer.phone", missingFields);
  requireField(quote.customer_document, "customer.document", missingFields);
  requireField(quote.customer_postal_code, "customer.postal_code", missingFields);
  requireField(quote.customer_address_line, "customer.address_line", missingFields);
  requireField(quote.customer_address_number, "customer.address_number", missingFields);
  requireField(quote.customer_district, "customer.district", missingFields);
  requireField(quote.customer_city, "customer.city", missingFields);
  requireField(quote.customer_state, "customer.state", missingFields);

  return {
    name: quote.customer_name ?? undefined,
    phone: onlyDigits(quote.customer_phone),
    email: quote.customer_email ?? undefined,
    document: onlyDigits(quote.customer_document),
    postal_code: onlyDigits(quote.customer_postal_code),
    address: quote.customer_address_line ?? undefined,
    number: quote.customer_address_number ?? undefined,
    complement: quote.customer_address_complement ?? undefined,
    district: quote.customer_district ?? undefined,
    city: quote.customer_city ?? undefined,
    country_id: "BR",
    state_abbr: quote.customer_state?.toUpperCase()
  };
}

function requireField(value: string | null | undefined, field: string, missingFields: string[]) {
  if (!value?.trim()) missingFields.push(field);
}

function onlyDigits(value: string | null | undefined): string | undefined {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || undefined;
}

function money(value: string): number {
  return Number(Number(value).toFixed(2));
}
