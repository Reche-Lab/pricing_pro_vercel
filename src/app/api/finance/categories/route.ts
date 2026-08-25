import { NextResponse } from "next/server";
import { z } from "zod";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { requireWritableBilling } from "@/lib/billing/guard";
import { createFinancialCategory, listFinancialCategories } from "@/repositories/finance";

const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com ao menos 2 caracteres.").max(100),
  type: z.enum(["income", "expense", "neutral"]),
  parentId: z.string().uuid().nullable().optional(),
  affectsOperatingResult: z.boolean(),
  olistCategoryId: z.string().trim().max(100).nullable().optional()
});

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") !== "false";
    const categories = await listFinancialCategories(auth.session.userId, auth.session.tenantId, includeInactive);
    return NextResponse.json({ ok: true, categories });
  } catch (error) { return financeError(error, "categories.list"); }
}

export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = categorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try {
    const category = await createFinancialCategory(auth.session.userId, auth.session.tenantId, parsed.data);
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (error) { return financeError(error, "categories.create"); }
}
