import { NextResponse } from "next/server";
import { createFinancialRule, listFinancialRules } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { financialRuleSchema } from "@/app/api/finance/rules/schema";

export async function GET() {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  try { return NextResponse.json({ ok: true, rules: await listFinancialRules(auth.session.userId, auth.session.tenantId) }); }
  catch (error) { return financeError(error, "rules.list"); }
}

export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  const parsed = financialRuleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json({ ok: true, rule: await createFinancialRule(auth.session.userId, auth.session.tenantId, parsed.data) }, { status: 201 }); }
  catch (error) { return financeError(error, "rules.create"); }
}
