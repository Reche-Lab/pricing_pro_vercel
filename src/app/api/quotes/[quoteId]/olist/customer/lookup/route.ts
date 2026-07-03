import { NextResponse } from "next/server";
import { z } from "zod";
import { updateCustomerExternalOlistId } from "@/repositories/customers";
import { buildOlistCustomerLookupPayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../../_shared";

const customerLookupSchema = z.object({
  mode: z.enum(["nome", "cpfCnpj", "celular"]).optional().default("nome"),
  cpfCnpj: z.string().trim().optional().nullable(),
  celular: z.string().trim().optional().nullable(),
  nome: z.string().trim().optional().nullable(),
  situacao: z.enum(["", "B", "A", "I", "E"]).optional().default("")
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => ({}));
  const parsed = customerLookupSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const path = loaded.settings.customer_lookup_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist customer lookup path is not configured." }, { status: 409 });

  const quotePayload = buildOlistCustomerLookupPayload(loaded.detail.quote);
  const payload = {
    ...quotePayload,
    mode: parsed.data.mode,
    cpfCnpj: parsed.data.cpfCnpj === undefined || parsed.data.cpfCnpj === null
      ? quotePayload.cpfCnpj
      : cleanDigits(parsed.data.cpfCnpj),
    celular: parsed.data.celular === undefined || parsed.data.celular === null
      ? quotePayload.celular
      : cleanDigits(parsed.data.celular),
    nome: parsed.data.nome === undefined || parsed.data.nome === null
      ? quotePayload.nome
      : parsed.data.nome,
    situacao: parsed.data.situacao || null
  };
  const lookupPath = buildLookupPath(path, payload);
  try {
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "customers.lookup",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path: lookupPath,
      payload,
      method: "GET"
    });
    if (result.externalId && loaded.detail.quote.customer_id) {
      await updateCustomerExternalOlistId(
        loaded.session.userId,
        loaded.session.tenantId,
        loaded.detail.quote.customer_id,
        result.externalId
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist error"), { status: 502 });
  }
}

function cleanDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function buildLookupPath(path: string, payload: ReturnType<typeof buildOlistCustomerLookupPayload> & {
  mode?: "nome" | "cpfCnpj" | "celular";
  situacao?: string | null;
}) {
  const params = new URLSearchParams();
  if (payload.mode === "cpfCnpj" && payload.cpfCnpj) params.set("cpfCnpj", payload.cpfCnpj);
  else if (payload.mode === "celular" && payload.celular) params.set("celular", payload.celular);
  else if (payload.nome) params.set("nome", payload.nome);
  if (payload.situacao) params.set("situacao", payload.situacao);
  params.set("limit", "5");
  params.set("offset", "0");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${params.toString()}`;
}
