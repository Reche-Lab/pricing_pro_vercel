import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { applyTenantVoucher, changeTenantBillingPlan, extendTenantTrial } from "@/repositories/billing";
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
  }),
  z.object({
    action: z.literal("change_plan"),
    planId: z.string().uuid()
  })
]);

export async function PATCH(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const debugId = randomUUID();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, debugId, error: "Não autenticado." }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, debugId, error: "Acesso não autorizado." }, { status: 403 });

  const { tenantId } = await context.params;
  const id = z.string().uuid().safeParse(tenantId);
  if (!id.success) return NextResponse.json({ ok: false, debugId, error: "Tenant inválido." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = billingAdminSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, debugId, error: "Dados de cobrança inválidos.", details: parsed.error.flatten() }, { status: 400 });

  console.info("Superadmin tenant billing update started.", {
    debugId,
    tenantId,
    action: parsed.data.action,
    planId: parsed.data.action === "change_plan" ? parsed.data.planId : undefined
  });

  try {
    let result: Record<string, unknown> | undefined;
    if (parsed.data.action === "extend_trial") {
      await extendTenantTrial({
        actorUserId: session.userId,
        tenantId,
        endsAt: parsed.data.endsAt
      });
    } else if (parsed.data.action === "apply_voucher") {
      await applyTenantVoucher({
        actorUserId: session.userId,
        tenantId,
        discountPercent: parsed.data.discountPercent,
        expiresAt: parsed.data.expiresAt,
        note: parsed.data.note
      });
    } else {
      result = await changeTenantBillingPlan({
        actorUserId: session.userId,
        tenantId,
        planId: parsed.data.planId
      });
    }

    console.info("Superadmin tenant billing update completed.", {
      debugId,
      tenantId,
      action: parsed.data.action,
      result
    });
    return NextResponse.json({ ok: true, debugId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a cobrança.";
    const databaseError = error as { code?: string; detail?: string; hint?: string; where?: string };
    console.error("Superadmin tenant billing update failed.", {
      debugId,
      tenantId,
      action: parsed.data.action,
      planId: parsed.data.action === "change_plan" ? parsed.data.planId : undefined,
      message,
      code: databaseError.code,
      detail: databaseError.detail,
      hint: databaseError.hint,
      where: databaseError.where,
      stack: error instanceof Error ? error.stack : undefined
    });
    const status = message === "Forbidden." ? 403 : message.includes("not found") ? 404 : 500;
    const publicMessage = message === "Active billing plan not found."
      ? "O plano selecionado não existe ou está inativo."
      : message === "Tenant subscription not found."
        ? "O tenant ainda não possui uma assinatura configurada."
        : status === 500
          ? `Não foi possível atualizar a cobrança. Referência: ${debugId}`
          : message;
    return NextResponse.json(
      { ok: false, debugId, error: publicMessage },
      { status }
    );
  }
}
