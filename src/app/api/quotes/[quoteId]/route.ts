import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { deleteQuote, updateQuoteShippingTotal } from "@/repositories/quotes";
import { userHasPermission } from "@/repositories/users";
import { QuoteShippingError } from "@/domain/quotes/shipping";
import { requireWritableBilling } from "@/lib/billing/guard";

const patchSchema = z.object({
  shippingTotal: z.number().min(0).max(100000)
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  let quote;
  try { quote = await updateQuoteShippingTotal(session.userId, session.tenantId, quoteId, parsed.data.shippingTotal); }
  catch (error) {
    const databaseError = error && typeof error === "object" ? error as { code?: string; column?: string } : undefined;
    const migrationRequired = databaseError?.code === "42703" && (
      ["delivery_method", "shipping_olist_sync_pending"].includes(databaseError.column ?? "")
      || error instanceof Error && /\b(?:delivery_method|shipping_olist_sync_pending)\b/.test(error.message)
    );
    console.error("Quote shipping update failed.", {
      quoteId, tenantId: session.tenantId,
      databaseCode: databaseError?.code,
      requiredMigration: migrationRequired ? "0066_quote_pickup.sql" : undefined,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    if (migrationRequired) {
      return NextResponse.json({
        ok: false,
        code: "database_migration_required",
        requiredMigration: "0066_quote_pickup.sql",
        error: "O banco de dados precisa de uma atualização para salvar o frete. Peça ao administrador para aplicar a migration 0066_quote_pickup.sql no Supabase desta instalação e tente novamente."
      }, { status: 503 });
    }
    return NextResponse.json({
      ok: false,
      error: error instanceof QuoteShippingError ? error.message : "Não foi possível atualizar o frete. Tente novamente ou informe o administrador."
    }, { status: error instanceof QuoteShippingError ? error.status : 500 });
  }
  if (!quote) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

  return NextResponse.json({ ok: true, quote });
}

export async function DELETE(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });

  const allowed = session.role === "owner" || (await userHasPermission(session.userId, session.tenantId, "quotes:delete"));
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const deleted = await deleteQuote(session.userId, session.tenantId, quoteId);
  if (!deleted) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

  return NextResponse.json({ ok: true, quote: deleted });
}
