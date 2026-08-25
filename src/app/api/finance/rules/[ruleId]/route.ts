import { NextResponse } from "next/server";
import { deactivateFinancialRule, updateFinancialRule } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { financialRuleSchema } from "@/app/api/finance/rules/schema";

export async function PATCH(request: Request, context: { params: Promise<{ ruleId: string }> }) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  const parsed = financialRuleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try { const { ruleId } = await context.params; return NextResponse.json({ ok: true, rule: await updateFinancialRule(auth.session.userId, auth.session.tenantId, ruleId, parsed.data) }); }
  catch (error) { return financeError(error, "rules.update"); }
}

export async function DELETE(_: Request, context: { params: Promise<{ ruleId: string }> }) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  try { const { ruleId } = await context.params; return NextResponse.json({ ok: true, result: await deactivateFinancialRule(auth.session.userId, auth.session.tenantId, ruleId) }); }
  catch (error) { return financeError(error, "rules.deactivate"); }
}
