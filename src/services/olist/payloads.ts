import type { CustomerRow } from "@/repositories/customers";
import type { QuotePaymentTermRow } from "@/repositories/olist-payment-options";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import type { ShipmentRow } from "@/repositories/shipments";
import type { TenantMemberRow } from "@/repositories/users";
import type { OlistSettings } from "./types";

export function buildOlistCustomerPayload(customer: CustomerRow, options?: { personType?: "F" | "J" | null }) {
  return compactObject({
    codigo: olistCustomerCode(customer.id),
    nome: customer.name,
    tipoPessoa: options?.personType ?? documentType(customer.document),
    cpfCnpj: digits(customer.document),
    email: customer.email,
    telefone: digits(customer.phone),
    celular: digits(customer.phone),
    situacao: "B",
    endereco: {
      endereco: customer.address_line,
      numero: customer.address_number,
      complemento: customer.address_complement,
      bairro: customer.district,
      municipio: customer.city,
      cep: digits(customer.postal_code),
      uf: customer.state?.toUpperCase(),
      pais: "Brasil"
    }
  });
}

export function buildOlistCustomerLookupPayload(quote: QuoteDetail) {
  return {
    codigo: olistCustomerCode(quote.customer_id),
    id: quote.customer_external_olist_id,
    cpfCnpj: digits(quote.customer_document),
    email: quote.customer_email,
    celular: digits(quote.customer_phone),
    nome: quote.customer_name
  };
}

export function buildOlistCrmQuotePayload(input: {
  quote: QuoteDetail;
  items: QuoteItemRow[];
  description?: string | null;
  date?: string | null;
}) {
  return compactObject({
    idContato: numericId(input.quote.customer_external_olist_id),
    descricao: input.description || `Orçamento ${input.quote.id} - ${input.quote.customer_name ?? "cliente"}`,
    data: input.date || dateOnly(input.quote.created_at)
  });
}

export function buildOlistSalesOrderPayload(input: {
  quote: QuoteDetail;
  items: QuoteItemRow[];
  shipment?: ShipmentRow | null;
  paymentTerm?: QuotePaymentTermRow | null;
  settings?: OlistSettings;
}) {
  return compactObject({
    idContato: numericId(input.quote.customer_external_olist_id),
    data: dateOnly(input.quote.created_at),
    dataPrevista: dateOnly(input.quote.valid_until),
    observacoes: buildOlistNotes(input),
    observacoesInternas: [
      `Pricing Pro quote ${input.quote.id}`,
      buildPackageLine(input.shipment)
    ].filter(Boolean).join("\n"),
    valorFrete: money(input.quote.shipping_total),
    valorDesconto: money(input.quote.discount_total),
    enderecoEntrega: quoteDeliveryAddress(input.quote),
    ecommerce: { numeroPedidoEcommerce: input.quote.id },
    transportador: buildOlistTransportadorPayload(input.shipment, input.settings),
    pagamento: buildPaymentPayload(input.paymentTerm),
    itens: input.items.map((item) => nativeOrderItem(item))
  });
}

export function buildOlistSalesOrderItemsUpdatePayload(items: QuoteItemRow[]) {
  return {
    itens: items.map((item) => nativeOrderItem(item))
  };
}

export function buildOlistSalesOrderDispatchPayload(input: {
  quote: QuoteDetail;
  shipment?: ShipmentRow | null;
  settings?: OlistSettings;
}) {
  const packageSummary = summarizeShipmentPackage(input.shipment);
  const transportador = buildOlistTransportadorPayload(input.shipment, input.settings);
  const trackingCode = stringOrNull(input.shipment?.tracking_code);
  const trackingUrl = shipmentTrackingUrl(input.shipment);

  return compactObject({
    codigoRastreamento: trackingCode,
    urlRastreamento: trackingUrl,
    formaEnvio: transportador?.formaEnvio,
    formaFrete: transportador?.formaFrete,
    fretePagoEmpresa: money(input.quote.shipping_total),
    dataPrevista: dateOnly(input.quote.valid_until),
    volumes: packageSummary?.volumes,
    pesoBruto: packageSummary?.grossWeightKg,
    pesoLiquido: packageSummary?.netWeightKg,
    observacoes: [
      input.shipment?.service_name ? `Serviço: ${input.shipment.service_name}` : null,
      packageSummary ? `Caixa: ${packageSummary.dimensions}` : null,
      trackingCode ? `Rastreio: ${trackingCode}` : null,
      trackingUrl ? `URL rastreio: ${trackingUrl}` : null
    ].filter(Boolean).join("\n")
  });
}

export function buildOlistInvoicePayload(input: { quote: QuoteDetail; items: QuoteItemRow[] }) {
  void input;
  return compactObject({
    modelo: 55,
  });
}

export function buildOlistInvoiceEmitPayload() {
  return {
    enviarEmail: true
  };
}

export function buildOlistInvoiceCancelPayload(input: {
  numeroNota: string;
  serieNota?: string | null;
  modeloNota?: string | null;
  estornarContas?: "S" | "N";
  estornarEstoque?: "S" | "N";
}) {
  return compactObject({
    numeroNota: input.numeroNota,
    serieNota: input.serieNota,
    modeloNota: input.modeloNota || "55",
    estornarContas: input.estornarContas || "N",
    estornarEstoque: input.estornarEstoque || "N"
  });
}

export function missingOlistSkus(items: QuoteItemRow[]) {
  return items
    .filter((item) => !olistProductId(item))
    .map((item) => item.description || item.id);
}

export function buildOlistUserPayload(member: TenantMemberRow) {
  return {
    id: member.external_olist_user_id,
    nome: member.name,
    email: member.email,
    tipo: member.role_key === "sales" ? "vendedor" : "",
    external_reference: member.membership_id
  };
}

export function buildOlistTaskPayload(input: {
  member: TenantMemberRow;
  title: string;
  description?: string | null;
  dueAt?: string | null;
}) {
  return {
    descricao: input.description || input.title,
    tipoData: input.dueAt ? "D" : "Q",
    data: input.dueAt,
    idUsuarioResponsavel: numericId(input.member.external_olist_user_id),
    external_reference: `tenant-member:${input.member.membership_id}:${Date.now()}`
  };
}

function quoteDeliveryAddress(quote: QuoteDetail) {
  const state = normalizeBrazilianState(quote.customer_state);
  const postalCode = digits(quote.customer_postal_code);
  const addressLine = cleanString(quote.customer_address_line);
  const city = cleanString(quote.customer_city);
  if (!state || !postalCode || !addressLine || !city) return null;

  return {
    endereco: quote.customer_address_line,
    enderecoNro: quote.customer_address_number,
    complemento: quote.customer_address_complement,
    bairro: quote.customer_district,
    municipio: quote.customer_city,
    cep: postalCode,
    uf: state,
    fone: digits(quote.customer_phone),
    nomeDestinatario: quote.customer_name,
    cpfCnpj: digits(quote.customer_document),
    tipoPessoa: documentType(quote.customer_document)
  };
}

function nativeOrderItem(item: QuoteItemRow) {
  const productId = olistProductId(item);
  return compactObject({
    produto: { id: productId, tipo: "P" },
    quantidade: item.quantity,
    valorUnitario: money(item.unit_price),
    infoAdicional: [item.description, item.artwork_name ? `Arte: ${item.artwork_name}` : null]
      .filter(Boolean)
      .join(" | ")
  });
}

function buildPaymentPayload(paymentTerm: QuotePaymentTermRow | null | undefined) {
  if (!paymentTerm) return null;
  const formaRecebimentoId = numericId(paymentTerm.receiving_method_external_id);
  const categoriaId = numericId(paymentTerm.category_external_id);
  const parcelas = paymentTerm.installments.map((installment) => compactObject({
    dias: installment.days,
    data: installment.dueDate,
    valor: money(installment.amount),
    observacoes: [
      installment.notes,
      installment.receivingMethodName ? `Forma de recebimento: ${installment.receivingMethodName}` : null
    ].filter(Boolean).join(" | "),
    formaRecebimento: paymentObject(numericId(installment.receivingMethodExternalId) ?? formaRecebimentoId)
  }));

  return compactObject({
    formaRecebimento: paymentObject(formaRecebimentoId),
    categoria: categoriaId ? { id: categoriaId } : null,
    parcelas: parcelas.length ? parcelas : null
  });
}

export function buildOlistTransportadorPayload(
  shipment: ShipmentRow | null | undefined,
  settings: OlistSettings | undefined
) {
  if (!shipment || !settings) return null;
  const formaEnvioId = shippingMethodId(shipment, settings);
  const formaFreteId = freightServiceId(shipment, settings);
  const trackingCode = stringOrNull(shipment.tracking_code);
  const trackingUrl = shipmentTrackingUrl(shipment);

  if (!formaEnvioId && !formaFreteId && !trackingCode && !trackingUrl) return null;

  return compactObject({
    fretePorConta: settings.default_frete_por_conta || "D",
    formaEnvio: paymentObject(formaEnvioId),
    formaFrete: paymentObject(formaFreteId),
    codigoRastreamento: trackingCode,
    urlRastreamento: trackingUrl
  });
}

function paymentObject(id: number | null) {
  return id ? { id } : null;
}

function buildOlistNotes(input: { quote: QuoteDetail; items: QuoteItemRow[]; shipment?: ShipmentRow | null }) {
  const itemLines = input.items.map((item, index) => {
    const art = item.artwork_name ? ` | Arte: ${item.artwork_name}` : "";
    const olistId = item.external_olist_product_id ? ` | Olist ID: ${item.external_olist_product_id}` : "";
    return `${index + 1}. SKU ${item.sku ?? "-"}${olistId} - ${item.description}${art} - ${item.quantity} un. x ${money(item.unit_price).toFixed(2)} = ${money(item.total_price).toFixed(2)}`;
  });
  return [
    input.quote.notes,
    `Orçamento Pricing Pro: ${input.quote.id}`,
    `Frete: ${money(input.quote.shipping_total).toFixed(2)}`,
    buildPackageLine(input.shipment),
    `Total final: ${money(input.quote.grand_total).toFixed(2)}`,
    itemLines.join("\n")
  ].filter(Boolean).join("\n");
}

function buildPackageLine(shipment: ShipmentRow | null | undefined) {
  const summary = summarizeShipmentPackage(shipment);
  if (!summary) return null;
  return `Embalagem/frete: ${summary.volumes} volume(s), caixa ${summary.dimensions}, peso bruto ${summary.grossWeightKg.toFixed(3)} kg.`;
}

function summarizeShipmentPackage(shipment: ShipmentRow | null | undefined) {
  const packaging = shipment?.packaging_snapshot;
  if (!packaging) return null;

  const width = numberOrNull(packaging.box.widthCm);
  const length = numberOrNull(packaging.box.lengthCm);
  const height = numberOrNull(packaging.box.heightCm);
  const grossWeightKg = numberOrNull(packaging.grossWeightKg);
  const volumes = numberOrNull(packaging.boxesNeeded);
  if (!width || !length || !height || !grossWeightKg || !volumes) return null;

  return {
    dimensions: `${formatDimension(width)} x ${formatDimension(length)} x ${formatDimension(height)} cm`,
    grossWeightKg,
    netWeightKg: numberOrNull(packaging.netWeightKg) ?? grossWeightKg,
    volumes
  };
}

function shippingMethodId(shipment: ShipmentRow, settings: OlistSettings) {
  if (shipment.provider === "melhor_envio") return numericId(settings.melhor_envio_forma_envio_id);
  if (shipment.provider === "correios") return numericId(settings.correios_forma_envio_id);
  if (shipment.provider === "pickup" || shipment.provider === "retirada") return numericId(settings.pickup_forma_envio_id);
  if (shipment.provider === "carrier" || shipment.provider === "transportadora") return numericId(settings.carrier_forma_envio_id);
  return null;
}

function freightServiceId(shipment: ShipmentRow, settings: OlistSettings) {
  const normalized = `${shipment.service_name ?? ""} ${shipment.service_code ?? ""}`.toUpperCase();
  if (normalized.includes("SEDEX")) return numericId(settings.sedex_forma_frete_id);
  if (normalized.includes("PAC")) return numericId(settings.pac_forma_frete_id);
  return null;
}

function shipmentTrackingUrl(shipment: ShipmentRow | null | undefined) {
  const selectedQuoteUrl = pickNestedString(shipment?.selected_quote, ["tracking_url", "trackingUrl", "urlRastreamento"]);
  if (selectedQuoteUrl) return selectedQuoteUrl;
  if (shipment?.label_url) return shipment.label_url;
  const trackingCode = stringOrNull(shipment?.tracking_code);
  if (!trackingCode) return null;
  if (shipment?.provider === "melhor_envio") return `https://www.melhorenvio.com.br/rastreamento/${encodeURIComponent(trackingCode)}`;
  return null;
}

function digits(value: unknown): string | null {
  const output = typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\D/g, "")
    : "";
  return output || null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function pickNestedString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = stringOrNull(record[key]);
    if (direct) return direct;
  }
  for (const item of Object.values(record)) {
    const nested = pickNestedString(item, keys);
    if (nested) return nested;
  }
  return null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBrazilianState(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const state = value.trim().toUpperCase();
  const validStates = new Set([
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ]);
  return validStates.has(state) ? state : null;
}

function olistCustomerCode(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/[^a-zA-Z0-9]/g, "");
  if (!normalized) return null;
  return `PP${normalized}`.slice(0, 15);
}

function documentType(value: unknown): "F" | "J" | null {
  const cleaned = digits(value);
  if (!cleaned) return null;
  return cleaned.length > 11 ? "J" : "F";
}

function numericId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

function olistProductId(item: QuoteItemRow): number | null {
  return numericId(item.external_olist_product_id) ?? numericId(item.sku);
}

function dateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

function money(value: unknown): number {
  return Number(Number(value).toFixed(2));
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatDimension(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function compactObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => compactObject(item)) as T;
  }

  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, compactObject(item)])
      .filter(([, item]) => item !== null && item !== undefined && item !== "")
  ) as T;
}
