import { NextResponse } from "next/server";
import { simulateFinancialRule } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { competenceSchema, financialRuleSchema } from "@/app/api/finance/rules/schema";

const schema = financialRuleSchema.extend({ competence: competenceSchema });
export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const { competence, ...rule } = parsed.data;
  try { return NextResponse.json({ ok: true, simulation: await simulateFinancialRule(auth.session.userId, auth.session.tenantId, competence, rule) }); }
  catch (error) { return financeError(error, "rules.simulate"); }
}
