import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { getServerEnv } from "@/lib/env/server";
import { PUBLIC_QUOTE_OTP_VALID_MINUTES } from "@/domain/quotes/public-security";
import { createPublicQuoteLink, getActivePublicQuoteLink, revokePublicQuoteLink } from "@/repositories/quotes";
import { sendPublicQuoteOtpEmail } from "@/services/email/invite-email";

const publicLinkSchema = z.object({
  requireOtp: z.boolean().optional().default(false)
});

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const { quoteId } = await context.params;
  if (!z.string().uuid().safeParse(quoteId).success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  const result = await getActivePublicQuoteLink(session.userId, session.tenantId, quoteId);
  if (!result) return NextResponse.json({ ok: true, active: false });
  const url = result.token ? `${getServerEnv().APP_URL.replace(/\/$/, "")}/q/${result.token}` : null;
  return NextResponse.json({ ok: true, active: true, url, expiresAt: result.expiresAt, requireOtp: result.requireOtp });
}

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = publicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createPublicQuoteLink(session.userId, session.tenantId, quoteId, { requireOtp: parsed.data.requireOtp });
    if (result.otpCode && result.recipient) {
      const email = await sendPublicQuoteOtpEmail({
        to: result.recipient.email,
        name: result.recipient.name,
        tenantName: result.recipient.tenantName,
        code: result.otpCode,
        expiresMinutes: PUBLIC_QUOTE_OTP_VALID_MINUTES
      });
      if (!email.sent) {
        await revokePublicQuoteLink(session.userId, session.tenantId, quoteId);
        return NextResponse.json({ ok: false, error: `Não foi possível enviar o código por e-mail. ${email.message}` }, { status: 502 });
      }
    }
    const url = `${getServerEnv().APP_URL.replace(/\/$/, "")}/q/${result.token}`;
    return NextResponse.json({ ok: true, url, expiresAt: result.expiresAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create public quote link." },
      { status: 409 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const { quoteId } = await context.params;
  if (!z.string().uuid().safeParse(quoteId).success) return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  const revoked = await revokePublicQuoteLink(session.userId, session.tenantId, quoteId);
  return NextResponse.json({ ok: true, revoked });
}
