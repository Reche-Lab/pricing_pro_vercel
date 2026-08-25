import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyFinancialTransactions } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

const schema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500), nature: z.string().trim().min(2).max(60),
  categoryId: z.string().uuid().nullable().optional(), includeExternalCashFlow: z.boolean(),
  includeOperatingResult: z.boolean(), notes: z.string().trim().max(500).optional(),
  createRule: z.object({ name: z.string().trim().min(3).max(100), descriptionContains: z.string().trim().min(2).max(200) }).optional()
});

export async function PATCH(request: Request) {
  const auth = await requireFinancePermission("finance:classify");
  if ("response" in auth) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json({ ok: true, result: await classifyFinancialTransactions(auth.session.userId, auth.session.tenantId, parsed.data) }); }
  catch (error) { return financeError(error, "transactions.classify"); }
}

