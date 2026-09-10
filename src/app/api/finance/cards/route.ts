import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinancePermission, financeError } from "@/app/api/finance/_shared";
import { requireWritableBilling } from "@/lib/billing/guard";
import { listCardStatements, setCardPayment } from "@/repositories/card-statements";

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(new URL(request.url).searchParams.get("competence"));
  if (!competence.success) return NextResponse.json({ ok: false, error: "Competência inválida." }, { status: 400 });
  try { return NextResponse.json({ ok: true, statements: await listCardStatements(auth.session.userId, auth.session.tenantId, competence.data) }); }
  catch (error) { return financeError(error, "cards.list"); }
}
export async function PATCH(request: Request) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = z.object({ statementId: z.string().uuid(), transactionId: z.string().uuid(), action: z.enum(["link", "unlink"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Selecione uma fatura e um lançamento." }, { status: 400 });
  try {
    const { statementId, transactionId, action } = parsed.data;
    await setCardPayment(auth.session.userId, auth.session.tenantId, statementId, transactionId, action);
    console.info("Credit card payment updated.", { tenantId: auth.session.tenantId, statementId, transactionId, action });
    return NextResponse.json({ ok: true });
  } catch (error) { return financeError(error, "cards.payment"); }
}
