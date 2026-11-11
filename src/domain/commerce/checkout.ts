import type { CheckoutInput, CommerceAddress } from "./schemas";
import { CommerceError } from "./commerce";

export function resolveCheckoutDelivery(input: CheckoutInput): CommerceAddress | null {
  if (input.delivery === "pickup") return null;
  if (!input.deliveryAddressSameAsBilling) {
    if (!input.address) throw new CommerceError("Informe o endereço de entrega.");
    return { ...input.address, document: input.address.document.replace(/\D/g, "") || input.billing.document };
  }
  const { name, phone, document, postalCode, street, number, complement, district, city, state } = input.billing;
  return { name, phone, document, postalCode, street, number, complement, district, city, state, attention: "" };
}

export function formatCheckoutDocument(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits.length <= 11
    ? digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4")
    : digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatCheckoutPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  const withDdi = digits.length > 11 && digits.startsWith("55");
  const national = (withDdi ? digits.slice(2) : digits).slice(0, 11);
  const formatted = national.replace(/^(\d{2})(\d)/, "($1) $2").replace(national.length > 10 ? /(\d{5})(\d{1,4})$/ : /(\d{4})(\d{1,4})$/, "$1-$2");
  return withDdi ? `+55 ${formatted}` : formatted;
}
