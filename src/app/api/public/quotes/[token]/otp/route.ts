import { NextResponse } from "next/server";
import { z } from "zod";
import { maskPublicEmail, PUBLIC_QUOTE_OTP_VALID_MINUTES } from "@/domain/quotes/public-security";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { renewPublicQuoteOtp } from "@/repositories/quotes";
import { sendPublicQuoteOtpEmail } from "@/services/email/invite-email";

const paramsSchema = z.object({ token: z.string().min(20).max(200) });

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false, error: "Link inválido." }, { status: 400 });
  const limited = await enforcePublicRateLimit(request, params.data.token, { action: "quote-otp", limit: 3, windowSeconds: 3600 });
  if (limited) return limited;
  const recipient = await renewPublicQuoteOtp(params.data.token);
  if (!recipient) return NextResponse.json({ ok: false, error: "Este orçamento não está disponível para confirmação." }, { status: 409 });
  const email = await sendPublicQuoteOtpEmail({ ...recipient, to: recipient.email, expiresMinutes: PUBLIC_QUOTE_OTP_VALID_MINUTES });
  if (!email.sent) return NextResponse.json({ ok: false, error: "Não foi possível enviar o código. Entre em contato com a empresa responsável." }, { status: 502 });
  return NextResponse.json({ ok: true, email: maskPublicEmail(recipient.email) });
}
