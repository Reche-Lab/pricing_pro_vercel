import { NextResponse } from "next/server";
import { getFinancialComparison } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { competenceSchema } from "@/app/api/finance/rules/schema";

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  const params = new URL(request.url).searchParams;
  const competence = params.get("competence") || new Date().toISOString().slice(0, 7);
  const months = Number(params.get("months") || 6);
  if (!competenceSchema.safeParse(competence).success || ![3, 6, 12].includes(months)) {
    return NextResponse.json({ ok: false, error: "Período inválido." }, { status: 400 });
  }
  try { return NextResponse.json({ ok: true, comparison: await getFinancialComparison(auth.session.userId, auth.session.tenantId, competence, months) }); }
  catch (error) { return financeError(error, "comparison.read"); }
}
