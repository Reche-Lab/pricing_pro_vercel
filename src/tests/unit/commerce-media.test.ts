// @vitest-environment node
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCommerceImage,
  commerceMediaSchema,
  uploadCommerceImage,
} from "@/services/commerce/media";
vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    SUPABASE_URL: "https://storage.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  }),
}));
afterEach(() => vi.unstubAllGlobals());

describe("commerce public media", () => {
  it("optimizes a transparent logo while preserving its proportions", async () => {
    const bytes = await sharp({
      create: {
        width: 800,
        height: 400,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const result = await normalizeCommerceImage({
      purpose: "logo",
      fileName: "logo.png",
      mimeType: "image/png",
      fileSize: bytes.length,
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    });
    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(256);
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects a forged file and never accepts a client-controlled storage path", async () => {
    const input = {
      purpose: "product" as const,
      fileName: "fake.png",
      mimeType: "image/png" as const,
      fileSize: 3,
      dataUrl: "data:image/png;base64,YWJj",
    };
    await expect(normalizeCommerceImage(input)).rejects.toThrow();
    expect(
      commerceMediaSchema.safeParse({
        ...input,
        tenantId: crypto.randomUUID(),
        path: "another-tenant/logo.png",
      }).success,
    ).toBe(false);
    expect(
      commerceMediaSchema.safeParse({ ...input, fileSize: 3145729 }).success,
    ).toBe(false);
  });
  it("stores under the authenticated tenant with a fresh path, not the user file name", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", request);
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const tenant = crypto.randomUUID();
    const result = await uploadCommerceImage(tenant, {
      purpose: "product",
      fileName: "../another-tenant/logo.png",
      mimeType: "image/png",
      fileSize: bytes.length,
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    });
    expect(result.url).toMatch(
      new RegExp(
        `^https://storage.example.test/storage/v1/object/public/commerce-media/${tenant}/product/[a-f0-9-]+\\.webp$`,
      ),
    );
    expect(request).toHaveBeenCalledWith(
      result.url.replace("/object/public/", "/object/"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "image/webp",
          "x-upsert": "false",
        }),
      }),
    );
  });
});
