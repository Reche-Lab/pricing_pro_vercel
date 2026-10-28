import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { getQuoteDetail } from "@/repositories/quotes";
import { setQuotePickup } from "@/repositories/quote-shipping";
import { quoteShippingEditBlock, QuoteShippingError } from "@/domain/quotes/shipping";
import { syncQuotePickup } from "./_sync";

const schema = z.object({ confirmed: z.literal(true), expectedShippingTotal: z.number().min(0).max(100000), reason: z.string().trim().min(3).max(500) });
type Context = { params: Promise<{ quoteId: string }> };

export async function PATCH(request: Request, context: Context) { return perform(request, context, true); }
export async function POST(request: Request, context: Context) { return perform(request, context, false); }

async function perform(request: Request, context: Context, remove: boolean) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const block = await requireWritableBilling(session.userId, session.tenantId);
  if (block) return block;
  const { quoteId } = await context.params;
  if (!z.string().uuid().safeParse(quoteId).success) return NextResponse.json({ ok: false, error: "Orçamento inválido." }, { status: 400 });
  try {
    let result;
    if (remove) {
      const parsed = schema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ ok: false, error: "Confirme a retirada e informe o motivo e o frete atual." }, { status: 400 });
      result = await setQuotePickup(session.userId, session.tenantId, quoteId, parsed.data);
    } else {
      const detail = await getQuoteDetail(session.userId, session.tenantId, quoteId);
      if (!detail) throw new QuoteShippingError("Orçamento não encontrado.", 404);
      const blocked = quoteShippingEditBlock(detail.quote);
      if (blocked) throw new QuoteShippingError(blocked);
      if (detail.quote.delivery_method !== "pickup" && !detail.quote.shipping_olist_sync_pending) throw new QuoteShippingError("Não há alteração de frete pendente neste orçamento.");
      result = { olistPending: Boolean(detail.quote.shipping_olist_sync_pending) };
    }
    const sync = result.olistPending ? await syncQuotePickup(quoteId) : { pending: false, message: "Retirada no local confirmada. Frete removido e total atualizado." };
    console.info("Quote pickup completed.", { tenantId: session.tenantId, quoteId, remove, olistPending: sync.pending });
    return NextResponse.json({ ...sync, ok: true, quote: result });
  } catch (error) {
    console.error("Quote pickup failed.", { tenantId: session.tenantId, quoteId, message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível retirar o frete." }, { status: error instanceof QuoteShippingError ? error.status : 500 });
  }
}
