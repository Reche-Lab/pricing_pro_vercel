import { createHash, timingSafeEqual } from "crypto";

export const PUBLIC_QUOTE_LINK_VALID_DAYS = 3;
export const PUBLIC_QUOTE_OTP_VALID_MINUTES = 30;

export function hashPublicQuoteOtp(token: string, code: string) {
  return createHash("sha256").update(`${token}\0${code}`).digest("hex");
}

export function verifyPublicQuoteOtp(token: string, code: string, expectedHash: string) {
  const actual = Buffer.from(hashPublicQuoteOtp(token, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function maskPublicEmail(value: string | null | undefined) {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function maskPublicPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}
