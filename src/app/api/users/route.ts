import { NextResponse } from "next/server";
import { z } from "zod";
import { canAssignRole } from "@/domain/users/access";
import { buildInviteUrl, createInviteToken, hashInviteToken } from "@/domain/users/invites";
import { getCurrentSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { getServerEnv } from "@/lib/env/server";
import {
  createUserInvite,
  createOrInviteTenantMember,
  getSessionProfile,
  listRoles,
  listTenantMembers,
  userHasPermission
} from "@/repositories/users";

const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().optional().nullable(),
  roleKey: z.string().trim().min(1),
  memberStatus: z.enum(["active", "invited"]).default("active")
}).superRefine((data, context) => {
  if (data.memberStatus === "active" && (!data.password || data.password.length < 8)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password with at least 8 characters is required for active users.",
      path: ["password"]
    });
  }
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const allowed = await userHasPermission(session.userId, session.tenantId, "users:manage");
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const [members, roles] = await Promise.all([
    listTenantMembers(session.userId, session.tenantId),
    listRoles(session.userId, session.tenantId)
  ]);

  return NextResponse.json({ ok: true, members, roles });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const [allowed, profile] = await Promise.all([
    userHasPermission(session.userId, session.tenantId, "users:manage"),
    getSessionProfile(session.userId, session.tenantId)
  ]);
  if (!allowed || !profile) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  if (!canAssignRole(profile.role, parsed.data.roleKey)) {
    return NextResponse.json({ ok: false, error: "Role is not assignable by current user." }, { status: 403 });
  }

  const temporaryPassword = parsed.data.password || createInviteToken();
  const passwordHash = await hashPassword(temporaryPassword);
  const member = await createOrInviteTenantMember(session.userId, session.tenantId, {
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash,
    roleKey: parsed.data.roleKey,
    memberStatus: parsed.data.memberStatus
  });

  let inviteUrl: string | null = null;
  if (parsed.data.memberStatus === "invited") {
    const token = createInviteToken();
    await createUserInvite(session.userId, session.tenantId, {
      userId: member.user_id,
      membershipId: member.membership_id,
      tokenHash: hashInviteToken(token),
      ttlDays: 7
    });
    inviteUrl = buildInviteUrl(getServerEnv().APP_URL, token);
  }

  return NextResponse.json({ ok: true, member, inviteUrl }, { status: 201 });
}
