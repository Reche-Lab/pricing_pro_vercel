// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, PUT } from "@/app/api/commerce/admin/media/video/route";
import { requireCommerceAdmin } from "@/services/commerce/http";
import {
  beginCommerceVideo,
  completeCommerceVideo,
} from "@/services/commerce/video-media";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/http", async (original) => ({
  ...(await original<typeof import("@/services/commerce/http")>()),
  requireCommerceAdmin: vi.fn(),
}));
vi.mock("@/services/commerce/video-media", () => ({
  beginCommerceVideo: vi.fn(),
  completeCommerceVideo: vi.fn(),
}));
vi.mock("@/lib/security/public-rate-limit", () => ({
  enforcePublicRateLimit: vi.fn().mockResolvedValue(null),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("video authorization", () => {
  it.each([POST, PUT])("rejects anonymous video requests", async (handler) => {
    vi.stubEnv("APP_URL", "https://example.test");
    vi.mocked(requireCommerceAdmin).mockRejectedValue(
      new CommerceError("Entre na conta", 401),
    );
    const result = await handler(
      new Request("https://example.test/api/commerce/admin/media/video", {
        method: "POST",
        headers: { origin: "https://example.test" },
        body: "{}",
      }),
    );
    expect(result.status).toBe(401);
    expect(beginCommerceVideo).not.toHaveBeenCalled();
    expect(completeCommerceVideo).not.toHaveBeenCalled();
  });
  it.each([POST, PUT])("rejects cross-site video requests", async (handler) => {
    vi.stubEnv("APP_URL", "https://example.test");
    const result = await handler(
      new Request("https://example.test/api/commerce/admin/media/video", {
        method: "POST",
        headers: { origin: "https://attacker.test" },
        body: "{}",
      }),
    );
    expect(result.status).toBe(403);
    expect(requireCommerceAdmin).not.toHaveBeenCalled();
    expect(beginCommerceVideo).not.toHaveBeenCalled();
    expect(completeCommerceVideo).not.toHaveBeenCalled();
  });
});
