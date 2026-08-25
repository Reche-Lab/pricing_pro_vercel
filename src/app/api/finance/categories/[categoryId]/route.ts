import { NextResponse } from "next/server";
import { z } from "zod";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { requireWritableBilling } from "@/lib/billing/guard";
import { deactivateFinancialCategory, updateFinancialCategory } from "@/repositories/finance";

const paramsSchema = z.object({ categoryId: z.string().uuid() });
const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["income", "expense", "neutral"]),
  parentId: z.string().uuid().nullable().optional(),
  affectsOperatingResult: z.boolean(),
  olistCategoryId: z.string().trim().max(100).nullable().optional(),
  active: z.boolean().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ categoryId: string }> }) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const [params, body] = await Promise.all([context.params, request.json().catch(() => null)]);
  const parsedParams = paramsSchema.safeParse(params);
  const parsedBody = categorySchema.safeParse(body);
  if (!parsedParams.success || !parsedBody.success) {
    return NextResponse.json({ ok: false, error: "Dados da categoria inválidos." }, { status: 400 });
  }
  try {
    const category = await updateFinancialCategory(auth.session.userId, auth.session.tenantId, parsedParams.data.categoryId, parsedBody.data);
    return NextResponse.json({ ok: true, category });
  } catch (error) { return financeError(error, "categories.update"); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ categoryId: string }> }) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Categoria inválida." }, { status: 400 });
  try {
    const result = await deactivateFinancialCategory(auth.session.userId, auth.session.tenantId, parsed.data.categoryId);
    return NextResponse.json({ ok: true, result });
  } catch (error) { return financeError(error, "categories.delete"); }
}
