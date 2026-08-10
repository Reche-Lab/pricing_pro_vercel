import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { setQuoteAdministrativeEditing } from "@/repositories/quotes";
import { userHasPermission } from "@/repositories/users";

const paramsSchema = z.object({ quoteId: z.string().uuid() });
const bodySchema = z.object({
  action: z.enum(["reopen", "lock"]),
  reason: z.string().trim().min(10).max(500).optional().nullable()
}).superRefine((value, context) => {
  if (value.action === "reopen" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Informe o motivo da reabertura." });
});

export async function POST(request: Request, route: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await route.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Informe um motivo com pelo menos 10 caracteres." }, { status: 400 });
  const allowed = session.role === "owner" || await userHasPermission(session.userId, session.tenantId, "quotes:approve");
  if (!allowed) return NextResponse.json({ ok: false, error: "Você não possui permissão para reabrir orçamentos aceitos." }, { status: 403 });
  try {
    const result = await setQuoteAdministrativeEditing({ userId: session.userId, tenantId: session.tenantId, quoteId: params.data.quoteId, action: body.data.action, reason: body.data.reason });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível alterar o bloqueio do orçamento." }, { status: 409 });
  }
}
