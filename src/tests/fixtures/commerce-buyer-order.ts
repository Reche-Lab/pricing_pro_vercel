import type { buyerOrders } from "@/repositories/commerce";
import { savedBuyerQuote, quoteCart } from "./commerce-quote";
export const buyerOrder = {
  id: "aaaaaaaa-0000-4000-8000-000000000001", created_at: "2026-11-10T12:00:00Z", total_cents: 16200, subtotal_cents: 15000, shipping_cents: 1200,
  payment_status: "paid", fulfillment_status: "production", provider: "manual", checkout_url: null, payment_environment: "production",
  items: quoteCart.calculation!.items, address: savedBuyerQuote.contact.address, billing: { ...savedBuyerQuote.contact.billing, personType: "F" }, deliveryAddressSameAsBilling: true,
  delivery: "delivery", shippingOption: { id: "sedex", name: "Correios - SEDEX", priceCents: 1200 }, production: savedBuyerQuote.snapshot.production,
  artworkDiscountCents: 0, hasTerms: true, termsVersion: "test",
} as Awaited<ReturnType<typeof buyerOrders>>[number];
