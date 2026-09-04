import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { assertQuoteCanBeEdited, updateQuotePixPayment } from "@/repositories/quotes";

const requestSchema = z.object({ include: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { quoteId } = await context.params;
  if (!z.string().uuid().safeParse(quoteId).success) {
    return NextResponse.json({ ok: false, error: "Orçamento inválido." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Opção de Pix inválida." }, { status: 400 });

  try {
    await assertQuoteCanBeEdited(session.userId, session.tenantId, quoteId);
    const pixPayment = await updateQuotePixPayment(
      session.userId,
      session.tenantId,
      quoteId,
      parsed.data.include
    );
    return NextResponse.json({ ok: true, pixPayment });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Não foi possível atualizar o Pix do orçamento." },
      { status: 409 }
    );
  }
}
