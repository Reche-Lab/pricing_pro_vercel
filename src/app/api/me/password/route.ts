import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getPasswordUserById, updateUserPassword } from "@/repositories/users";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8)
}).superRefine((data, context) => {
  if (data.newPassword !== data.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passwords do not match.",
      path: ["confirmPassword"]
    });
  }
  if (data.currentPassword === data.newPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "New password must be different.",
      path: ["newPassword"]
    });
  }
});

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await getPasswordUserById(session.userId);
  if (!user || user.status !== "active") return NextResponse.json({ ok: false }, { status: 401 });

  const validPassword = await verifyPassword(parsed.data.currentPassword, user.password_hash);
  if (!validPassword) {
    return NextResponse.json({ ok: false, error: "Current password is invalid." }, { status: 401 });
  }

  await updateUserPassword({
    actorUserId: session.userId,
    tenantId: session.tenantId,
    userId: session.userId,
    passwordHash: await hashPassword(parsed.data.newPassword),
    auditAction: "users.change_own_password"
  });

  return NextResponse.json({ ok: true });
}
