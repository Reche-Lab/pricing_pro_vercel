import { NextResponse } from "next/server";
import { z } from "zod";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { requireWritableBilling } from "@/lib/billing/guard";
import { deactivateFinancialNature, updateFinancialNature } from "@/repositories/finance";

const paramsSchema = z.object({ natureId: z.string().uuid() });
const schema = z.object({
  name: z.string().trim().min(2).max(100), type: z.enum(["income", "expense", "neutral"]),
  defaultIncludeExternalCashFlow: z.boolean(), defaultIncludeOperatingResult: z.boolean(), active: z.boolean().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ natureId: string }> }) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const [params, body] = await Promise.all([context.params, request.json().catch(() => null)]);
  const parsedParams = paramsSchema.safeParse(params); const parsedBody = schema.safeParse(body);
  if (!parsedParams.success || !parsedBody.success) return NextResponse.json({ ok: false, error: "Dados da natureza inválidos." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, nature: await updateFinancialNature(auth.session.userId, auth.session.tenantId, parsedParams.data.natureId, parsedBody.data) });
  } catch (error) { return financeError(error, "natures.update"); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ natureId: string }> }) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Natureza inválida." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, result: await deactivateFinancialNature(auth.session.userId, auth.session.tenantId, parsed.data.natureId) });
  } catch (error) { return financeError(error, "natures.delete"); }
}
