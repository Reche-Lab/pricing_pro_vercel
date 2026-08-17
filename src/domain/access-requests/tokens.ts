import crypto from "node:crypto";

export function createAccessRequestToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashAccessRequestToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeWhatsapp(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const withCountryCode = digits.length <= 11 ? `55${digits}` : digits;
  return `+${withCountryCode}`;
}
