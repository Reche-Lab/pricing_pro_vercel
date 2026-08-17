import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { findUserWithDefaultMembership } from "@/repositories/users";
import { getAcceptedActiveLegalTermVersion } from "@/repositories/legal-terms";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 400 });
  }

  const user = await findUserWithDefaultMembership(parsed.data.email);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  const validPassword = await verifyPassword(parsed.data.password, user.password_hash);
  if (!validPassword) {
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  const acceptedTermsVersion = user.requires_legal_acceptance
    ? await getAcceptedActiveLegalTermVersion(user.id, user.tenant_id)
    : null;
  await setSessionCookie({
    userId: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    role: user.role_key,
    requiresTerms: user.requires_legal_acceptance,
    acceptedTermsVersion
  });

  return NextResponse.json({ ok: true, next: user.requires_legal_acceptance && !acceptedTermsVersion ? "/terms" : "/dashboard" });
}
