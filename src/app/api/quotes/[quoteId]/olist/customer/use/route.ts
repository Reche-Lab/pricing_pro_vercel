import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWritableBilling } from "@/lib/billing/guard";
import { updateCustomerExternalOlistId } from "@/repositories/customers";
import { assertQuoteCanBeEdited } from "@/repositories/quotes";
import { extractOlistCustomerProfile } from "@/services/olist/customer-profile";
import { loadQuoteOlistContext, olistOperationErrorResponse, sendOlistQuoteOperation } from "../../_shared";

const schema = z.object({ externalId: z.string().trim().regex(/^[1-9]\d{0,14}$/) });
type Context = { params: Promise<{ quoteId: string }> };

export async function GET(request: Request, context: Context) { return handle(request, context, false); }
export async function POST(request: Request, context: Context) { return handle(request, context, true); }

async function handle(request: Request, context: Context, link: boolean) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });
  const { userId, tenantId } = loaded.session;
  const parsed = schema.safeParse(link ? await request.json().catch(() => null) : { externalId: new URL(request.url).searchParams.get("externalId") });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Selecione um cliente Olist válido." }, { status: 400 });
  const customerId = loaded.detail.quote.customer_id;
  if (!customerId) return NextResponse.json({ ok: false, error: "O orçamento não possui cliente local." }, { status: 409 });
  if (!link && loaded.detail.quote.customer_external_olist_id !== parsed.data.externalId) {
    return NextResponse.json({ ok: false, error: "Vincule este cliente ao orçamento antes de importar seus dados." }, { status: 409 });
  }
  if (link) {
    const billingBlock = await requireWritableBilling(userId, tenantId);
    if (billingBlock) return billingBlock;
  }
  try { await assertQuoteCanBeEdited(userId, tenantId, quoteId); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Orçamento fechado para edição." }, { status: 409 }); }

  let profile;
  try {
    // Browser search results are not authoritative: load the selected contact with the tenant credentials.
    const result = await sendOlistQuoteOperation({
      userId, tenantId, provider: "olist", operation: "customers.profile.preview", quoteId,
      settings: loaded.settings, credentials: loaded.credentials, method: "GET",
      path: `${(loaded.settings.customer_path || "/contatos").replace(/\/+$/, "")}/${parsed.data.externalId}`
    });
    profile = extractOlistCustomerProfile(result.result, parsed.data.externalId);
    if (!profile) return NextResponse.json({ ok: false, error: "O Olist não retornou os dados do cliente selecionado. Nenhuma informação local foi alterada." }, { status: 422 });
  } catch (error) {
    return NextResponse.json(olistOperationErrorResponse(error, "Não foi possível consultar os dados completos do cliente."), { status: 502 });
  }

  try {
    if (link) await updateCustomerExternalOlistId(userId, tenantId, customerId, parsed.data.externalId);
    console.info("Quote Olist customer profile prepared.", { quoteId, tenantId, externalId: parsed.data.externalId, linked: link, suppliedFields: Object.keys(profile) });
    return NextResponse.json({
      ok: true, externalId: parsed.data.externalId, profile, profileSynced: false,
      message: link ? "Cliente Olist vinculado. Você pode revisar e atualizar os dados do orçamento separadamente." : "Revise os dados importados e salve para atualizar o orçamento."
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Quote Olist customer link failed.", { quoteId, tenantId, message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ ok: false, error: "Não foi possível salvar o vínculo do cliente. Tente novamente." }, { status: 500 });
  }
}
