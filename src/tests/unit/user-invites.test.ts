import { describe, expect, it } from "vitest";
import { buildInviteUrl, createInviteToken, hashInviteToken } from "@/domain/users/invites";

describe("user invite tokens", () => {
  it("creates url-safe tokens and hashes them deterministically", () => {
    const token = createInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toBe(token);
  });

  it("builds invite URLs from app URL and token", () => {
    expect(buildInviteUrl("https://app.example.com/", "abc123")).toBe("https://app.example.com/invite/abc123");
  });
});
