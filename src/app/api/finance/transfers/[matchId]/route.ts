import { NextResponse } from "next/server";
import { z } from "zod";
import { setTransferStatus } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

const schema = z.object({ status: z.enum(["confirmed", "rejected", "cancelled"]) });
export async function PATCH(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  const [{ matchId }, body] = await Promise.all([context.params, request.json().catch(() => null)]);
  if (!z.string().uuid().safeParse(matchId).success) return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json({ ok: true, result: await setTransferStatus(auth.session.userId, auth.session.tenantId, matchId, parsed.data.status) }); }
  catch (error) { return financeError(error, "transfers.update"); }
}

