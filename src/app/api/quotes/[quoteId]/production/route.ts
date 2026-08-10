import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getArtworkProductionData } from "@/repositories/artwork-production";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const parsed = z.string().uuid().safeParse((await context.params).quoteId);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Orçamento inválido." }, { status: 400 });
  const data = await getArtworkProductionData(session.userId, session.tenantId, parsed.data);
  if (!data) return NextResponse.json({ ok: false, error: "Orçamento não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, ...data });
}
