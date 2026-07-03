import { NextResponse } from "next/server";
import { z } from "zod";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import { buildOlistInvoiceCancelPayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../../_shared";

const cancelSchema = z.object({
  reason: z.string().trim().min(15, "Informe um motivo com pelo menos 15 caracteres."),
  numeroNota: z.string().trim().min(1, "Informe o número da nota fiscal."),
  serieNota: z.string().trim().optional().default(""),
  modeloNota: z.string().trim().optional().default("55"),
  estornarContas: z.enum(["S", "N"]).optional().default("N"),
  estornarEstoque: z.enum(["S", "N"]).optional().default("N")
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => null);
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const invoiceId = loaded.detail.quote.external_olist_invoice_id;
  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "Não há nota fiscal Olist vinculada a este orçamento para cancelar." }, { status: 409 });
  }

  const path = replacePathTokens(normalizeInvoiceCancelPath(loaded.settings.invoice_cancel_path), { idNota: invoiceId });
  if (!path) return NextResponse.json({ ok: false, error: "Olist invoice cancel path is not configured." }, { status: 409 });
  if ("error" in path) return NextResponse.json({ ok: false, error: path.error }, { status: 409 });

  try {
    const payload = buildOlistInvoiceCancelPayload({
      numeroNota: parsed.data.numeroNota,
      serieNota: parsed.data.serieNota,
      modeloNota: parsed.data.modeloNota,
      estornarContas: parsed.data.estornarContas,
      estornarEstoque: parsed.data.estornarEstoque
    });
    const formData = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      formData.set(key, String(value));
    }
    const payloadForLog = {
      ...payload,
      motivoInterno: parsed.data.reason
    };
    console.info("Olist invoice cancel payload built.", {
      quoteId,
      invoiceId,
      path: path.value,
      payload: payloadForLog
    });
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "invoices.cancel",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path: path.value,
      payload: formData,
      payloadForLog
    });
    console.info("Olist invoice cancel route completed.", {
      quoteId,
      invoiceId,
      debugId: result.debugId
    });
    return NextResponse.json({
      ...result,
      message: result.message || `Cancelamento da nota ${invoiceId} enviado ao Olist/Tiny.`
    });
  } catch (error) {
    console.error("Olist invoice cancel route failed.", {
      quoteId,
      invoiceId,
      message: error instanceof Error ? error.message : "Unknown invoice cancel error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist cancel invoice error"), { status: 502 });
  }
}

function replacePathTokens(template: string, values: Record<string, string | null | undefined>) {
  if (!template) return "";
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    if (!output.includes(`{${key}}`)) continue;
    if (!value) return { error: `Olist path requires ${key}.` } as const;
    output = output.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return { value: output } as const;
}

function normalizeInvoiceCancelPath(path: string | null | undefined) {
  const cleaned = path?.trim();
  if (!cleaned || cleaned === "/notas/{idNota}/cancelar") return OLIST_DEFAULT_PATHS.invoiceCancel;
  return cleaned;
}
