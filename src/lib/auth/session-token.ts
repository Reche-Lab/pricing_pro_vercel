import { SignJWT, jwtVerify } from "jose";

export type AppSession = {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  requiresTerms?: boolean;
  acceptedTermsVersion?: string | null;
};

export async function createSessionToken(session: AppSession): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<AppSession | null> {
  try {
    const verified = await jwtVerify(token, secretKey());
    const payload = verified.payload;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string"
    ) return null;
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
      requiresTerms: payload.requiresTerms === true,
      acceptedTermsVersion: typeof payload.acceptedTermsVersion === "string" ? payload.acceptedTermsVersion : null
    };
  } catch {
    return null;
  }
}

export function sessionCookieName(): string {
  return process.env.COOKIE_NAME || "pricing_session";
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Invalid auth environment: AUTH_SECRET");
  return new TextEncoder().encode(secret);
}
