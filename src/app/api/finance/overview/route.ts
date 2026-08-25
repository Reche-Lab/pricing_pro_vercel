import { NextResponse } from "next/server";
import { getFinancialOverview } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  const competence = new URL(request.url).searchParams.get("competence") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return NextResponse.json({ ok: false, error: "Competência inválida." }, { status: 400 });
  try { return NextResponse.json({ ok: true, overview: await getFinancialOverview(auth.session.userId, auth.session.tenantId, competence) }); }
  catch (error) { return financeError(error, "overview.read"); }
}

