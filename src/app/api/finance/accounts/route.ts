import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWritableBilling } from "@/lib/billing/guard";
import { listFinancialAccounts, upsertFinancialAccount } from "@/repositories/finance";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

const schema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(2).max(100),
  institution: z.string().trim().min(2).max(80), accountType: z.string().trim().min(2).max(40).default("checking"),
  currency: z.string().trim().length(3).default("BRL"),
  ownershipType: z.enum(["company", "owner", "partner", "personal", "third_party"]).default("company"),
  sameEconomicEntity: z.boolean().default(true), requiredForMonthlyClose: z.boolean().default(true),
  olistAccountId: z.string().trim().max(100).nullable().optional()
});

export async function GET() {
  const auth = await requireFinancePermission("finance:read");
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ ok: true, accounts: await listFinancialAccounts(auth.session.userId, auth.session.tenantId) });
  } catch (error) { return financeError(error, "accounts.list"); }
}

export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, account: await upsertFinancialAccount(auth.session.userId, auth.session.tenantId, parsed.data) }, { status: 201 });
  } catch (error) { return financeError(error, "accounts.upsert"); }
}

