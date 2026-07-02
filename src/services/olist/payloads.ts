import type { CustomerRow } from "@/repositories/customers";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import type { TenantMemberRow } from "@/repositories/users";

export function buildOlistCustomerPayload(customer: CustomerRow) {
  return {
    codigo: customer.id,
    nome: customer.name,
    tipoPessoa: documentType(customer.document),
    cpfCnpj: digits(customer.document),
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
    },
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

export function buildOlistCustomerLookupPayload(quote: QuoteDetail) {
  return {
    codigo: quote.customer_id,
    id: quote.customer_external_olist_id,
    cpfCnpj: digits(quote.customer_document),
    email: quote.customer_email,
    celular: digits(quote.customer_phone),
    nome: quote.customer_name
  };
}

export function buildOlistCrmQuotePayload(input: { quote: QuoteDetail; items: QuoteItemRow[] }) {
  const summary = quoteSummary(input);
  return {
    idContato: numericId(input.quote.customer_external_olist_id),
    descricao: `Orçamento ${input.quote.id} - ${input.quote.customer_name ?? "cliente"}`,
    data: dateOnly(input.quote.created_at),
    observacoes: buildOlistNotes(input),
    external_reference: input.quote.id,
    status: input.quote.status,
    customer: summary.customer,
    totals: summary.totals,
    valid_until: input.quote.valid_until,
    notes: input.quote.notes,
    items: summary.items,
    quote: summary
  };
}

export function buildOlistSalesOrderPayload(input: { quote: QuoteDetail; items: QuoteItemRow[] }) {
  const summary = quoteSummary(input);
  return {
    idContato: numericId(input.quote.customer_external_olist_id),
    data: dateOnly(input.quote.created_at),
    dataPrevista: dateOnly(input.quote.valid_until),
    observacoes: buildOlistNotes(input),
    observacoesInternas: `Pricing Pro quote ${input.quote.id}`,
    valorFrete: money(input.quote.shipping_total),
    valorDesconto: money(input.quote.discount_total),
    enderecoEntrega: quoteDeliveryAddress(input.quote),
    itens: input.items.map((item) => nativeOrderItem(item)),
    external_reference: input.quote.id,
    source: "pricing_pro",
    customer: summary.customer,
    totals: summary.totals,
    items: summary.items,
    notes: input.quote.notes
  };
}

export function buildOlistInvoicePayload(input: { quote: QuoteDetail; items: QuoteItemRow[] }) {
  const summary = quoteSummary(input);
  return {
    modelo: 55,
    enviarEmail: true,
    idPedido: numericId(input.quote.external_olist_order_id),
    external_reference: input.quote.id,
    cliente: {
      id: numericId(input.quote.customer_external_olist_id),
      nome: input.quote.customer_name,
      cpfCnpj: digits(input.quote.customer_document),
      email: input.quote.customer_email,
      endereco: quoteDeliveryAddress(input.quote)
    },
    itens: input.items.map((item) => nativeOrderItem(item)),
    valorFrete: money(input.quote.shipping_total),
    valorDesconto: money(input.quote.discount_total),
    observacoes: buildOlistNotes(input),
    customer: summary.customer,
    totals: summary.totals,
    products: summary.items,
    fiscal_note: input.quote.notes,
    quote: summary
  };
}

export function missingOlistSkus(items: QuoteItemRow[]) {
  return items
    .filter((item) => !item.sku?.trim())
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

function quoteTotals(quote: QuoteDetail) {
  return {
    subtotal: money(quote.subtotal),
    shipping: money(quote.shipping_total),
    discount: money(quote.discount_total),
    grand_total: money(quote.grand_total),
    margin_amount: money(quote.margin_amount),
    margin_percent: Number(quote.margin_percent)
  };
}

function quoteSummary(input: { quote: QuoteDetail; items: QuoteItemRow[] }) {
  return {
    id: input.quote.id,
    status: input.quote.status,
    created_at: input.quote.created_at,
    valid_until: input.quote.valid_until,
    customer: {
      id: input.quote.customer_external_olist_id ?? input.quote.customer_id,
      local_id: input.quote.customer_id,
      external_olist_id: input.quote.customer_external_olist_id,
      name: input.quote.customer_name,
      document: digits(input.quote.customer_document),
      email: input.quote.customer_email,
      phone: digits(input.quote.customer_phone),
      address: quoteAddress(input.quote)
    },
    totals: quoteTotals(input.quote),
    items: input.items.map((item) => quoteItemProduct(item)),
    shipping: {
      total: money(input.quote.shipping_total)
    },
    notes: input.quote.notes
  };
}

function quoteAddress(quote: QuoteDetail) {
  return {
    postal_code: digits(quote.customer_postal_code),
    street: quote.customer_address_line,
    number: quote.customer_address_number,
    complement: quote.customer_address_complement,
    district: quote.customer_district,
    city: quote.customer_city,
    state: quote.customer_state?.toUpperCase(),
    country: "BR"
  };
}

function quoteDeliveryAddress(quote: QuoteDetail) {
  return {
    endereco: quote.customer_address_line,
    enderecoNro: quote.customer_address_number,
    complemento: quote.customer_address_complement,
    bairro: quote.customer_district,
    municipio: quote.customer_city,
    cep: digits(quote.customer_postal_code),
    uf: quote.customer_state?.toUpperCase(),
    fone: digits(quote.customer_phone),
    nomeDestinatario: quote.customer_name,
    cpfCnpj: digits(quote.customer_document),
    tipoPessoa: documentType(quote.customer_document)
  };
}

function quoteItemProduct(item: QuoteItemRow) {
  return {
    external_reference: item.id,
    product_variant_id: item.product_variant_id,
    sku: item.sku,
    description: item.description,
    artwork_name: item.artwork_name,
    quantity: item.quantity,
    unit_price: money(item.unit_price),
    total_price: money(item.total_price),
    pricing_rule: item.pricing_rule,
    reference_quantity: item.reference_quantity,
    base_unit_price: item.base_unit_price ? money(item.base_unit_price) : null
  };
}

function nativeOrderItem(item: QuoteItemRow) {
  const numericSku = numericId(item.sku);
  return {
    produto: numericSku ? { id: numericSku, tipo: "P" } : { codigo: item.sku, tipo: "P" },
    codigo: item.sku,
    descricao: item.description,
    quantidade: item.quantity,
    valorUnitario: money(item.unit_price),
    valorTotal: money(item.total_price),
    infoAdicional: [item.description, item.artwork_name ? `Arte: ${item.artwork_name}` : null]
      .filter(Boolean)
      .join(" | ")
  };
}

function buildOlistNotes(input: { quote: QuoteDetail; items: QuoteItemRow[] }) {
  const itemLines = input.items.map((item, index) => {
    const art = item.artwork_name ? ` | Arte: ${item.artwork_name}` : "";
    return `${index + 1}. ${item.sku ?? "sem SKU"} - ${item.description}${art} - ${item.quantity} un. x ${money(item.unit_price).toFixed(2)} = ${money(item.total_price).toFixed(2)}`;
  });
  return [
    input.quote.notes,
    `Orçamento Pricing Pro: ${input.quote.id}`,
    `Frete: ${money(input.quote.shipping_total).toFixed(2)}`,
    `Total final: ${money(input.quote.grand_total).toFixed(2)}`,
    itemLines.join("\n")
  ].filter(Boolean).join("\n");
}

function digits(value: string | null | undefined): string | null {
  const output = value?.replace(/\D/g, "") ?? "";
  return output || null;
}

function documentType(value: string | null | undefined): "F" | "J" | null {
  const cleaned = digits(value);
  if (!cleaned) return null;
  return cleaned.length > 11 ? "J" : "F";
}

function numericId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function money(value: string): number {
  return Number(Number(value).toFixed(2));
}
