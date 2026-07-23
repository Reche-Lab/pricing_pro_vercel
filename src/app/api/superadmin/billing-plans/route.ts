import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { listBillingPlans, upsertBillingPlan } from "@/repositories/billing";
import { isSuperAdmin } from "@/repositories/superadmin";

const billingPlanSchema = z.object({
  key: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(120),
  amountCents: z.number().int().min(100).max(10000000),
  active: z.boolean().default(true)
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const plans = await listBillingPlans();
  return NextResponse.json({ ok: true, plans });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = billingPlanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  try {
    const plan = await upsertBillingPlan({
      actorUserId: session.userId,
      key: parsed.data.key,
      name: parsed.data.name,
      amountCents: parsed.data.amountCents,
      active: parsed.data.active
    });
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar o preço base.";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Forbidden." ? 403 : 500 });
  }
}
