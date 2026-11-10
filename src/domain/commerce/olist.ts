import { z } from "zod";
import { CommerceError } from "./commerce";
import type { CommerceOrder } from "@/repositories/commerce";
import type { OlistSettings } from "@/services/olist/types";
import type { SelectedPackage } from "@/domain/shipping/types";

const externalId = z.string().regex(/^(?:[1-9]\d{0,14})?$/, "Selecione uma opção Olist válida.").default("");
export const commerceOlistSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  autoInvoice: z.boolean().default(true),
  autoDispatch: z.boolean().default(true),
  sendInvoiceEmail: z.boolean().default(true),
  pixReceivingId: externalId,
  cardReceivingId: externalId,
  manualReceivingId: externalId,
  categoryId: externalId,
}).strict();
export type CommerceOlistSettings = z.infer<typeof commerceOlistSettingsSchema>;
export type CommerceOlistStage = "customer" | "sales_order" | "shipping" | "invoice_create" | "invoice_authorize" | "invoice_status" | "dispatch" | "tracking";
export type CommerceOlistJob = {
  tenant_id: string; order_id: string; customer_id: string | null; sales_order_id: string | null;
  invoice_id: string | null; invoice_number: string | null; invoice_series: string | null; invoice_status: number | null;
  invoice_link: string | null; authorization_requested_at: string | null; email_requested_at: string | null; expedition_id: string | null;
  production_completed_at: string | null; package_snapshot: SelectedPackage | null;
  shipping_synced_at: string | null;
  payment_kind: "pix" | "card" | "manual" | "other" | null;
  tracking_code: string | null; tracking_url: string | null;
  attempt_stage: CommerceOlistStage | null; attempts: number;
  status: "pending" | "processing" | "waiting" | "blocked" | "review" | "done" | "stopped";
  next_attempt_at: string; last_error: string | null; error_code: string | null; debug_id: string | null;
};
export const commerceOlistStageLabels: Record<CommerceOlistStage, string> = {
  customer: "Cliente Olist", sales_order: "Pedido de venda", invoice_create: "Gerar nota fiscal",
  shipping: "Conferir transporte e volumes",
  invoice_authorize: "Autorizar nota fiscal", invoice_status: "Conferir autorização fiscal", dispatch: "Expedição Olist", tracking: "Rastreamento",
};
export function commerceOlistShippingBlock(settings: CommerceOlistSettings, job: Pick<CommerceOlistJob, "production_completed_at" | "invoice_status" | "expedition_id"> | null, pickup: boolean): string | null {
  if (!settings.enabled || !settings.autoInvoice) return null;
  if (!job?.production_completed_at || ![6, 7].includes(job.invoice_status ?? 0)) return "Conclua a produção no painel Olist e aguarde a autorização da NF-e antes de enviar.";
  if (settings.autoDispatch && !pickup && !job.expedition_id) return "Aguarde a confirmação da expedição Olist antes de marcar como enviado.";
  return null;
}
export function nextCommerceOlistStage(order: Pick<CommerceOrder, "payment_status" | "payment_environment" | "deleted_at" | "snapshot">, job: CommerceOlistJob, settings: CommerceOlistSettings): CommerceOlistStage | null {
  if (!settings.enabled || order.payment_status !== "paid" || order.payment_environment !== "production" || order.deleted_at) return null;
  if (!job.customer_id) return "customer";
  if (!job.sales_order_id) return "sales_order";
  if (!job.production_completed_at || !settings.autoInvoice) return null;
  if (order.snapshot.delivery !== "pickup" && !job.shipping_synced_at && !job.invoice_id) return "shipping";
  if (!job.invoice_id) return "invoice_create";
  if (![6, 7].includes(job.invoice_status ?? 0)) return job.authorization_requested_at ? "invoice_status" : "invoice_authorize";
  if (settings.autoDispatch && order.snapshot.delivery !== "pickup" && !job.expedition_id) return "dispatch";
  return null;
}
export type CommerceOlistProduct = { variant_id: string; external_id: string | null; sku: string | null };
export function buildCommerceOlistCustomer(order: CommerceOrder) {
  const billing = order.snapshot.billing;
  if (!billing) throw new CommerceError("Complete os dados de faturamento deste pedido.", 409);
  const document = billing.document.replace(/\D/g, "");
  return {
    codigo: `${document.length === 14 ? "J" : "F"}${document}`,
    nome: billing.name, tipoPessoa: billing.document.replace(/\D/g, "").length === 14 ? "J" : "F",
    cpfCnpj: document, email: billing.email,
    telefone: billing.phone.replace(/\D/g, ""), situacao: "B",
    endereco: { endereco: billing.street, numero: billing.number, complemento: billing.complement,
      bairro: billing.district, municipio: billing.city, cep: billing.postalCode.replace(/\D/g, ""), uf: billing.state, pais: "Brasil" },
  };
}
export function buildCommerceOlistOrder(order: CommerceOrder, customerId: string, products: CommerceOlistProduct[], settings: CommerceOlistSettings, integration: OlistSettings, kind: CommerceOlistJob["payment_kind"] = "manual", packaging?: SelectedPackage | null) {
  const receivingId = kind === "pix" ? settings.pixReceivingId : kind === "card" ? settings.cardReceivingId : kind === "manual" ? settings.manualReceivingId : "";
  if (!receivingId) throw new CommerceError("Configure a forma de recebimento deste pagamento em Loja online > Olist.", 409);
  const itens = order.snapshot.items.flatMap(item => {
    const variant = order.snapshot.products.find(product => product.id === item.productId)?.variantId;
    const product = products.find(product => product.variant_id === variant);
    if (!product?.external_id || !/^[1-9]\d*$/.test(product.external_id)) throw new CommerceError(`Cadastre o ID Olist do produto ${item.name} em Produtos. O SKU não substitui esse ID.`, 409);
    // Split integer cents when a group total is not divisible by its quantity.
    const base = item.totalCents + (item.artworkDiscountCents || 0);
    const unit = Math.floor(base / item.quantity), extra = base % item.quantity;
    return [{ quantity: item.quantity - extra, cents: unit }, { quantity: extra, cents: unit + 1 }].filter(row => row.quantity > 0).map(row => ({
      produto: { id: Number(product.external_id), tipo: "P" }, quantidade: row.quantity, valorUnitario: row.cents / 100,
      infoAdicional: [item.name, item.artworkName ? `Arte: ${item.artworkName}` : null].filter(Boolean).join(" | "),
    }));
  });
  const discount = order.snapshot.items.reduce((sum, item) => sum + (item.artworkDiscountCents || 0), 0);
  if (order.snapshot.items.reduce((sum, item) => sum + item.totalCents, 0) + order.shipping_cents !== order.total_cents)
    throw new CommerceError("O total dos itens diverge do valor pago. Revise o pedido antes de sincronizar.", 409);
  const address = order.snapshot.address;
  const transport = commerceOlistTransport(order, integration);
  return {
    idContato: Number(customerId), data: new Date(order.created_at).toISOString().slice(0, 10),
    ecommerce: { numeroPedidoEcommerce: order.id },
    observacoes: [`Compra na loja · ${order.id}`, `Pagamento confirmado: ${order.provider}`, order.snapshot.shippingOption?.name,
      packaging ? `Embalagem: ${packaging.box.widthCm} × ${packaging.box.lengthCm} × ${packaging.box.heightCm} cm; ${packaging.boxesNeeded} volume(s); peso bruto ${packaging.grossWeightKg} kg.` : null].filter(Boolean).join("\n"),
    valorFrete: order.shipping_cents / 100, valorDesconto: discount / 100,
    ...(address && order.snapshot.delivery !== "pickup" ? { enderecoEntrega: {
      nomeDestinatario: address.name, cpfCnpj: address.document.replace(/\D/g, ""), tipoPessoa: address.document.replace(/\D/g, "").length === 14 ? "J" : "F",
      endereco: address.street, enderecoNro: address.number, complemento: [address.complement, address.attention ? `A/C: ${address.attention}` : null].filter(Boolean).join(" | "),
      bairro: address.district, municipio: address.city, uf: address.state, cep: address.postalCode.replace(/\D/g, ""), fone: address.phone.replace(/\D/g, ""),
    } } : {}),
    transportador: transport,
    pagamento: { formaRecebimento: { id: Number(receivingId) }, ...(settings.categoryId ? { categoria: { id: Number(settings.categoryId) } } : {}),
      parcelas: [{ dias: 0, valor: order.total_cents / 100, formaRecebimento: { id: Number(receivingId) }, observacoes: "Recebido na loja. Não gerar nova cobrança ao comprador." }] },
    itens,
  };
}
export function commerceOlistTransport(order: CommerceOrder, settings: OlistSettings) {
  const pickup = order.snapshot.delivery === "pickup";
  const option = order.snapshot.shippingOption;
  const envio = pickup ? settings.pickup_forma_envio_id : option?.id.startsWith("melhor_envio:") ? settings.melhor_envio_forma_envio_id : settings.carrier_forma_envio_id;
  const frete = /sedex/i.test(option?.name ?? "") ? settings.sedex_forma_frete_id : /\bpac\b/i.test(option?.name ?? "") ? settings.pac_forma_frete_id : undefined;
  return { fretePorConta: pickup ? "S" : settings.default_frete_por_conta || "D", ...(envio ? { formaEnvio: { id: Number(envio) } } : {}), ...(frete ? { formaFrete: { id: Number(frete) } } : {}) };
}
