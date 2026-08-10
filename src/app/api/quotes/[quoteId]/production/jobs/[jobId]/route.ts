import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { markArtworkPrintJobPrinted } from "@/repositories/artwork-production";

const schema = z.object({ quoteId: z.string().uuid(), jobId: z.string().uuid() });

export async function PATCH(_request: Request, context: { params: Promise<{ quoteId: string; jobId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const params = schema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false, error: "Lote inválido." }, { status: 400 });
  try {
    await markArtworkPrintJobPrinted(session.userId, session.tenantId, params.data.quoteId, params.data.jobId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível concluir o lote." }, { status: 409 });
  }
}
