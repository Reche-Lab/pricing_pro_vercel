import { NextResponse } from "next/server";
import { updateCustomerExternalOlistId } from "@/repositories/customers";
import { buildOlistCustomerLookupPayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, sendOlistQuoteOperation } from "../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const path = loaded.settings.customer_lookup_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist customer lookup path is not configured." }, { status: 409 });

  const payload = buildOlistCustomerLookupPayload(loaded.detail.quote);
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
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Olist error" },
      { status: 502 }
    );
  }
}

function buildLookupPath(path: string, payload: ReturnType<typeof buildOlistCustomerLookupPayload>) {
  const params = new URLSearchParams();
  if (payload.cpfCnpj) params.set("cpfCnpj", payload.cpfCnpj);
  else if (payload.nome) params.set("nome", payload.nome);
  if (payload.celular) params.set("celular", payload.celular);
  params.set("limit", "1");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${params.toString()}`;
}
