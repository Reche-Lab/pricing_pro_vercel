import { NextResponse } from "next/server";
import { z } from "zod";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { requireWritableBilling } from "@/lib/billing/guard";
import { createFinancialNature, listFinancialNatures } from "@/repositories/finance";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["income", "expense", "neutral"]),
  defaultIncludeExternalCashFlow: z.boolean(),
  defaultIncludeOperatingResult: z.boolean()
});

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") !== "false";
    return NextResponse.json({ ok: true, natures: await listFinancialNatures(auth.session.userId, auth.session.tenantId, includeInactive) });
  } catch (error) { return financeError(error, "natures.list"); }
}

export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, nature: await createFinancialNature(auth.session.userId, auth.session.tenantId, parsed.data) }, { status: 201 });
  } catch (error) { return financeError(error, "natures.create"); }
}
