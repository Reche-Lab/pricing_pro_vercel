import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { isValidCpfOrCnpj } from "@/lib/validation/documents";
import { getTenantShippingProfile, updateTenantShippingProfile } from "@/repositories/tenant-settings";

const tenantSettingsSchema = z.object({
  name: z.string().trim().min(2).optional().nullable(),
  logoUrl: z.string().trim().url().optional().or(z.literal("")).nullable(),
  companyPhone: z.string().trim().optional().nullable(),
  companySite: z.string().trim().url().optional().or(z.literal("")).nullable(),
  companyDocument: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  addressNumber: z.string().trim().optional().nullable(),
  addressComplement: z.string().trim().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().max(2).optional().nullable()
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const tenant = await getTenantShippingProfile(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, tenant });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const body = await request.json().catch(() => null);
  const parsed = tenantSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.companyDocument && !isValidCpfOrCnpj(parsed.data.companyDocument)) {
    return NextResponse.json({ ok: false, error: "Invalid company document." }, { status: 400 });
  }

  const tenant = await updateTenantShippingProfile(session.userId, session.tenantId, {
    ...parsed.data,
    logoUrl: parsed.data.logoUrl || null,
    companySite: parsed.data.companySite || null
  });

  return NextResponse.json({ ok: true, tenant });
}
