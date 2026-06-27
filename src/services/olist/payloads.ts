import type { CustomerRow } from "@/repositories/customers";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";

export function buildOlistCustomerPayload(customer: CustomerRow) {
  return {
    external_reference: customer.id,
    name: customer.name,
    document: digits(customer.document),
    email: customer.email,
    phone: digits(customer.phone),
    address: {
      postal_code: digits(customer.postal_code),
      street: customer.address_line,
      number: customer.address_number,
      complement: customer.address_complement,
      district: customer.district,
      city: customer.city,
      state: customer.state?.toUpperCase(),
      country: "BR"
    }
  };
}

export function buildOlistCrmQuotePayload(input: { quote: QuoteDetail; items: QuoteItemRow[] }) {
  return {
    external_reference: input.quote.id,
    status: input.quote.status,
    customer: {
      id: input.quote.customer_id,
      external_olist_id: input.quote.customer_external_olist_id,
      name: input.quote.customer_name,
      document: digits(input.quote.customer_document),
      email: input.quote.customer_email,
      phone: digits(input.quote.customer_phone)
    },
    totals: {
      subtotal: money(input.quote.subtotal),
      shipping: money(input.quote.shipping_total),
      discount: money(input.quote.discount_total),
      grand_total: money(input.quote.grand_total),
      margin_amount: money(input.quote.margin_amount),
      margin_percent: Number(input.quote.margin_percent)
    },
    valid_until: input.quote.valid_until,
    notes: input.quote.notes,
    items: input.items.map((item) => ({
      external_reference: item.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: money(item.unit_price),
      total_price: money(item.total_price)
    }))
  };
}

function digits(value: string | null | undefined): string | null {
  const output = value?.replace(/\D/g, "") ?? "";
  return output || null;
}

function money(value: string): number {
  return Number(Number(value).toFixed(2));
}
