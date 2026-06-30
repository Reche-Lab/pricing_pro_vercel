import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { applyTenantVoucher, extendTenantTrial } from "@/repositories/billing";
import { isSuperAdmin } from "@/repositories/superadmin";

const billingAdminSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("extend_trial"),
    endsAt: z.string().datetime()
  }),
  z.object({
    action: z.literal("apply_voucher"),
    discountPercent: z.number().min(1).max(100),
    expiresAt: z.string().datetime(),
    note: z.string().trim().max(240).optional().nullable()
  })
]);

export async function PATCH(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const { tenantId } = await context.params;
  const id = z.string().uuid().safeParse(tenantId);
  if (!id.success) return NextResponse.json({ ok: false, error: "Invalid tenant id." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = billingAdminSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.action === "extend_trial") {
    await extendTenantTrial({
      actorUserId: session.userId,
      tenantId,
      endsAt: parsed.data.endsAt
    });
  } else {
    await applyTenantVoucher({
      actorUserId: session.userId,
      tenantId,
      discountPercent: parsed.data.discountPercent,
      expiresAt: parsed.data.expiresAt,
      note: parsed.data.note
    });
  }

  return NextResponse.json({ ok: true });
}
