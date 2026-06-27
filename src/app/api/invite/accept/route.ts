import { NextResponse } from "next/server";
import { z } from "zod";
import { hashInviteToken } from "@/domain/users/invites";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { acceptUserInvite, getSessionProfile } from "@/repositories/users";

const acceptInviteSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = acceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const accepted = await acceptUserInvite(hashInviteToken(parsed.data.token), passwordHash);
  if (!accepted) {
    return NextResponse.json({ ok: false, error: "Invite is invalid or expired." }, { status: 404 });
  }

  const profile = await getSessionProfile(accepted.user_id, accepted.tenant_id);
  if (!profile) return NextResponse.json({ ok: false, error: "Invite accepted but login failed." }, { status: 409 });

  await setSessionCookie({
    userId: profile.user_id,
    tenantId: profile.tenant_id,
    email: profile.email,
    role: profile.role
  });

  return NextResponse.json({ ok: true });
}
