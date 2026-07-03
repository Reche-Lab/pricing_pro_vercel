import { NextResponse } from "next/server";
import { getCustomerById, updateCustomerExternalOlistId } from "@/repositories/customers";
import { buildOlistCustomerPayload } from "@/services/olist/payloads";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../_shared";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });
  if (!loaded.detail.quote.customer_id) return NextResponse.json({ ok: false, error: "Quote has no customer." }, { status: 409 });

  const customer = await getCustomerById(loaded.session.userId, loaded.session.tenantId, loaded.detail.quote.customer_id);
  if (!customer) return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });

  const path = loaded.settings.customer_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist customer path is not configured." }, { status: 409 });

  const payload = buildOlistCustomerPayload(customer);
  try {
    const result = await sendOlistQuoteOperation({
      userId: loaded.session.userId,
      tenantId: loaded.session.tenantId,
      provider: "olist",
      operation: "customers.create",
      quoteId,
      settings: loaded.settings,
      credentials: loaded.credentials,
      path,
      payload
    });
    if (result.externalId) {
      await updateCustomerExternalOlistId(loaded.session.userId, loaded.session.tenantId, customer.id, result.externalId);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Unknown Olist error"), { status: 502 });
  }
}
