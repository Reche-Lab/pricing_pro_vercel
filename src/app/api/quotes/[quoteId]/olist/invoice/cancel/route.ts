import { NextResponse } from "next/server";
import { z } from "zod";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import { buildOlistInvoiceCancelPayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../../_shared";

const cancelSchema = z.object({
  reason: z.string().trim().min(15, "Informe um motivo com pelo menos 15 caracteres."),
  numeroNota: z.string().trim().optional().default(""),
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
    const numeroNota = parsed.data.numeroNota || loaded.detail.quote.external_olist_invoice_number || "";
    const serieNota = parsed.data.serieNota || loaded.detail.quote.external_olist_invoice_series || "";
    const modeloNota = parsed.data.modeloNota || loaded.detail.quote.external_olist_invoice_model || "55";
    if (!numeroNota) {
      return NextResponse.json(
        { ok: false, error: "Informe o número da nota fiscal para cancelar. O ID interno da nota Olist não substitui o número fiscal." },
        { status: 400 }
      );
    }
    const payload = buildOlistInvoiceCancelPayload({
      numeroNota,
      serieNota,
      modeloNota,
      estornarContas: parsed.data.estornarContas,
      estornarEstoque: parsed.data.estornarEstoque
    });
    const xml = await fetchInvoiceXml({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      quoteId,
      invoiceId,
      settings: loaded.settings,
      credentials: loaded.credentials
    });
    if (!xml) {
      return NextResponse.json(
        {
          ok: false,
          error: "A nota ainda não possui XML autorizado no Olist/Tiny. Autorize/emitia a nota fiscal primeiro; depois disso o cancelamento poderá usar o XML exigido pela API."
        },
        { status: 409 }
      );
    }
    const cancelXml = normalizeInvoiceXmlForCancel(xml);
    const formData = new FormData();
    formData.set("xml", new Blob([cancelXml.xml], { type: "application/xml" }), `nota-${numeroNota}.xml`);
    for (const [key, value] of Object.entries(payload)) {
      formData.set(key, String(value));
    }
    const payloadForLog = {
      ...payload,
      xml: `[xml anexado: ${cancelXml.xml.length} caracteres; raiz=${cancelXml.root}; origem=${cancelXml.sourceRoot}]`,
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

async function fetchInvoiceXml(input: {
  userId: string;
  tenantId: string;
  quoteId: string;
  invoiceId: string;
  settings: Parameters<typeof sendOlistQuoteOperation>[0]["settings"];
  credentials: Parameters<typeof sendOlistQuoteOperation>[0]["credentials"];
}) {
  const xmlPath = replacePathTokens(OLIST_DEFAULT_PATHS.invoiceXml, { idNota: input.invoiceId });
  if (!xmlPath || "error" in xmlPath) return null;

  try {
    const result = await sendOlistQuoteOperation({
      userId: input.userId,
      tenantId: input.tenantId,
      provider: "olist",
      operation: "invoices.xml.get",
      quoteId: input.quoteId,
      settings: input.settings,
      credentials: input.credentials,
      path: xmlPath.value,
      method: "GET"
    });
    const xml = findFirstString(result.result, ["xmlNfe", "xml", "xmlNota", "conteudo"]);
    if (!xml) {
      console.warn("Olist invoice XML response did not include XML content.", {
        quoteId: input.quoteId,
        invoiceId: input.invoiceId,
        debugId: result.debugId
      });
    }
    return xml;
  } catch (error) {
    console.warn("Olist invoice XML lookup failed before cancel. Continuing with number/series payload.", {
      quoteId: input.quoteId,
      invoiceId: input.invoiceId,
      message: error instanceof Error ? error.message : "Unknown Olist invoice XML lookup error",
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
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

function normalizeInvoiceXmlForCancel(xml: string) {
  const sourceRoot = detectXmlRoot(xml);
  if (sourceRoot === "nfeProc") {
    const nfe = extractXmlNode(xml, "NFe");
    if (nfe) {
      return {
        xml: nfe,
        root: detectXmlRoot(nfe) ?? "NFe",
        sourceRoot
      };
    }
  }

  return {
    xml,
    root: sourceRoot ?? "desconhecida",
    sourceRoot: sourceRoot ?? "desconhecida"
  };
}

function detectXmlRoot(xml: string) {
  const withoutDeclaration = xml.trim().replace(/^<\?xml[\s\S]*?\?>\s*/i, "");
  const match = /^<([A-Za-z_][\w:.-]*)\b/.exec(withoutDeclaration);
  if (!match) return null;
  return match[1].includes(":") ? match[1].split(":").pop() ?? match[1] : match[1];
}

function extractXmlNode(xml: string, tagName: string) {
  const match = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${tagName}\\b[\\s\\S]*?<\\/(?:[A-Za-z_][\\w.-]*:)?${tagName}>`, "i").exec(xml);
  return match?.[0]?.trim() ?? null;
}
