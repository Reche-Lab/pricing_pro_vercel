import { NextResponse } from "next/server";
import { applyFinancialRule } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { competenceSchema } from "@/app/api/finance/rules/schema";

export async function POST(request: Request, context: { params: Promise<{ ruleId: string }> }) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  const parsed = competenceSchema.safeParse((await request.json().catch(() => null))?.competence);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Competência inválida." }, { status: 400 });
  try { const { ruleId } = await context.params; return NextResponse.json({ ok: true, result: await applyFinancialRule(auth.session.userId, auth.session.tenantId, ruleId, parsed.data) }); }
  catch (error) { return financeError(error, "rules.apply"); }
}
