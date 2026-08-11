import { describe, expect, it } from "vitest";
import {
  hashPublicQuoteOtp,
  maskPublicEmail,
  maskPublicPhone,
  PUBLIC_QUOTE_LINK_VALID_DAYS,
  verifyPublicQuoteOtp
} from "@/domain/quotes/public-security";

describe("public quote security", () => {
  it("keeps the public link lifetime fixed at three days", () => {
    expect(PUBLIC_QUOTE_LINK_VALID_DAYS).toBe(3);
  });

  it("verifies an OTP without storing the clear code", () => {
    const hash = hashPublicQuoteOtp("public-token", "123456");
    expect(hash).not.toContain("123456");
    expect(verifyPublicQuoteOtp("public-token", "123456", hash)).toBe(true);
    expect(verifyPublicQuoteOtp("public-token", "654321", hash)).toBe(false);
  });

  it("masks contact information shown on the public page", () => {
    expect(maskPublicEmail("cliente@example.com")).toBe("cl*****@example.com");
    expect(maskPublicPhone("+55 (12) 99700-3322")).toBe("***3322");
  });
});
