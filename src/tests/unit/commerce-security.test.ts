// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyMpWebhook } from "@/services/commerce/payments";
import {
  checkCommerceOrigin,
  readCommerceBody,
} from "@/services/commerce/http";
import { z } from "zod";
describe("commerce boundary validation", () => {
  it("verifies the canonical payment webhook manifest without accepting forged IDs", () => {
    const signature = createHmac("sha256", "secret")
      .update("id:123;request-id:request-42;ts:1234567890;")
      .digest("hex");
    const headers = new Headers({
      "x-request-id": "request-42",
      "x-signature": `ts=1234567890,v1=${signature}`,
    });
    expect(verifyMpWebhook(headers, "123", "secret")).toBe(true);
    expect(verifyMpWebhook(headers, "124", "secret")).toBe(false);
    expect(verifyMpWebhook(headers, "123", "other-secret")).toBe(false);
  });
  it("rejects cross origin browser mutations", () => {
    vi.stubEnv("APP_URL", "https://shop.example.test");
    expect(() =>
      checkCommerceOrigin(
        new Request("https://shop.example.test/api", {
          headers: { origin: "https://attacker.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkCommerceOrigin(
        new Request("https://shop.example.test/api", {
          headers: { origin: "https://shop.example.test" },
        }),
      ),
    ).not.toThrow();
    vi.unstubAllEnvs();
  });
  it("rejects oversized bodies before JSON parsing", async () => {
    await expect(
      readCommerceBody(
        new Request("https://shop.example.test", {
          method: "POST",
          body: JSON.stringify({ text: "x".repeat(500) }),
        }),
        z.object({ text: z.string() }),
        100,
      ),
    ).rejects.toThrow("grande");
  });
});
