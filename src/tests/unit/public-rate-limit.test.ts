import { describe, expect, it } from "vitest";
import { getPublicClientAddress } from "@/lib/security/public-rate-limit";

describe("public rate limit", () => {
  it("uses the first trusted proxy address without retaining the full chain", () => {
    const request = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" } });
    expect(getPublicClientAddress(request)).toBe("203.0.113.10");
  });

  it("falls back without exposing missing address data", () => {
    expect(getPublicClientAddress(new Request("https://example.com"))).toBe("unknown");
  });
});
