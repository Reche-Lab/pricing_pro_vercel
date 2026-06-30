import { NextResponse } from "next/server";
import { z } from "zod";
import { buildInviteUrl, createInviteToken, hashInviteToken } from "@/domain/users/invites";
import { getCurrentSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { getServerEnv } from "@/lib/env/server";
import { createTenantWithOwner, isSuperAdmin, listSuperadminTenants } from "@/repositories/superadmin";
import { createUserInvite } from "@/repositories/users";
import { sendInviteEmail } from "@/services/email/invite-email";

const createTenantSchema = z.object({
  tenantName: z.string().trim().min(2),
  tenantSlug: z.string().trim().min(2).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ownerName: z.string().trim().min(2),
  ownerEmail: z.string().trim().email()
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const tenants = await listSuperadminTenants();
  return NextResponse.json({ ok: true, tenants });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  try {
    const temporaryPasswordHash = await hashPassword(createInviteToken());
    const created = await createTenantWithOwner({
      actorUserId: session.userId,
      tenantName: parsed.data.tenantName,
      tenantSlug: parsed.data.tenantSlug,
      ownerName: parsed.data.ownerName,
      ownerEmail: parsed.data.ownerEmail,
      ownerPasswordHash: temporaryPasswordHash
    });

    const token = createInviteToken();
    await createUserInvite(session.userId, created.tenantId, {
      userId: created.ownerUserId,
      membershipId: created.membershipId,
      tokenHash: hashInviteToken(token),
      ttlDays: 7
    });
    const inviteUrl = buildInviteUrl(getServerEnv().APP_URL, token);
    const emailDelivery = await sendInviteEmail({
      to: parsed.data.ownerEmail,
      name: parsed.data.ownerName,
      tenantName: created.tenantName,
      inviteUrl,
      roleName: created.roleName
    });

    return NextResponse.json({ ok: true, tenant: created, inviteUrl, emailDelivery }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tenant creation failed.";
    const isConflict = message.includes("duplicate key") || message.includes("unique constraint");
    return NextResponse.json(
      { ok: false, error: isConflict ? "Tenant slug or owner email already exists." : message },
      { status: isConflict ? 409 : 500 }
    );
  }
}
