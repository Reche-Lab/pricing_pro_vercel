import { NextResponse } from "next/server";
import { getBillingAccess } from "@/repositories/billing";
import { isSuperAdmin } from "@/repositories/superadmin";

export async function requireWritableBilling(userId: string, tenantId: string): Promise<NextResponse | null> {
  if (await isSuperAdmin(userId)) return null;

  const access = await getBillingAccess(userId, tenantId);
  if (access.allowed) return null;

  return NextResponse.json(
    {
      ok: false,
      error: access.reason ?? "Regularize a assinatura para continuar.",
      billingRequired: true,
      billingStatus: access.billing_status
    },
    { status: 402 }
  );
}
