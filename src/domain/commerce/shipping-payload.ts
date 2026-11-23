import { isValidCpfOrCnpj } from "@/lib/validation/documents";
import { CommerceError } from "./commerce";
import { carrierSnapshotSchema, type CarrierSnapshot } from "./order-shipping";
import type { CommerceOrder } from "@/repositories/commerce";
import type { TenantShippingProfile } from "@/repositories/tenant-settings";

export function buildCommerceShipmentPayload(order: CommerceOrder, tenant: TenantShippingProfile, carrier: CarrierSnapshot, invoiceKey: string, stateRegister: string) {
  carrierSnapshotSchema.parse(carrier);
  const address = order.snapshot.address;
  if (!address) throw new CommerceError("Complete o endereço de entrega do pedido.", 409);
  if (digits(address.postalCode) !== carrier.destinationPostalCode || digits(tenant.postal_code) !== carrier.originPostalCode)
    throw new CommerceError("O CEP de origem ou destino mudou desde a compra. Confira o envio antes de emitir a etiqueta.", 409);
  if (!/^\d{44}$/.test(invoiceKey)) throw new CommerceError("Informe a chave da NF-e autorizada, com 44 dígitos, para o envio comercial.", 409);
  if (!stateRegister.trim()) throw new CommerceError("Informe a inscrição estadual do remetente ou ISENTO, quando aplicável.", 409);
  const document = digits(address.document || order.snapshot.billing?.document);
  const senderDocument = digits(tenant.company_document);
  if (!isValidCpfOrCnpj(document)) throw new CommerceError("Complete o CPF/CNPJ válido do destinatário no pedido.", 409);
  if (!isValidCpfOrCnpj(senderDocument)) throw new CommerceError("Confira o CPF/CNPJ do remetente em Configurações > Geral.", 409);
  const sender = { name: tenant.name, phone: digits(tenant.company_phone), postal_code: digits(tenant.postal_code), address: tenant.address_line, number: tenant.address_number, district: tenant.district, city: tenant.city, state_abbr: tenant.state?.toUpperCase(), country_id: "BR", complement: tenant.address_complement ?? undefined,
    ...documentFields(senderDocument), state_register: stateRegister };
  const recipient = { name: address.name, phone: digits(address.phone), postal_code: digits(address.postalCode), address: address.street, number: address.number, district: address.district, city: address.city, state_abbr: address.state, country_id: "BR", email: order.snapshot.customer.email,
    complement: [address.complement, address.attention ? `A/C: ${address.attention}` : ""].filter(Boolean).join(" | ").slice(0, 120), ...documentFields(document) };
  for (const [name, party] of [["remetente", sender], ["destinatário", recipient]] as const) {
    if (![party.name, party.phone, party.postal_code, party.address, party.number, party.district, party.city, party.state_abbr].every(value => typeof value === "string" && value.trim()) || !/^\d{10,15}$/.test(party.phone) || !/^[A-Z]{2}$/.test(party.state_abbr ?? ""))
      throw new CommerceError(`Complete nome, telefone com DDD e endereço do ${name} antes de gerar a etiqueta.`, 409);
  }
  const service = order.snapshot.shippingOption?.id.split(":")[1];
  if (!service || !/^[1-9]\d*$/.test(service)) throw new CommerceError("O serviço contratado não é válido para emitir a etiqueta.", 409);
  // A separate label per volume also supports carriers that reject multi-volume labels.
  const count = carrier.volumes.length;
  const products = distributeShipmentProducts(order.snapshot.items, count);
  return carrier.volumes.map((volume, index) => ({
    service: Number(service), from: sender, to: recipient, products: products[index],
    volumes: [{ width: volume.width, height: volume.height, length: volume.length, weight: volume.weight }],
    options: { insurance_value: centsPart(carrier.insuranceValueCents, count, index) / 100, receipt: false, own_hand: false, reverse: false, non_commercial: false,
      invoice: { key: invoiceKey }, tags: [{ tag: `commerce:${order.id}:${index}` }] },
  }));
}
export function distributeShipmentProducts(items: CommerceOrder["snapshot"]["items"], count: number) {
  const result: Array<Array<{ name: string; quantity: number; unitary_value: number }>> = Array.from({ length: count }, () => []);
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  if (total < count) throw new CommerceError("Há mais volumes do que unidades no pedido. Confira a embalagem.", 409);
  let position = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.totalCents) || item.totalCents < 0) throw new CommerceError("Confira quantidades e valores dos produtos.", 409);
    const floor = Math.floor(item.totalCents / item.quantity), remainder = item.totalCents % item.quantity;
    // Split both quantity and cents, without multiplying the value by the number of labels.
    for (let parcel = 0; parcel < count; parcel++) {
      const offset = (parcel - position % count + count) % count;
      if (offset >= item.quantity) continue;
      const quantity = Math.floor((item.quantity - 1 - offset) / count) + 1;
      const extra = offset < remainder ? Math.floor((remainder - 1 - offset) / count) + 1 : 0;
      if (quantity - extra) result[parcel].push({ name: item.name.slice(0, 120), quantity: quantity - extra, unitary_value: floor / 100 });
      if (extra) result[parcel].push({ name: item.name.slice(0, 120), quantity: extra, unitary_value: (floor + 1) / 100 });
    }
    position += item.quantity;
  }
  return result;
}
const documentFields = (value: string) => value.length === 14 ? { company_document: value } : { document: value };
export const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
export const centsPart = (total: number, count: number, index: number) => Math.floor(total / count) + (index < total % count ? 1 : 0);
