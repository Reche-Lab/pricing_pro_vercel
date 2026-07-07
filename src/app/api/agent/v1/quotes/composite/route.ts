import { z } from "zod";
import { buildQuoteWhatsAppText } from "@/domain/whatsapp/quote";
import { getServerEnv } from "@/lib/env/server";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import { createPublicQuoteLink, createQuote, getQuoteDetail } from "@/repositories/quotes";
import { createShipmentDraft } from "@/repositories/shipments";
import {
  AgentApiError,
  logAgentAudit,
  resolveAgentPlatform,
  resolveAgentVariant
} from "@/repositories/agent";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { quoteMelhorEnvioShipping } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";
import { withAgentAuth } from "../../_shared";

const customerSchema = z.object({
  name: z.string().trim().min(2),
  document: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  addressNumber: z.string().trim().optional().nullable(),
  addressComplement: z.string().trim().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().max(2).optional().nullable()
});

const itemSchema = z.object({
  productSku: z.string().trim().optional(),
  productVariantId: z.string().uuid().optional(),
  productName: z.string().trim().optional(),
  quantity: z.number().int().min(1).max(50000),
  artworkName: z.string().trim().max(120).optional().nullable()
});

const compositeSchema = z.object({
  externalConversationId: z.string().trim().max(180).optional().nullable(),
  customer: customerSchema,
  platformSlug: z.string().trim().optional().nullable(),
  pricingRule: z.enum(["per_item", "per_art_average", "aggregate_total"]).default("per_item"),
  items: z.array(itemSchema).min(1).max(50),
  shipping: z.object({
    calculate: z.boolean().default(false),
    provider: z.enum(["melhor_envio"]).default("melhor_envio"),
    strategy: z.enum(["cheapest", "fastest"]).default("cheapest"),
    serviceCode: z.string().trim().optional().nullable()
  }).optional(),
  output: z.object({
    publicLink: z.boolean().default(true),
    pdf: z.boolean().default(true),
    whatsappText: z.boolean().default(true)
  }).optional(),
  validDays: z.number().int().min(1).max(90).default(7),
  notes: z.string().trim().max(2000).optional().nullable()
});

export async function POST(request: Request) {
  return withAgentAuth(
    request,
    "quotes:create",
    parseBody,
    async ({ context, body }) => {
      const platform = await resolveAgentPlatform(context, body.platformSlug);
      const resolvedItems = await Promise.all(
        body.items.map(async (item) => {
          const variant = await resolveAgentVariant(context, item);
          return {
            productVariantId: variant.variant_id,
            quantity: item.quantity,
            artworkName: item.artworkName ?? null,
            sku: variant.sku,
            description: `${variant.product_name} - ${variant.variant_name}`
          };
        })
      );

      const shipping = body.shipping?.calculate
        ? await calculateShipping(context, body.customer.postalCode, resolvedItems, body.shipping)
        : null;

      const quote = await createQuote(context.actorUserId, context.tenantId, {
        platformRuleId: platform.id,
        pricingRule: body.pricingRule,
        items: resolvedItems.map((item) => ({
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          artworkName: item.artworkName
        })),
        customerName: body.customer.name,
        customerDocument: body.customer.document,
        customerEmail: body.customer.email,
        customerPhone: body.customer.phone,
        customerPostalCode: body.customer.postalCode,
        customerAddressLine: body.customer.addressLine,
        customerAddressNumber: body.customer.addressNumber,
        customerAddressComplement: body.customer.addressComplement,
        customerDistrict: body.customer.district,
        customerCity: body.customer.city,
        customerState: body.customer.state,
        shippingTotal: shipping?.selected.price ?? 0,
        validDays: body.validDays,
        notes: [body.notes, body.externalConversationId ? `Conversa Lia Flow: ${body.externalConversationId}` : null]
          .filter(Boolean)
          .join("\n")
      });

      if (shipping) {
        await createShipmentDraft(context.actorUserId, context.tenantId, {
          quoteId: quote.id,
          provider: "melhor_envio",
          status: "quoted",
          serviceName: shipping.selected.serviceName,
          serviceCode: shipping.selected.serviceCode,
          shippingAmount: shipping.selected.price,
          rawQuote: shipping.raw,
          selectedQuote: shipping.selected.raw,
          packagingSnapshot: shipping.packaging
        });
      }

      const detail = await getQuoteDetail(context.actorUserId, context.tenantId, quote.id);
      if (!detail) throw new AgentApiError("quote_creation_failed", "Orçamento criado, mas não foi possível carregá-lo.", 500);

      const output = body.output ?? { publicLink: true, pdf: true, whatsappText: true };
      let publicUrl: string | null = null;
      if (output.publicLink) {
        const publicLink = await createPublicQuoteLink(context.actorUserId, context.tenantId, quote.id, 15);
        publicUrl = `${getServerEnv().APP_URL.replace(/\/$/, "")}/q/${publicLink.token}`;
      }

      await logAgentAudit(context, "agent.quotes.create_composite", {
        quoteId: quote.id,
        itemCount: resolvedItems.length,
        externalConversationId: body.externalConversationId
      });

      const pdfUrl = output.pdf
        ? `${getServerEnv().APP_URL.replace(/\/$/, "")}/api/agent/v1/quotes/${quote.id}/pdf`
        : null;
      const whatsappText = output.whatsappText
        ? buildQuoteWhatsAppText({ quote: detail.quote, items: detail.items })
        : null;

      return {
        status: 201,
        body: {
          ok: true,
          quoteId: quote.id,
          summary: `Orçamento criado com ${detail.items.length} item(ns). Total: ${currency(Number(detail.quote.grand_total))}.`,
          customer: { name: detail.quote.customer_name },
          items: detail.items.map((item) => ({
            description: item.description,
            artworkName: item.artwork_name,
            quantity: item.quantity,
            unitPrice: Number(item.unit_price),
            total: Number(item.total_price)
          })),
          shipping: shipping ? omitRawShipping(shipping.selected) : null,
          totals: {
            subtotal: Number(detail.quote.subtotal),
            shipping: Number(detail.quote.shipping_total),
            discount: Number(detail.quote.discount_total),
            grandTotal: Number(detail.quote.grand_total)
          },
          publicUrl,
          pdfUrl,
          whatsappText
        }
      };
    },
    { idempotent: true }
  );
}

function parseBody(body: unknown) {
  const parsed = compositeSchema.safeParse(body);
  if (!parsed.success) throw new AgentApiError("invalid_payload", "Payload de orçamento inválido.", 400);
  return parsed.data;
}

async function calculateShipping(
  context: { actorUserId: string; tenantId: string },
  customerPostalCode: string | null | undefined,
  items: Array<{ productVariantId: string; quantity: number }>,
  input: { strategy: "cheapest" | "fastest"; serviceCode?: string | null }
) {
  if (!customerPostalCode) {
    throw new AgentApiError("missing_customer_postal_code", "Para calcular o frete, preciso do CEP de entrega.", 400, {
      field: "customer.postalCode"
    });
  }
  const tenant = await getTenantShippingProfile(context.actorUserId, context.tenantId);
  if (!tenant?.postal_code) throw new AgentApiError("tenant_origin_postal_code_missing", "Cadastre o CEP de origem do tenant.", 409);
  const connection = await getIntegrationConnection(context.actorUserId, context.tenantId, "melhor_envio");
  if (!connection || connection.status !== "active") {
    throw new AgentApiError("shipping_provider_not_configured", "Melhor Envio não está configurado para este tenant.", 409);
  }
  const packaging = await estimatePackaging(context.actorUserId, context.tenantId, { items });
  if (!packaging) throw new AgentApiError("packaging_not_found", "Nenhuma embalagem compatível encontrada.", 409);
  const result = await quoteMelhorEnvioShipping(
    {
      originPostalCode: tenant.postal_code,
      destinationPostalCode: customerPostalCode,
      declaredValue: 0,
      insuranceValue: 0,
      packaging
    },
    connection.settings as MelhorEnvioSettings,
    decryptIntegrationCredentials<MelhorEnvioCredentials>(connection)
  );
  const options = extractOptions(result);
  const selected = input.serviceCode
    ? options.find((option) => option.serviceCode === input.serviceCode)
    : [...options].sort((a, b) =>
        input.strategy === "fastest"
          ? (a.deliveryTime ?? 9999) - (b.deliveryTime ?? 9999)
          : a.price - b.price
      )[0];
  if (!selected) throw new AgentApiError("shipping_option_not_found", "Nenhuma opção de frete disponível.", 409);
  await logIntegrationEvent(context.actorUserId, context.tenantId, {
    provider: "melhor_envio",
    operation: "agent.quotes.composite.shipping",
    status: "success",
    metadata: { optionCount: options.length }
  });
  return { selected, options, packaging, raw: result };
}

function extractOptions(result: unknown) {
  if (!Array.isArray(result)) return [];
  return result.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (record.error) return [];
    const company = record.company && typeof record.company === "object" ? record.company as Record<string, unknown> : {};
    const serviceCode = stringOrNull(record.id);
    const price = numberOrNull(record.price) ?? numberOrNull(record.custom_price);
    if (!serviceCode || !price) return [];
    return [{
      provider: "melhor_envio",
      serviceCode,
      serviceName: `${stringOrNull(company.name) ?? "Melhor Envio"} - ${stringOrNull(record.name) ?? "Serviço"}`,
      price,
      deliveryTime: numberOrNull(record.delivery_time),
      raw: record
    }];
  });
}

function omitRawShipping(input: ReturnType<typeof extractOptions>[number]) {
  return {
    provider: input.provider,
    serviceCode: input.serviceCode,
    serviceName: input.serviceName,
    price: input.price,
    deliveryTime: input.deliveryTime
  };
}

function stringOrNull(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
