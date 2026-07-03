import { NextResponse } from "next/server";
import { updateQuoteExternalOlistIds } from "@/repositories/quotes";
import { buildOlistInvoiceEmitPayload, buildOlistInvoicePayload, missingOlistSkus } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../_shared";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const hasInvoice = Boolean(loaded.detail.quote.external_olist_invoice_id);
  const pathTemplate = hasInvoice ? loaded.settings.invoice_emit_path : loaded.settings.invoice_path;
  const path = replacePathTokens(pathTemplate ?? "", {
    idPedido: loaded.detail.quote.external_olist_order_id,
    idNota: loaded.detail.quote.external_olist_invoice_id
  });
  if (!path) return NextResponse.json({ ok: false, error: "Olist invoice path is not configured." }, { status: 409 });
  if ("error" in path) return NextResponse.json({ ok: false, error: path.error }, { status: 409 });
  const missingSkus = missingOlistSkus(loaded.detail.items);
  if (missingSkus.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Todos os itens do orçamento precisam ter ID numérico do produto Olist cadastrado em Produtos antes de gerar nota.",
        missingSkus
      },
      { status: 409 }
    );
  }

  const payload = hasInvoice
    ? buildOlistInvoiceEmitPayload()
    : buildOlistInvoicePayload({ quote: loaded.detail.quote, items: loaded.detail.items });
  try {
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: hasInvoice ? "invoices.emit" : "invoices.create",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path: path.value,
      payload
    });
    if (!hasInvoice && result.externalId) {
      await updateQuoteExternalOlistIds(loaded.session.userId, loaded.session.tenantId, quoteId, {
        invoiceId: result.externalId
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist error"), { status: 502 });
  }
}

function replacePathTokens(template: string, values: Record<string, string | null | undefined>) {
  if (!template) return "";
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    if (!output.includes(`{${key}}`)) continue;
    if (!value) return { error: `Olist path requires ${key}, but it is not available yet.` } as const;
    output = output.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return { value: output } as const;
}
