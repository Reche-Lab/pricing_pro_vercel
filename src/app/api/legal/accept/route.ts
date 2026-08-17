import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession, setSessionCookie } from "@/lib/auth/session";
import { getPublicClientAddress } from "@/lib/security/public-rate-limit";
import { acceptLegalTerm, markLegalAcceptanceEmailSent } from "@/repositories/legal-terms";
import { getSessionProfile } from "@/repositories/users";
import { sendLegalTermsAcceptanceEmail } from "@/services/email/invite-email";

const schema = z.object({ termId: z.string().uuid(), accepted: z.literal(true), representsCompany: z.literal(true) });

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Confirme a leitura e sua autorização para continuar." }, { status: 400 });
  const profile = await getSessionProfile(session.userId, session.tenantId);
  if (!profile) return NextResponse.json({ ok: false, error: "Acesso ao tenant não encontrado." }, { status: 403 });

  try {
    const result = await acceptLegalTerm({
      userId: profile.user_id,
      tenantId: profile.tenant_id,
      termId: parsed.data.termId,
      email: profile.email,
      userName: profile.name,
      role: profile.role,
      ipAddress: getPublicClientAddress(request),
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null
    });
    const email = await sendLegalTermsAcceptanceEmail({
      to: profile.email,
      name: profile.name,
      tenantName: result.tenantName,
      termTitle: result.term.title,
      termVersion: result.term.version,
      acceptedAt: result.acceptedAt,
      ipAddress: getPublicClientAddress(request),
      contentText: result.term.content_text
    });
    if (email.sent) await markLegalAcceptanceEmailSent(result.acceptanceId);
    await setSessionCookie({
      userId: session.userId,
      tenantId: session.tenantId,
      email: session.email,
      role: session.role,
      requiresTerms: true,
      acceptedTermsVersion: result.term.version
    });
    return NextResponse.json({ ok: true, next: "/onboarding", emailSent: email.sent });
  } catch (error) {
    console.error("Legal terms acceptance failed.", { userId: session.userId, tenantId: session.tenantId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, error: "Não foi possível registrar o aceite." }, { status: 500 });
  }
}
