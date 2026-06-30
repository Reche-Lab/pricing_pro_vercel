import { NextResponse } from "next/server";
import { z } from "zod";
import { createInviteToken } from "@/domain/users/invites";
import { hashPassword } from "@/lib/auth/password";
import { findPasswordUserByEmail, updateUserPassword } from "@/repositories/users";
import { sendPasswordResetEmail } from "@/services/email/invite-email";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email()
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid email." }, { status: 400 });
  }

  const genericResponse = NextResponse.json({
    ok: true,
    message: "If the email exists, a new temporary password will be sent."
  });

  const user = await findPasswordUserByEmail(parsed.data.email);
  if (!user || user.status !== "active") return genericResponse;

  const temporaryPassword = createTemporaryPassword();
  const emailDelivery = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    temporaryPassword
  });
  if (!emailDelivery.sent) return genericResponse;

  await updateUserPassword({
    userId: user.id,
    passwordHash: await hashPassword(temporaryPassword)
  });

  return genericResponse;
}

function createTemporaryPassword() {
  return `Pp-${createInviteToken().slice(0, 14)}1!`;
}
