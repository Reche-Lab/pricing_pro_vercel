import { z } from "zod";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import {
  AgentApiError,
  logAgentAudit,
  resolveAgentVariant
} from "@/repositories/agent";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { quoteMelhorEnvioShipping } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";
import { withAgentAuth } from "../../_shared";

const itemSchema = z.object({
  productSku: z.string().trim().optional(),
  productVariantId: z.string().uuid().optional(),
  productName: z.string().trim().optional(),
  quantity: z.number().int().min(1).max(50000)
});

const shippingSchema = z.object({
  customerPostalCode: z.string().trim().min(8),
  provider: z.enum(["melhor_envio"]).default("melhor_envio"),
  strategy: z.enum(["cheapest", "fastest"]).default("cheapest"),
  items: z.array(itemSchema).min(1).max(50),
  insuranceValue: z.number().min(0).optional()
});

export async function POST(request: Request) {
  return withAgentAuth(request, "shipping:quote", parseBody, async ({ context, body }) => {
    const tenant = await getTenantShippingProfile(context.actorUserId, context.tenantId);
    if (!tenant?.postal_code) {
      throw new AgentApiError("tenant_origin_postal_code_missing", "Cadastre o CEP de origem do tenant.", 409);
    }

    const connection = await getIntegrationConnection(context.actorUserId, context.tenantId, "melhor_envio");
    if (!connection || connection.status !== "active") {
      throw new AgentApiError("shipping_provider_not_configured", "Melhor Envio não está configurado para este tenant.", 409);
    }

    const resolvedItems = await Promise.all(
      body.items.map(async (item) => {
        const variant = await resolveAgentVariant(context, item);
        return {
          productVariantId: variant.variant_id,
          quantity: item.quantity,
          sku: variant.sku,
          description: `${variant.product_name} - ${variant.variant_name}`
        };
      })
    );

    const packaging = await estimatePackaging(context.actorUserId, context.tenantId, {
      items: resolvedItems.map((item) => ({ productVariantId: item.productVariantId, quantity: item.quantity }))
    });
    if (!packaging) throw new AgentApiError("packaging_not_found", "Nenhuma embalagem compatível encontrada.", 409);

    const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const result = await quoteMelhorEnvioShipping(
      {
        originPostalCode: tenant.postal_code,
        destinationPostalCode: body.customerPostalCode,
        declaredValue: body.insuranceValue ?? 0,
        insuranceValue: body.insuranceValue ?? 0,
        packaging
      },
      connection.settings as MelhorEnvioSettings,
      credentials
    );
    const options = extractOptions(result);
    const sorted = [...options].sort((a, b) =>
      body.strategy === "fastest"
        ? (a.deliveryTime ?? 9999) - (b.deliveryTime ?? 9999)
        : a.price - b.price
    );

    await Promise.all([
      logAgentAudit(context, "agent.shipping.quote", {
        provider: body.provider,
        strategy: body.strategy,
        optionCount: options.length
      }),
      logIntegrationEvent(context.actorUserId, context.tenantId, {
        provider: "melhor_envio",
        operation: "agent.shipping.quote",
        status: "success",
        metadata: { optionCount: options.length }
      })
    ]);

    return {
      body: {
        ok: true,
        recommended: sorted[0] ?? null,
        options: sorted,
        package: {
          boxName: packaging.box.name,
          dimensionsCm: `${packaging.box.widthCm} x ${packaging.box.lengthCm} x ${packaging.box.heightCm}`,
          grossWeightKg: packaging.grossWeightKg,
          boxesNeeded: packaging.boxesNeeded
        }
      }
    };
  });
}

function parseBody(body: unknown) {
  const parsed = shippingSchema.safeParse(body);
  if (!parsed.success) throw new AgentApiError("invalid_payload", "Payload de frete inválido.", 400);
  return parsed.data;
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
      deliveryTime: numberOrNull(record.delivery_time)
    }];
  });
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
