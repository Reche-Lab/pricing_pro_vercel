import { NextResponse } from "next/server";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { requireWritableBilling } from "@/lib/billing/guard";
import { createFinancialIndicator, listFinancialIndicators } from "@/repositories/finance";
import { indicatorInputSchema } from "./_schema";

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  const competence = new URL(request.url).searchParams.get("competence") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) {
    return NextResponse.json({ ok: false, error: "Competência inválida." }, { status: 400 });
  }
  try {
    const indicators = await listFinancialIndicators(auth.session.userId, auth.session.tenantId, competence);
    return NextResponse.json({ ok: true, indicators });
  } catch (error) {
    return financeError(error, "indicators.list");
  }
}

export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = indicatorInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const indicator = await createFinancialIndicator(auth.session.userId, auth.session.tenantId, parsed.data);
    return NextResponse.json({ ok: true, indicator }, { status: 201 });
  } catch (error) {
    return financeError(error, "indicators.create");
  }
}
