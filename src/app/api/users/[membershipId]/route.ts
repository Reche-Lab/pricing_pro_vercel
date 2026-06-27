import { NextResponse } from "next/server";
import { z } from "zod";
import { canAssignRole, canManageMember, isMemberStatus } from "@/domain/users/access";
import { getCurrentSession } from "@/lib/auth/session";
import {
  countActiveOwners,
  getSessionProfile,
  getTenantMember,
  removeTenantMember,
  updateTenantMember,
  userHasPermission
} from "@/repositories/users";

const updateMemberSchema = z.object({
  roleKey: z.string().trim().optional(),
  status: z.enum(["active", "invited", "blocked"]).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ membershipId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { membershipId } = await context.params;
  const id = z.string().uuid().safeParse(membershipId);
  if (!id.success) return NextResponse.json({ ok: false, error: "Invalid membership id." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const [allowed, profile, target] = await Promise.all([
    userHasPermission(session.userId, session.tenantId, "users:manage"),
    getSessionProfile(session.userId, session.tenantId),
    getTenantMember(session.userId, session.tenantId, membershipId)
  ]);

  if (!allowed || !profile) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  if (!target) return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
  if (!canManageMember({ userId: session.userId, role: profile.role }, { userId: target.user_id, role: target.role_key })) {
    return NextResponse.json({ ok: false, error: "Member cannot be managed by current user." }, { status: 403 });
  }

  if (parsed.data.roleKey && !canAssignRole(profile.role, parsed.data.roleKey)) {
    return NextResponse.json({ ok: false, error: "Role is not assignable by current user." }, { status: 403 });
  }

  const demotingOrBlockingOwner =
    target.role_key === "owner" &&
    ((parsed.data.roleKey && parsed.data.roleKey !== "owner") ||
      (parsed.data.status && isMemberStatus(parsed.data.status) && parsed.data.status !== "active"));
  if (demotingOrBlockingOwner && (await countActiveOwners(session.userId, session.tenantId)) <= 1) {
    return NextResponse.json({ ok: false, error: "Cannot remove the last active owner." }, { status: 409 });
  }

  const member = await updateTenantMember(session.userId, session.tenantId, {
    membershipId,
    roleKey: parsed.data.roleKey,
    status: parsed.data.status
  });

  return NextResponse.json({ ok: true, member });
}

export async function DELETE(_request: Request, context: { params: Promise<{ membershipId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { membershipId } = await context.params;
  const id = z.string().uuid().safeParse(membershipId);
  if (!id.success) return NextResponse.json({ ok: false, error: "Invalid membership id." }, { status: 400 });

  const [allowed, profile, target] = await Promise.all([
    userHasPermission(session.userId, session.tenantId, "users:manage"),
    getSessionProfile(session.userId, session.tenantId),
    getTenantMember(session.userId, session.tenantId, membershipId)
  ]);

  if (!allowed || !profile) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  if (!target) return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
  if (!canManageMember({ userId: session.userId, role: profile.role }, { userId: target.user_id, role: target.role_key })) {
    return NextResponse.json({ ok: false, error: "Member cannot be managed by current user." }, { status: 403 });
  }
  if (target.role_key === "owner" && target.member_status === "active" && (await countActiveOwners(session.userId, session.tenantId)) <= 1) {
    return NextResponse.json({ ok: false, error: "Cannot remove the last active owner." }, { status: 409 });
  }

  await removeTenantMember(session.userId, session.tenantId, membershipId);
  return NextResponse.json({ ok: true });
}
