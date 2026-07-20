import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { getQuoteDetail, updateQuoteEditable, type QuoteItemRow } from "@/repositories/quotes";
import { listProductVariants } from "@/repositories/products";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import {
  buildOlistSalesOrderItemsUpdatePayload,
  missingOlistSkus
} from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../olist/_shared";

const editSchema = z.object({
  validUntil: z.string().trim().optional().nullable(),
  shippingTotal: z.number().min(0).max(100000),
  notes: z.string().trim().max(4000).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      productVariantId: z.string().uuid(),
      quantity: z.number().int().min(1).max(50000),
      unitPrice: z.number().min(0).max(100000),
      artworkName: z.string().trim().max(120).optional().nullable()
    })
  ).min(1).max(50)
});

export async function PATCH(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const detail = await getQuoteDetail(session.userId, session.tenantId, quoteId);
  if (!detail) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });
  if (detail.quote.external_olist_invoice_id) {
    return NextResponse.json({ ok: false, error: "Orçamento com nota fiscal Olist não pode ser editado." }, { status: 409 });
  }
  if (detail.quote.public_accepted_at || detail.quote.status === "accepted") {
    return NextResponse.json({ ok: false, error: "Orçamento aceito pelo cliente não pode ser editado." }, { status: 409 });
  }

  const changedUnitPrice = parsed.data.items.some((item) => {
    const current = detail.items.find((currentItem) => currentItem.id === item.id);
    return !current || Math.abs(Number(current.unit_price) - item.unitPrice) >= 0.0001;
  });
  if (changedUnitPrice && !parsed.data.reason?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Informe o motivo da alteração manual de preço." },
      { status: 400 }
    );
  }

  try {
    if (detail.quote.external_olist_order_id) {
      const loaded = await loadQuoteOlistContext(quoteId, "olist");
      if ("error" in loaded && loaded.error) {
        return NextResponse.json(loaded.error.body, { status: loaded.error.status });
      }

      const editable = await ensureOlistOrderEditable({
        userId: loaded.session.userId,
        tenantId: loaded.session.tenantId,
        quoteId,
        orderId: detail.quote.external_olist_order_id,
        settings: loaded.settings,
        credentials: loaded.credentials
      });
      if (!editable.ok) return NextResponse.json({ ok: false, error: editable.error }, { status: 409 });

      const olistItems = await buildUpdatedOlistItems(session.userId, session.tenantId, parsed.data.items);
      const missingSkus = missingOlistSkus(olistItems);
      if (missingSkus.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Todos os itens precisam ter ID numérico do produto Olist antes de atualizar o pedido.",
            missingSkus
          },
          { status: 409 }
        );
      }

      const path = replacePathTokens(loaded.settings.sales_order_items_path ?? OLIST_DEFAULT_PATHS.salesOrderItems, {
        idPedido: detail.quote.external_olist_order_id
      });
      const payload = buildOlistSalesOrderItemsUpdatePayload(olistItems);
      await sendOlistQuoteOperation({
        userId: loaded.session.userId,
        tenantId: loaded.session.tenantId,
        provider: "olist",
        operation: "sales_orders.items.update",
        quoteId,
        settings: loaded.settings,
        credentials: loaded.credentials,
        method: "PUT",
        path,
        payload
      });
    }

    const result = await updateQuoteEditable(session.userId, session.tenantId, quoteId, {
      ...parsed.data,
      syncedOlistOrderId: detail.quote.external_olist_order_id ?? null
    });
    return NextResponse.json({ ok: true, quote: result });
  } catch (error) {
    console.error("Quote edit route failed.", {
      quoteId,
      message: error instanceof Error ? error.message : "Unknown quote edit error",
      stack: error instanceof Error ? error.stack : undefined
    });
    if (isOlistOperationError(error)) {
      return NextResponse.json(olistOperationErrorResponse(error, "Falha ao sincronizar edição com o Olist."), { status: 502 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Não foi possível editar o orçamento." },
      { status: 500 }
    );
  }
}

async function buildUpdatedOlistItems(
  userId: string,
  tenantId: string,
  items: z.infer<typeof editSchema>["items"]
): Promise<QuoteItemRow[]> {
  const variants = await listProductVariants(userId, tenantId);
  const variantMap = new Map(variants.map((variant) => [variant.variant_id, variant]));
  return items.map((item) => {
    const variant = variantMap.get(item.productVariantId);
    if (!variant) throw new Error("Produto selecionado não encontrado.");
    return {
      id: item.id,
      product_variant_id: variant.variant_id,
      sku: variant.sku,
      external_olist_product_id: variant.external_olist_product_id,
      description: `${variant.product_name} - ${variant.variant_name}`,
      quantity: item.quantity,
      unit_price: String(item.unitPrice),
      total_price: String(item.unitPrice * item.quantity),
      artwork_name: item.artworkName ?? null
    };
  });
}

async function ensureOlistOrderEditable(input: {
  userId: string;
  tenantId: string;
  quoteId: string;
  orderId: string;
  settings: Parameters<typeof sendOlistQuoteOperation>[0]["settings"];
  credentials: Parameters<typeof sendOlistQuoteOperation>[0]["credentials"];
}) {
  const path = `/pedidos/${encodeURIComponent(input.orderId)}`;
  const result = await sendOlistQuoteOperation({
    userId: input.userId,
    tenantId: input.tenantId,
    provider: "olist",
    operation: "sales_orders.get_before_edit",
    quoteId: input.quoteId,
    settings: input.settings,
    credentials: input.credentials,
    method: "GET",
    path
  });

  const status = findOrderSituation(result.result);
  const allowed = status === null || ["0", "3", "8"].includes(status);
  if (!allowed) {
    return {
      ok: false as const,
      error: `Pedido Olist em situação ${status} não deve ser editado por este fluxo. Crie um novo orçamento/pedido ou ajuste diretamente no Olist.`
    };
  }
  return { ok: true as const };
}

function findOrderSituation(data: unknown): string | null {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findOrderSituation(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const value = record.situacao ?? record.status;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  for (const nested of Object.values(record)) {
    const found = findOrderSituation(nested);
    if (found) return found;
  }
  return null;
}

function replacePathTokens(template: string, values: Record<string, string>) {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return output;
}

function isOlistOperationError(error: unknown) {
  return Boolean(error && typeof error === "object" && "debugId" in error);
}
