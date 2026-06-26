import { describe, expect, it } from "vitest";
import { decryptTenantSecret, encryptTenantSecret } from "@/lib/crypto/secrets";

describe("tenant secret encryption", () => {
  it("encrypts and decrypts tenant credentials", () => {
    const credentials = {
      token: "correios-token",
      clientSecret: "olist-secret"
    };

    const encrypted = encryptTenantSecret(credentials);

    expect(encrypted).not.toContain(credentials.token);
    expect(decryptTenantSecret<typeof credentials>(encrypted)).toEqual(credentials);
  });
});
