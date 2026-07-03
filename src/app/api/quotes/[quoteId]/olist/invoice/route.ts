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

  try {
    const payload = hasInvoice
      ? buildOlistInvoiceEmitPayload()
      : buildOlistInvoicePayload({ quote: loaded.detail.quote, items: loaded.detail.items });
    console.info("Olist invoice payload built.", {
      quoteId,
      mode: hasInvoice ? "emit" : "create",
      path: path.value,
      orderId: loaded.detail.quote.external_olist_order_id,
      invoiceId: loaded.detail.quote.external_olist_invoice_id,
      payload
    });
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
    const fiscalFields = extractInvoiceFiscalFields(result.result);
    if ((!hasInvoice && result.externalId) || fiscalFields.number || fiscalFields.series || fiscalFields.model) {
      await updateQuoteExternalOlistIds(loaded.session.userId, loaded.session.tenantId, quoteId, {
        invoiceId: !hasInvoice ? result.externalId : null,
        invoiceNumber: fiscalFields.number,
        invoiceSeries: fiscalFields.series,
        invoiceModel: fiscalFields.model
      });
    }
    console.info("Olist invoice route completed.", {
      quoteId,
      mode: hasInvoice ? "emit" : "create",
      externalId: result.externalId,
      debugId: result.debugId
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Olist invoice route failed.", {
      quoteId,
      mode: hasInvoice ? "emit" : "create",
      message: error instanceof Error ? error.message : "Unknown invoice error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist error"), { status: 502 });
  }
}

function extractInvoiceFiscalFields(data: unknown) {
  return {
    number: findFirstString(data, ["numeroNota", "numero", "numeroNf", "numeroNfe", "numeroDocumento"]),
    series: findFirstString(data, ["serieNota", "serie", "serieNf", "serieNfe"]),
    model: findFirstString(data, ["modeloNota", "modelo", "modeloNf", "modeloNfe"])
  };
}

function findFirstString(data: unknown, keys: string[]): string | null {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findFirstString(item, keys);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  for (const value of Object.values(record)) {
    const found = findFirstString(value, keys);
    if (found) return found;
  }
  return null;
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
