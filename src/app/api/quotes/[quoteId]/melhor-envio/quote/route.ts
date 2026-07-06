import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import { getQuoteDetail } from "@/repositories/quotes";
import { createShipmentDraft } from "@/repositories/shipments";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { quoteMelhorEnvioShipping } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

const quoteRequestSchema = z.object({
  selectedServiceCode: z.string().trim().optional().nullable(),
  selectedBoxId: z.string().uuid().optional().nullable(),
  clearanceCm: z.number().min(0).max(5).optional(),
  insuranceValue: z.number().min(0).optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const [detail, tenant, connection] = await Promise.all([
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    getTenantShippingProfile(session.userId, session.tenantId),
    getIntegrationConnection(session.userId, session.tenantId, "melhor_envio")
  ]);

  if (!detail) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });
  if (!tenant) return NextResponse.json({ ok: false, error: "Tenant not found." }, { status: 404 });
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Melhor Envio integration is not active." }, { status: 409 });
  }

  const originPostalCode = onlyDigits(tenant.postal_code);
  const destinationPostalCode = onlyDigits(detail.quote.customer_postal_code);
  if (!originPostalCode) {
    return NextResponse.json({ ok: false, error: "Cadastre o CEP de origem em Configurações > Geral." }, { status: 409 });
  }
  if (!destinationPostalCode) {
    return NextResponse.json({ ok: false, error: "Informe o CEP do cliente no orçamento." }, { status: 409 });
  }

  const items = detail.items.map((item) => ({
    productVariantId: item.product_variant_id ?? "",
    quantity: item.quantity
  }));
  if (items.some((item) => !item.productVariantId)) {
    return NextResponse.json(
      { ok: false, error: "Todos os itens precisam estar vinculados a produtos cadastrados para calcular embalagem e etiqueta." },
      { status: 409 }
    );
  }

  try {
    const packaging = await estimatePackaging(session.userId, session.tenantId, {
      items,
      selectedBoxId: parsed.data.selectedBoxId,
      clearanceCm: parsed.data.clearanceCm
    });
    if (!packaging) return NextResponse.json({ ok: false, error: "No compatible packaging found." }, { status: 404 });

    const credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const quoteResult = await quoteMelhorEnvioShipping(
      {
        originPostalCode,
        destinationPostalCode,
        declaredValue: Number(detail.quote.grand_total),
        insuranceValue: parsed.data.insuranceValue ?? Number(detail.quote.grand_total),
        packaging
      },
      connection.settings as MelhorEnvioSettings,
      credentials
    );
    const options = extractQuoteOptions(quoteResult);
    const selected = parsed.data.selectedServiceCode
      ? options.find((option) => option.code === parsed.data.selectedServiceCode)
      : null;

    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: "shipping.quote_from_quote",
      status: "success",
      metadata: { quoteId, optionCount: options.length, selectedServiceCode: parsed.data.selectedServiceCode }
    });

    if (parsed.data.selectedServiceCode && !selected) {
      return NextResponse.json(
        { ok: false, error: "O serviço selecionado não foi retornado pelo Melhor Envio.", options, packaging },
        { status: 409 }
      );
    }

    let shipment: { id: string } | null = null;
    if (selected) {
      shipment = await createShipmentDraft(session.userId, session.tenantId, {
        quoteId,
        provider: "melhor_envio",
        status: "quoted",
        serviceName: selected.label,
        serviceCode: selected.code,
        shippingAmount: selected.price,
        rawQuote: quoteResult,
        selectedQuote: selected.raw,
        packagingSnapshot: packaging
      });
    }

    return NextResponse.json({ ok: true, options, packaging, shipment });
  } catch (error) {
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "melhor_envio",
      operation: "shipping.quote_from_quote",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Melhor Envio error",
      metadata: { quoteId }
    });

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Melhor Envio error" },
      { status: 502 }
    );
  }
}

function extractQuoteOptions(result: unknown) {
  if (!Array.isArray(result)) return [];
  return result
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (record.error) return null;
      const company = record.company && typeof record.company === "object" ? (record.company as Record<string, unknown>) : {};
      const code = stringOrNull(record.id);
      const price = numberOrNull(record.price) ?? numberOrNull(record.custom_price);
      if (!code || !price || price <= 0) return null;
      const name = stringOrNull(record.name) ?? "Serviço Melhor Envio";
      const companyName = stringOrNull(company.name) ?? "Melhor Envio";
      const deliveryTime = numberOrNull(record.delivery_time);
      return {
        code,
        name,
        companyName,
        label: `${companyName} - ${name}`,
        price,
        deliveryTime,
        raw: record
      };
    })
    .filter((item): item is {
      code: string;
      name: string;
      companyName: string;
      label: string;
      price: number;
      deliveryTime: number | null;
      raw: Record<string, unknown>;
    } => Boolean(item))
    .sort((a, b) => a.price - b.price);
}

function onlyDigits(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/\D/g, "") : "";
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
