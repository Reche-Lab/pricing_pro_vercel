import { z } from "zod";
import {
  AgentApiError,
  calculateAgentCompositeQuote,
  logAgentAudit,
  resolveAgentPlatform,
  resolveAgentVariant
} from "@/repositories/agent";
import { withAgentAuth } from "../../_shared";

const itemSchema = z.object({
  productSku: z.string().trim().optional(),
  productVariantId: z.string().uuid().optional(),
  productName: z.string().trim().optional(),
  quantity: z.number().int().min(1).max(50000),
  artworkName: z.string().trim().max(120).optional().nullable()
});

const calculateSchema = z.object({
  platformSlug: z.string().trim().optional().nullable(),
  pricingRule: z.enum(["per_item", "per_art_average", "aggregate_total"]).optional(),
  items: z.array(itemSchema).min(1).max(50),
  shippingTotal: z.number().min(0).optional()
});

export async function POST(request: Request) {
  return withAgentAuth(
    request,
    "pricing:calculate",
    (body) => {
      const parsed = calculateSchema.safeParse(body);
      if (!parsed.success) throw new AgentApiError("invalid_payload", "Payload de cálculo inválido.", 400);
      return parsed.data;
    },
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
      const calculation = await calculateAgentCompositeQuote(context, {
        platformRuleId: platform.id,
        pricingRule: body.pricingRule,
        shippingTotal: body.shippingTotal,
        items: resolvedItems.map((item) => ({
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          artworkName: item.artworkName
        }))
      });

      await logAgentAudit(context, "agent.pricing.calculate", {
        itemCount: resolvedItems.length,
        platformSlug: platform.key
      });

      return {
        body: {
          ok: true,
          summary: buildSummary(calculation.calculation.items, calculation.totals.grandTotal),
          platform,
          items: calculation.calculation.items.map((item, index) => ({
            sku: resolvedItems[index]?.sku,
            description: item.description,
            artworkName: item.artworkName,
            quantity: item.quantity,
            unitPrice: item.finalUnitPrice,
            total: item.subtotal
          })),
          totals: calculation.totals,
          nextActions: body.shippingTotal ? ["create_quote"] : ["ask_shipping_postal_code", "create_quote"]
        }
      };
    }
  );
}

function buildSummary(items: Array<{ quantity: number; description: string; finalUnitPrice: number }>, grandTotal: number) {
  if (items.length === 1) {
    const item = items[0];
    return `${item.quantity} unidade(s) de ${item.description} por ${currency(item.finalUnitPrice)} cada. Total: ${currency(grandTotal)}.`;
  }
  return `Orçamento composto com ${items.length} item(ns). Total: ${currency(grandTotal)}.`;
}

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
