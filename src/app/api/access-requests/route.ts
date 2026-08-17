import { NextResponse } from "next/server";
import { z } from "zod";
import { createAccessRequestToken, hashAccessRequestToken, normalizeWhatsapp } from "@/domain/access-requests/tokens";
import { getServerEnv } from "@/lib/env/server";
import { enforcePublicRateLimit, getPublicClientAddress } from "@/lib/security/public-rate-limit";
import { AccessRequestRateLimitError, createOrRefreshAccessRequest } from "@/repositories/access-requests";
import {
  sendAccessRequestConfirmationEmail,
  sendExistingAccountNotice
} from "@/services/email/invite-email";

const accessRequestSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(180),
  whatsapp: z.string().trim().min(10).max(30),
  companyName: z.string().trim().min(2).max(160),
  businessSegment: z.string().trim().max(120).optional().default(""),
  intendedUse: z.string().trim().max(1000).optional().default(""),
  privacyAccepted: z.literal(true),
  website: z.string().max(0).optional().default("")
});

export async function POST(request: Request) {
  const rateLimit = await enforcePublicRateLimit(request, "tenant-access-request", {
    action: "tenant_access_request.create",
    limit: 5,
    windowSeconds: 3600
  });
  if (rateLimit) return rateLimit;

  const parsed = accessRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Revise os campos obrigatórios e tente novamente." }, { status: 400 });
  }
  const whatsapp = normalizeWhatsapp(parsed.data.whatsapp);
  if (!whatsapp) return NextResponse.json({ ok: false, error: "Informe um WhatsApp válido com DDD." }, { status: 400 });

  const verificationToken = createAccessRequestToken();
  const publicToken = createAccessRequestToken();
  const appUrl = getServerEnv().APP_URL.replace(/\/$/, "");
  const verificationUrl = `${appUrl}/request-access/verify/${verificationToken}`;
  const statusUrl = `${appUrl}/request-access/status/${publicToken}`;

  try {
    const result = await createOrRefreshAccessRequest({
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      whatsapp,
      companyName: parsed.data.companyName,
      businessSegment: parsed.data.businessSegment || null,
      intendedUse: parsed.data.intendedUse || null,
      verificationTokenHash: hashAccessRequestToken(verificationToken),
      publicTokenHash: hashAccessRequestToken(publicToken),
      ipAddress: getPublicClientAddress(request),
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null
    });

    if (result.kind === "existing_user") {
      await sendExistingAccountNotice(parsed.data.email, parsed.data.fullName, `${appUrl}/login`);
    } else {
      await sendAccessRequestConfirmationEmail({
        to: parsed.data.email,
        name: parsed.data.fullName,
        companyName: parsed.data.companyName,
        verificationUrl,
        statusUrl
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Se o e-mail estiver disponível para cadastro, enviaremos as próximas instruções.",
      ...(process.env.NODE_ENV === "production" || result.kind === "existing_user" ? {} : { verificationUrl, statusUrl })
    });
  } catch (error) {
    if (error instanceof AccessRequestRateLimitError) {
      return NextResponse.json({ ok: false, error: "Muitas solicitações recentes. Aguarde antes de tentar novamente." }, { status: 429 });
    }
    console.error("Tenant access request creation failed.", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ ok: false, error: "Não foi possível registrar a solicitação agora." }, { status: 500 });
  }
}
