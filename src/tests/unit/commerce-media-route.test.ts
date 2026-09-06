// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/commerce/admin/media/route";
import { requireCommerceAdmin } from "@/services/commerce/http";
import { uploadCommerceImage } from "@/services/commerce/media";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/http", async (original) => ({
  ...(await original<typeof import("@/services/commerce/http")>()),
  requireCommerceAdmin: vi.fn(),
}));
vi.mock("@/services/commerce/media", async (original) => ({
  ...(await original<typeof import("@/services/commerce/media")>()),
  uploadCommerceImage: vi.fn(),
}));
vi.mock("@/lib/security/public-rate-limit", () => ({
  enforcePublicRateLimit: vi.fn().mockResolvedValue(null),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("commerce media endpoint authorization", () => {
  it("rejects unauthenticated uploads before touching storage", async () => {
    vi.stubEnv("APP_URL", "https://example.test");
    vi.mocked(requireCommerceAdmin).mockRejectedValue(
      new CommerceError("Entre na conta administrativa.", 401),
    );
    const response = await POST(
      new Request("https://example.test/api/commerce/admin/media", {
        method: "POST",
        headers: { origin: "https://example.test" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    expect(uploadCommerceImage).not.toHaveBeenCalled();
  });
  it("rejects cross-site uploads before loading the administrator", async () => {
    vi.stubEnv("APP_URL", "https://example.test");
    const response = await POST(
      new Request("https://example.test/api/commerce/admin/media", {
        method: "POST",
        headers: { origin: "https://attacker.test" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(requireCommerceAdmin).not.toHaveBeenCalled();
  });
});
