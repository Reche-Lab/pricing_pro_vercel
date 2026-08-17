import { NextResponse } from "next/server";
import { z } from "zod";
import { createInviteToken, hashInviteToken, buildInviteUrl } from "@/domain/users/invites";
import { createAccessRequestToken, hashAccessRequestToken } from "@/domain/access-requests/tokens";
import { hashPassword } from "@/lib/auth/password";
import { getCurrentSession } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import { approveAccessRequest, reviewAccessRequest } from "@/repositories/access-requests";
import { isSuperAdmin } from "@/repositories/superadmin";
import { sendAccessRequestReviewEmail, sendInviteEmail } from "@/services/email/invite-email";

const reviewSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    tenantSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    planId: z.string().uuid(),
    trialDays: z.number().int().min(1).max(365),
    artworkAiGenerationLimit: z.number().int().min(0).max(100)
  }),
  z.object({ action: z.literal("needs_information"), message: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal("reject"), message: z.string().trim().min(5).max(1000) })
]);

export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403 });
  const { requestId } = await context.params;
  if (!z.string().uuid().safeParse(requestId).success) return NextResponse.json({ ok: false, error: "Solicitação inválida." }, { status: 400 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Revise os dados da decisão." }, { status: 400 });

  try {
    if (parsed.data.action === "approve") {
      const temporaryPasswordHash = await hashPassword(createInviteToken());
      const inviteToken = createInviteToken();
      const approved = await approveAccessRequest({
        actorUserId: session.userId,
        requestId,
        tenantSlug: parsed.data.tenantSlug,
        planId: parsed.data.planId,
        trialDays: parsed.data.trialDays,
        artworkAiGenerationLimit: parsed.data.artworkAiGenerationLimit,
        temporaryPasswordHash,
        inviteTokenHash: hashInviteToken(inviteToken)
      });
      const inviteUrl = buildInviteUrl(getServerEnv().APP_URL, inviteToken);
      const emailDelivery = await sendInviteEmail({
        to: approved.ownerEmail,
        name: approved.ownerName,
        tenantName: approved.tenantName,
        inviteUrl,
        roleName: approved.roleName
      });
      return NextResponse.json({ ok: true, status: "approved", tenantId: approved.tenantId, inviteUrl, emailDelivery });
    }

    const nextStatus = parsed.data.action === "reject" ? "rejected" : "needs_information";
    const publicToken = createAccessRequestToken();
    const reviewed = await reviewAccessRequest({
      actorUserId: session.userId,
      requestId,
      status: nextStatus,
      message: parsed.data.message,
      publicTokenHash: hashAccessRequestToken(publicToken)
    });
    const emailDelivery = await sendAccessRequestReviewEmail({
      to: reviewed.email,
      name: reviewed.full_name,
      companyName: reviewed.company_name,
      status: nextStatus,
      message: parsed.data.message,
      statusUrl: `${getServerEnv().APP_URL.replace(/\/$/, "")}/request-access/status/${publicToken}`
    });
    return NextResponse.json({ ok: true, status: nextStatus, emailDelivery });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível revisar a solicitação.";
    console.error("Superadmin access request review failed.", { requestId, action: parsed.data.action, message });
    const conflict = message.includes("duplicate key") || message.includes("unique constraint");
    return NextResponse.json(
      { ok: false, error: conflict ? "O slug ou e-mail já está vinculado a outro cadastro." : message },
      { status: conflict ? 409 : 500 }
    );
  }
}
