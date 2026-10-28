"use client";

export const QUOTE_CUSTOMER_IMPORT_EVENT = "quote-customer-delivery:import-olist";

export function requestQuoteCustomerImport(quoteId: string, externalId: string) {
  window.dispatchEvent(new CustomEvent(QUOTE_CUSTOMER_IMPORT_EVENT, { detail: { quoteId, externalId } }));
}
