import { NextResponse } from "next/server";
import { z } from "zod";
import { closeFinancialMonth, reopenFinancialMonth } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

const schema = z.object({ competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), action: z.enum(["close", "reopen"]), force: z.boolean().default(false), notes: z.string().trim().max(1000).optional() });
export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:close");
  if ("response" in auth) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try {
    const result = parsed.data.action === "close"
      ? await closeFinancialMonth(auth.session.userId, auth.session.tenantId, parsed.data)
      : await reopenFinancialMonth(auth.session.userId, auth.session.tenantId, parsed.data.competence, parsed.data.notes ?? "");
    return NextResponse.json({ ok: true, result });
  } catch (error) { return financeError(error, "month.status"); }
}
