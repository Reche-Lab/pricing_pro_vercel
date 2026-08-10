import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { setArtworkApproval } from "@/repositories/artwork-production";

const paramsSchema = z.object({ quoteId: z.string().uuid(), itemId: z.string().uuid(), artworkId: z.string().uuid() });
const bodySchema = z.object({ status: z.enum(["approved", "rejected"]), productionQuantity: z.number().int().min(1).max(100000).optional().nullable() });

export async function POST(request: Request, context: { params: Promise<{ quoteId: string; itemId: string; artworkId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
  try {
    await setArtworkApproval({ userId: session.userId, tenantId: session.tenantId, ...params.data, status: body.data.status, productionQuantity: body.data.productionQuantity });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível atualizar a aprovação." }, { status: 422 });
  }
}
